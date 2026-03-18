import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export class NektApi implements ICredentialType {
	name = 'nektApi';

	displayName = 'Nekt API';

	documentationUrl = 'https://docs.nekt.ai/data-api-v1/introduction';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Nekt API key. Create one at https://app.nekt.ai/settings/api-keys.',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.nekt.ai',
			url: '/api/v1/explorer/application/',
			method: 'GET',
		},
	};

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		requestOptions.headers = {
			...requestOptions.headers,
			'x-api-key': credentials.apiKey as string,
		};
		return requestOptions;
	}
}
