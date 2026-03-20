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
			displayName: 'Data API Key',
			name: 'dataApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'For SQL Query operations. Find it at https://app.nekt.ai/integrations/data-api.',
		},
		{
			displayName: 'Platform API Key',
			name: 'platformApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'For Source, Transformation, Destination, and Run operations. Find it at https://app.nekt.ai/settings/api-keys.',
		},
	];

	async authenticate(
		_credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		return requestOptions;
	}
}
