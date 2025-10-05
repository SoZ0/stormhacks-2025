import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findProvider } from '$lib/server/providerStore';
import { streamProviderChat, type ProviderMessage } from '$lib/server/llm';

interface ClientMessage {
  sender: 'user' | 'bot';
  text: string;
}

interface ChatRequestBody {
  provider: string;
  model: string;
  messages: ClientMessage[];
}

const normalizeHistory = (messages: ClientMessage[]): ProviderMessage[] =>
  messages.map((message) => ({
    role: message.sender === 'user' ? 'user' : 'assistant',
    content: message.text
  }));

export const POST: RequestHandler = async ({ request, cookies }) => {
  let body: ChatRequestBody;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model, messages } = body ?? {};

  if (!provider || typeof provider !== 'string') {
    return json({ error: 'provider is required' }, { status: 400 });
  }

  if (!model || typeof model !== 'string') {
    return json({ error: 'model is required' }, { status: 400 });
  }

  if (!Array.isArray(messages)) {
    return json({ error: 'messages must be an array' }, { status: 400 });
  }

  const providerConfig = findProvider(cookies, provider);
  if (!providerConfig) {
    return json({ error: 'Unsupported provider' }, { status: 404 });
  }

  const history = normalizeHistory(messages);

  try {
    const stream = await streamProviderChat(providerConfig, model, history);
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
