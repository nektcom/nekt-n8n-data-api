import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { ApplicationError, NodeOperationError } from 'n8n-workflow';
import { ParquetReader } from '@dsnp/parquetjs';

const BASE_URL = 'https://app.nekt.ai';
const POLL_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PollResult extends IDataObject {
	status: string;
}

async function poll<T extends PollResult>(
	fn: () => Promise<T>,
	isComplete: (r: T) => boolean,
	isFailed: (r: T) => boolean,
	timeoutMs: number,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = await fn();
		if (isComplete(result)) return result;
		if (isFailed(result)) throw new ApplicationError(`Operation failed with status: ${result.status}`);
		await sleep(POLL_INTERVAL_MS);
	}
	throw new ApplicationError(`Timed out after ${Math.round(timeoutMs / 60_000)} minutes`);
}

async function downloadBuffer(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new ApplicationError(`Failed to download file: ${response.status} ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

async function parseParquet(buffer: Buffer): Promise<IDataObject[]> {
	const reader = await ParquetReader.openBuffer(buffer);
	const cursor = reader.getCursor();
	const records: IDataObject[] = [];
	let record: IDataObject | null;
	while ((record = (await cursor.next()) as IDataObject | null) !== null) {
		records.push(record);
	}
	await reader.close();
	return records;
}

async function runQuery(
	context: IExecuteFunctions,
	itemIndex: number,
	headers: Record<string, string>,
	returnData: INodeExecutionData[],
): Promise<void> {
	const sqlQuery = context.getNodeParameter('sqlQuery', itemIndex) as string;
	const outputFormat = context.getNodeParameter('outputFormat', itemIndex) as string;

	const response = (await context.helpers.httpRequest({
		method: 'POST',
		url: `${BASE_URL}/api/v1/sql-query/`,
		headers,
		body: { sql_query: sqlQuery, output_format: outputFormat },
		json: true,
	})) as { download_url: string; format?: string; executed_at?: string };

	returnData.push({
		json: {
			downloadUrl: response.download_url,
			format: response.format ?? outputFormat,
			executedAt: response.executed_at ?? new Date().toISOString(),
		},
		pairedItem: { item: itemIndex },
	});
}

async function runQueryAndGetResults(
	context: IExecuteFunctions,
	itemIndex: number,
	headers: Record<string, string>,
	returnData: INodeExecutionData[],
): Promise<void> {
	const sqlQuery = context.getNodeParameter('sqlQuery', itemIndex) as string;
	const maxPages = context.getNodeParameter('maxPages', itemIndex, 10) as number;
	const appStartTimeoutMin = context.getNodeParameter(
		'appStartTimeoutMin',
		itemIndex,
		5,
	) as number;

	// Step 1: Start the explorer application (idempotent — safe when already running)
	await context.helpers
		.httpRequest({
			method: 'POST',
			url: `${BASE_URL}/api/v1/explorer/application/start/`,
			headers,
			json: true,
		})
		.catch(() => {
			// Application may already be running — not an error
		});

	// Step 2: Poll until application status is "running"
	await poll(
		() =>
			context.helpers.httpRequest({
				method: 'GET',
				url: `${BASE_URL}/api/v1/explorer/application/`,
				headers,
				json: true,
			}) as Promise<PollResult>,
		(r) => r.status === 'running',
		(r) => r.status === 'error' || r.status === 'failed',
		appStartTimeoutMin * 60_000,
	).catch((err: Error) => {
		throw new NodeOperationError(
			context.getNode(),
			`Explorer application did not start in time: ${err.message}`,
		);
	});

	// Step 3: Create the query
	const queryResponse = (await context.helpers.httpRequest({
		method: 'POST',
		url: `${BASE_URL}/api/v1/explorer/queries/`,
		headers,
		body: { sql_query: sqlQuery },
		json: true,
	})) as { slug: string };

	const querySlug = queryResponse.slug;
	if (!querySlug) {
		throw new NodeOperationError(context.getNode(), 'No query slug returned by the API');
	}

	// Steps 4–6: Paginate through all result pages
	let page = 1;
	while (page <= maxPages) {
		// Step 4: Submit execution for this page
		const execResponse = (await context.helpers.httpRequest({
			method: 'POST',
			url: `${BASE_URL}/api/v1/explorer/queries/${querySlug}/execution/`,
			headers,
			body: { page_number: page },
			json: true,
		})) as { id: string };

		const execId = execResponse.id;
		if (!execId) {
			throw new NodeOperationError(context.getNode(), 'No execution ID returned by the API');
		}

		// Step 5: Poll until execution is complete
		const execResult = await poll(
			() =>
				context.helpers.httpRequest({
					method: 'GET',
					url: `${BASE_URL}/api/v1/explorer/queries/${querySlug}/execution/${execId}/`,
					headers,
					json: true,
				}) as Promise<PollResult>,
			(r) => r.status === 'complete',
			(r) => r.status === 'failed' || r.status === 'error',
			30 * 60_000, // 30 min per page
		).catch((err: Error) => {
			throw new NodeOperationError(
				context.getNode(),
				`Query execution failed on page ${page}: ${err.message}`,
			);
		});

		if ((execResult as PollResult).status !== 'complete') {
			throw new NodeOperationError(
				context.getNode(),
				`Query execution ended with unexpected status: ${(execResult as PollResult).status}`,
			);
		}

		// Step 6: Fetch presigned results URL
		const resultsResponse = (await context.helpers.httpRequest({
			method: 'GET',
			url: `${BASE_URL}/api/v1/explorer/queries/${querySlug}/execution/${execId}/results/`,
			headers,
			json: true,
		})) as { download_url?: string };

		if (!resultsResponse.download_url) {
			// No results on this page — done
			break;
		}

		// Download Parquet and convert rows to n8n items
		const buffer = await downloadBuffer(resultsResponse.download_url);
		const records = await parseParquet(buffer);

		for (const record of records) {
			returnData.push({ json: record, pairedItem: { item: itemIndex } });
		}

		if (records.length < 100) {
			// Fewer than 100 rows means this is the last page
			break;
		}

		page++;
	}
}

export class NektDataApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nekt Data API',
		name: 'nektDataApi',
		icon: 'file:nekt.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Query your data warehouse via the Nekt Data API',
		defaults: {
			name: 'Nekt Data API',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'nektApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Query',
						value: 'runQuery',
						description:
							'Execute a SQL query and receive a presigned download URL (Parquet or CSV). Best for large exports and external data processing.',
						action: 'Run a SQL query and get a download URL',
					},
					{
						name: 'Run Query and Get Results',
						value: 'runQueryAndGetResults',
						description:
							'Execute a SQL query and return each row as an individual n8n item. Best for using warehouse data directly in automations.',
						action: 'Run a SQL query and return rows as items',
					},
				],
				default: 'runQueryAndGetResults',
			},
			// ── Shared ─────────────────────────────────────────────────
			{
				displayName: 'SQL Query',
				name: 'sqlQuery',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				description: 'The SQL query to execute. Uses Spark SQL — same dialect as the Nekt Explorer.',
				placeholder: 'SELECT * FROM "nekt_raw"."my_table" LIMIT 100',
			},
			// ── Run Query ───────────────────────────────────────────────
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{ name: 'Parquet', value: 'parquet' },
					{ name: 'CSV', value: 'csv' },
				],
				default: 'parquet',
				description: 'Format of the output file referenced by the download URL',
				displayOptions: { show: { operation: ['runQuery'] } },
			},
			// ── Run Query and Get Results ────────────────────────────────
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				default: 10,
				description:
					'Maximum number of pages to fetch. Each page contains up to 100 rows. Increase for larger result sets.',
				displayOptions: { show: { operation: ['runQueryAndGetResults'] } },
			},
			{
				displayName: 'Application Start Timeout (Minutes)',
				name: 'appStartTimeoutMin',
				type: 'number',
				default: 5,
				description:
					'How long to wait for the Nekt Explorer application to start. The first run of the day typically takes ~2 minutes.',
				displayOptions: { show: { operation: ['runQueryAndGetResults'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			const credentials = await this.getCredentials('nektApi');
			const headers = {
				'x-api-key': credentials.apiKey as string,
				'Content-Type': 'application/json',
			};

			try {
				if (operation === 'runQuery') {
					await runQuery(this, i, headers, returnData);
				} else if (operation === 'runQueryAndGetResults') {
					await runQueryAndGetResults(this, i, headers, returnData);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
