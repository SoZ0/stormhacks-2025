import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findProvider } from '$lib/server/providerStore';
import { streamProviderChat, type ProviderMessage } from '$lib/server/llm';
import { normalizeGenerationOptions } from '$lib/llm/settings';

interface ClientMessage {
  sender: 'user' | 'bot';
  text: string;
}

interface ChatRequestBody {
  provider: string;
  model: string;
  messages: unknown;
  systemPrompt?: string;
  options?: unknown;
  toolsEnabled?: unknown;
}

const toClientMessage = (value: unknown): ClientMessage | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as { sender?: unknown; text?: unknown };
  const senderRaw = typeof source.sender === 'string' ? source.sender.trim().toLowerCase() : '';
  const sender: ClientMessage['sender'] | null = senderRaw === 'user'
    ? 'user'
    : senderRaw === 'bot' || senderRaw === 'assistant'
      ? 'bot'
      : null;

  if (!sender) {
    return null;
  }

  const textValue = source.text;
  const text = typeof textValue === 'string' ? textValue : String(textValue ?? '');

  return { sender, text };
};

const coerceClientMessages = (value: unknown): ClientMessage[] | null => {
  if (Array.isArray(value)) {
    const normalized: ClientMessage[] = [];
    for (const entry of value) {
      const message = toClientMessage(entry);
      if (!message) {
        return null;
      }
      normalized.push(message);
    }
    return normalized;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const numericKeys = Object.keys(record)
      .filter((key) => /^\d+$/.test(key))
      .map((key) => Number.parseInt(key, 10))
      .sort((a, b) => a - b);

    if (numericKeys.length) {
      const entries = numericKeys.map((key) => record[String(key)]);
      return coerceClientMessages(entries);
    }
  }

  return null;
};

const normalizeHistory = (messages: ClientMessage[], systemPrompt?: string): ProviderMessage[] => {
  const history: ProviderMessage[] = [];

  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
    history.push({ role: 'system', content: systemPrompt.trim() });
  }

  for (const message of messages) {
    history.push({
      role: message.sender === 'user' ? 'user' : 'assistant',
      content: message.text
    });
  }

  return history;
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  let body: ChatRequestBody;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model, messages, systemPrompt, options, toolsEnabled } = body ?? {};

  if (!provider || typeof provider !== 'string') {
    return json({ error: 'provider is required' }, { status: 400 });
  }

  if (!model || typeof model !== 'string') {
    return json({ error: 'model is required' }, { status: 400 });
  }

  const normalizedMessages = coerceClientMessages(messages);
  if (!normalizedMessages) {
    return json({ error: 'messages must be an array' }, { status: 400 });
  }

  const providerConfig = findProvider(cookies, provider);
  if (!providerConfig) {
    return json({ error: 'Unsupported provider' }, { status: 404 });
  }

  const history = normalizeHistory(
    normalizedMessages,
    typeof systemPrompt === 'string' ? systemPrompt : undefined
  );
  const generationOptions = normalizeGenerationOptions(options);

  try {
    const stream = await streamProviderChat(
      providerConfig,
      model,
      history,
      typeof systemPrompt === 'string' ? systemPrompt : undefined,
      generationOptions,
      toolsEnabled === undefined ? true : toolsEnabled === true
    );
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};
