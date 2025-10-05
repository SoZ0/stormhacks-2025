import { defaultProvider } from '$lib/llm/providers';
import type { ProviderConfig, ProviderId } from '$lib/llm/providers';

export type LlmSender = 'user' | 'bot';

export interface ChatMessagePayload {
  sender: LlmSender;
  text: string;
}

export interface ProviderSettingsPayload {
  provider?: ProviderId;
  model?: string;
}

interface ProvidersResponse {
  providers?: ProviderConfig[];
  error?: string;
}

interface ProviderModelsResponse {
  models?: unknown[];
  error?: string;
}

interface ProviderSettingsResponse {
  settings?: ProviderSettingsPayload;
  error?: string;
}

interface ChatResponse {
  reply?: string;
  error?: string;
}

const jsonOrNull = async <T>(response: Response) => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const ensureOk = <T extends { error?: string }>(
  response: Response,
  data: T | null,
  defaultMessage: string
) => {
  if (!response.ok || !data) {
    const message = data?.error ?? `${defaultMessage} (${response.status})`;
    throw new Error(message);
  }
  return data;
};

export const fetchProviders = async (): Promise<ProviderConfig[]> => {
  const response = await fetch('/api/providers');
  const data = ensureOk(response, await jsonOrNull<ProvidersResponse>(response), 'Unable to load providers');
  const list = Array.isArray(data.providers) ? (data.providers as ProviderConfig[]) : [];
  return list.length ? list : [defaultProvider];
};

export const fetchProviderSettings = async (): Promise<ProviderSettingsPayload | null> => {
  const response = await fetch('/api/settings');
  const data = ensureOk(
    response,
    await jsonOrNull<ProviderSettingsResponse>(response),
    'Unable to load settings'
  );
  return data.settings ?? null;
};

export const fetchModels = async (provider: ProviderId): Promise<string[]> => {
  const response = await fetch(`/api/models/${provider}`);
  const data = ensureOk(response, await jsonOrNull<ProviderModelsResponse>(response), 'Unable to load models');
  const models = Array.isArray(data.models) ? data.models : [];
  return models
    .filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    .map((model) => model.trim());
};

export const saveProviderSettings = async (provider: ProviderId, model: string) => {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model })
  });

  ensureOk(response, await jsonOrNull<ProviderSettingsResponse>(response), 'Unable to save settings');
};

export const sendChatMessage = async (
  provider: ProviderId,
  model: string,
  messages: ChatMessagePayload[]
): Promise<string> => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, messages })
  });

  const data = ensureOk(response, await jsonOrNull<ChatResponse>(response), 'Request failed');
  if (!data.reply) {
    throw new Error('Response did not include a reply message');
  }

  return data.reply;
};
