import { defaultProvider } from '$lib/llm/providers';
import type { ProviderConfig, ProviderId } from '$lib/llm/providers';
import {
  defaultGenerationOptions,
  normalizeGenerationOptions,
  type LLMGenerationOptions
} from '$lib/llm/settings';

export type LlmSender = 'user' | 'bot';

export interface ChatMessagePayload {
  sender: LlmSender;
  text: string;
}

export type ChatStreamEventType = 'delta' | 'done' | 'error';

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  value?: string;
  message?: string;
}

export interface ProviderSettingsPayload {
  provider?: ProviderId;
  model?: string;
  options?: LLMGenerationOptions;
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
  const settings = data.settings ?? null;
  if (!settings || typeof settings !== 'object') {
    return null;
  }

  const provider = typeof settings.provider === 'string' ? settings.provider : undefined;
  const model = typeof settings.model === 'string' ? settings.model : undefined;
  const options = normalizeGenerationOptions((settings as { options?: unknown }).options);

  return {
    provider,
    model,
    options
  };
};

export const fetchModels = async (provider: ProviderId): Promise<string[]> => {
  const response = await fetch(`/api/models/${provider}`);
  const data = ensureOk(response, await jsonOrNull<ProviderModelsResponse>(response), 'Unable to load models');
  const models = Array.isArray(data.models) ? data.models : [];
  return models
    .filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    .map((model) => model.trim());
};

export const saveProviderSettings = async (
  provider: ProviderId,
  model: string,
  options: LLMGenerationOptions = defaultGenerationOptions
) => {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, options })
  });

  ensureOk(response, await jsonOrNull<ProviderSettingsResponse>(response), 'Unable to save settings');
};

const parseStreamLine = (line: string): ChatStreamEvent | null => {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed.type !== 'string') {
      return null;
    }
    if (parsed.type !== 'delta' && parsed.type !== 'done' && parsed.type !== 'error') {
      return null;
    }
    return parsed as ChatStreamEvent;
  } catch {
    return null;
  }
};

export const streamChatMessage = async (
  provider: ProviderId,
  model: string,
  systemPrompt: string,
  messages: ChatMessagePayload[],
  options: LLMGenerationOptions,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, systemPrompt, messages, options })
  });

  if (!response.ok) {
    const data = await jsonOrNull<{ error?: string }>(response);
    const message = data?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  const body = response.body;
  if (!body) {
    throw new Error('Streaming is not supported in this environment');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

  const handleEvent = (event: ChatStreamEvent) => {
    if (event.type === 'error') {
      onEvent(event);
      throw new Error(event.message ?? 'Request failed');
    }

    onEvent(event);

    if (event.type === 'done') {
      sawDone = true;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      } else if (done) {
        buffer += decoder.decode();
      }

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line) {
          const event = parseStreamLine(line);
          if (event) {
            handleEvent(event);
            if (sawDone) {
              return;
            }
          }
        }

        newlineIndex = buffer.indexOf('\n');
      }

      if (done) {
        const remainder = buffer.trim();
        if (remainder) {
          const event = parseStreamLine(remainder);
          if (event) {
            handleEvent(event);
            if (sawDone) {
              return;
            }
          }
        }

        if (!sawDone) {
          handleEvent({ type: 'done' });
        }
        return;
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
};
