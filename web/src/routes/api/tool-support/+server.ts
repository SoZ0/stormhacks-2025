import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findProvider } from '$lib/server/providerStore';
import { checkProviderToolSupport } from '$lib/server/llm';

interface ToolSupportRequestBody {
  provider?: unknown;
  model?: unknown;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  let body: ToolSupportRequestBody;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const providerId = typeof body.provider === 'string' ? body.provider : '';
  const modelId = typeof body.model === 'string' ? body.model : '';

  if (!providerId) {
    return json({ error: 'provider is required' }, { status: 400 });
  }

  if (!modelId) {
    return json({ error: 'model is required' }, { status: 400 });
  }

  const provider = findProvider(cookies, providerId);
  if (!provider) {
    return json({ error: 'Unsupported provider' }, { status: 404 });
  }

  try {
    const supported = await checkProviderToolSupport(provider, modelId);
    return json({ supported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to determine tool support';
    return json({ error: message }, { status: 500 });
  }
};
