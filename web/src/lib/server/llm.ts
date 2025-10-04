import { env } from '$env/dynamic/private';
import type { ProviderConfig } from '$lib/llm/providers';

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
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

export const sendProviderChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[]
): Promise<string> => {
  switch (provider.kind) {
    case 'ollama':
      return chatWithOllama(provider, model, history);
    case 'gemini':
      return chatWithGemini(provider, model, history);
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

const chatWithOllama = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[]
): Promise<string> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: history,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const reply: string | undefined = data?.message?.content ?? data?.response;
  if (!reply) {
    throw new Error('Ollama response missing assistant reply');
  }

  return reply;
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
