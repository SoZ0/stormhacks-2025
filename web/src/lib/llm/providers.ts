export type ProviderId = string;
export type ProviderKind = 'ollama' | 'gemini';

export type ProviderFieldType = 'text' | 'password' | 'url' | 'number';

export interface ProviderFieldDefinition {
  name: string;
  label: string;
  type: ProviderFieldType;
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
  helperText?: string;
}

export interface ProviderTemplate {
  kind: ProviderKind;
  label: string;
  description: string;
  fields: ProviderFieldDefinition[];
  defaultLabel: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  description?: string;
  settings: Record<string, string>;
}

export interface ProviderOption {
  id: ProviderId;
  label: string;
  description?: string;
  kind: ProviderKind;
}

export const DEFAULT_PROVIDER_ID = 'ollama-local';

export const providerTemplates: ProviderTemplate[] = [
  {
    kind: 'ollama',
    label: 'Ollama',
    description: 'Connect to an Ollama instance running locally or remotely.',
    defaultLabel: 'Local Ollama',
    fields: [
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'url',
        placeholder: 'http://localhost',
        required: true,
        helperText: 'Protocol and host for the Ollama server.'
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        placeholder: '11434',
        helperText: 'Leave blank to use the port in the base URL.'
      }
    ]
  },
  {
    kind: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini model access via API key.',
    defaultLabel: 'Gemini',
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'GEMINI_API_KEY',
        required: true,
        secret: true
      }
    ]
  }
];

export const defaultProviders: ProviderConfig[] = [
  {
    id: DEFAULT_PROVIDER_ID,
    label: 'Local Ollama',
    kind: 'ollama',
    description: 'Connects to a local Ollama instance (http://localhost:11434).',
    settings: {
      baseUrl: 'http://localhost',
      port: '11434'
    }
  }
];

export const defaultProvider = defaultProviders[0];

export const providerOptions = defaultProviders.map<ProviderOption>((provider) => ({
  id: provider.id,
  label: provider.label,
  description: provider.description,
  kind: provider.kind
}));

export const getProviderTemplate = (kind: ProviderKind) =>
  providerTemplates.find((template) => template.kind === kind);

export const isProviderKind = (value: string): value is ProviderKind =>
  providerTemplates.some((template) => template.kind === value);
