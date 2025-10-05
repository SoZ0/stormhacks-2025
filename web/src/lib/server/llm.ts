import { env } from '$env/dynamic/private';
import type { ProviderConfig } from '$lib/llm/providers';

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatStreamEvent {
  type: 'delta' | 'done' | 'error';
  value?: string;
  message?: string;
}

const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort();

const normalizeUrl = (baseUrl: string, port?: string): string => {
  let normalized = baseUrl.trim().replace(/\/$/, '');
  if (!/^https?:\/\//.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  const hasPort = /:(\d+)$/.test(normalized);
  if (port && port.trim() && !hasPort) {
    normalized = `${normalized}:${port.trim()}`;
  }

  return normalized;
};

const buildOllamaBaseUrl = (provider: ProviderConfig): string => {
  const fallback = env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const baseUrl = provider.settings.baseUrl || fallback;
  const port = provider.settings.port;

  // If the stored base URL already encodes the port, prefer it.
  return normalizeUrl(baseUrl, port);
};

const resolveGeminiApiKey = (provider: ProviderConfig): string => {
  const key = provider.settings.apiKey?.trim() || env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Gemini provider is missing an API key.');
  }
  return key;
};

export const listProviderModels = async (provider: ProviderConfig): Promise<string[]> => {
  switch (provider.kind) {
    case 'ollama':
      return listOllamaModels(provider);
    case 'gemini':
      return listGeminiModels(provider);
    default:
      return [];
  }
};

const encodeEvent = (encoder: TextEncoder, event: ChatStreamEvent): Uint8Array =>
  encoder.encode(`${JSON.stringify(event)}\n`);

export const streamProviderChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[]
): Promise<ReadableStream<Uint8Array>> => {
  switch (provider.kind) {
    case 'ollama':
      return streamOllamaChat(provider, model, history);
    case 'gemini':
      return streamGeminiChat(provider, model, history);
    default:
      throw new Error(`Unsupported provider: ${provider.kind}`);
  }
};

const listOllamaModels = async (provider: ProviderConfig): Promise<string[]> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama list models failed (${response.status}): ${message}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.models)
    ? data.models
        .map((entry: { name?: string }) => entry?.name)
        .filter((name: string | undefined): name is string => Boolean(name))
    : [];

  return uniqueSorted(models);
};

const streamOllamaChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[]
): Promise<ReadableStream<Uint8Array>> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: history,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('Ollama response missing body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = '';
      let aggregated = '';
      let lastChunk = '';
      let streamClosed = false;

      const send = (event: ChatStreamEvent) => {
        if (!streamClosed) {
          controller.enqueue(encodeEvent(encoder, event));
        }
      };

      const closeWith = (event?: ChatStreamEvent) => {
        if (!streamClosed) {
          if (event) {
            send(event);
          }
          streamClosed = true;
          controller.close();
        }
      };

      const processLine = (line: string): boolean => {
        if (!line) return false;

        const parsed = JSON.parse(line);

        if (parsed?.error) {
          const errorMessage = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
          throw new Error(errorMessage);
        }

        const content: string | undefined = parsed?.message?.content;
        if (typeof content === 'string' && content.length) {
          let delta = '';

          if (content === lastChunk) {
            delta = '';
          } else if (content.startsWith(aggregated)) {
            delta = content.slice(aggregated.length);
            aggregated = content;
          } else if (!aggregated) {
            delta = content;
            aggregated = content;
          } else if (aggregated.startsWith(content)) {
            delta = '';
          } else {
            delta = content;
            aggregated += content;
          }

          lastChunk = content;

          if (delta) {
            send({ type: 'delta', value: delta });
          }
        }

        if (parsed?.done) {
          const finalResponse: string | undefined =
            typeof parsed?.response === 'string' && parsed.response.length > 0
              ? parsed.response
              : typeof parsed?.message?.content === 'string' && parsed.message.content.length > 0
                ? parsed.message.content
                : undefined;

          const resolved = finalResponse ?? aggregated;

          if (finalResponse) {
            aggregated = finalResponse;
            lastChunk = finalResponse;
          }

          closeWith({ type: 'done', value: resolved });
          return true;
        }

        return false;
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

            const shouldBreak = processLine(line);
            if (shouldBreak) {
              await reader.cancel().catch(() => undefined);
              return;
            }

            newlineIndex = buffer.indexOf('\n');
          }

          if (done) {
            const remainder = buffer.trim();
            if (remainder) {
              const shouldBreak = processLine(remainder);
              if (shouldBreak) {
                await reader.cancel().catch(() => undefined);
                return;
              }
            }
            break;
          }
        }

        if (!streamClosed) {
          closeWith({ type: 'done', value: aggregated });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown streaming error';
        send({ type: 'error', message });
        streamClosed = true;
        controller.close();
        await reader.cancel().catch(() => undefined);
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
    }
  });
};

const listGeminiModels = async (provider: ProviderConfig): Promise<string[]> => {
  const apiKey = resolveGeminiApiKey(provider);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message ?? 'Unknown Gemini error';
    throw new Error(`Gemini list models failed (${response.status}): ${message}`);
  }

  const models = Array.isArray(data?.models)
    ? data.models
        .filter((model: { supportedGenerationMethods?: string[] }) =>
          Array.isArray(model?.supportedGenerationMethods)
            ? model.supportedGenerationMethods.includes('generateContent')
            : false
        )
        .map((model: { name?: string }) => model?.name?.replace(/^models\//, '') ?? '')
        .filter((name: string) => Boolean(name))
    : [];

  return uniqueSorted(models);
};

const chatWithGemini = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[]
): Promise<string> => {
  const apiKey = resolveGeminiApiKey(provider);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = history.map((entry) => ({
    role: entry.role === 'user' ? 'user' : 'model',
    parts: [{ text: entry.content }]
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contents })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? 'Unknown Gemini error';
    throw new Error(`Gemini request failed (${response.status}): ${message}`);
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .filter(Boolean)
    .join('\n');

  if (!reply) {
    throw new Error('Gemini response missing assistant reply');
  }

  return reply;
};

const streamGeminiChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[]
): Promise<ReadableStream<Uint8Array>> => {
  const reply = await chatWithGemini(provider, model, history);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      if (reply) {
        controller.enqueue(encodeEvent(encoder, { type: 'delta', value: reply }));
      }
      controller.enqueue(encodeEvent(encoder, { type: 'done', value: reply }));
      controller.close();
    }
  });
};
