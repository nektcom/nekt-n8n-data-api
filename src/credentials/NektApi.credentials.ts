import type {
	ICredentialDataDecryptedObject,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

export class NektApi implements ICredentialType {
	name = 'nektApi';

	displayName = 'Nekt API';

	documentationUrl = 'https://app.nekt.ai/integrations/data-api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Nekt Data API key. Find it at https://app.nekt.ai/integrations/data-api.',
		},
	];

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
