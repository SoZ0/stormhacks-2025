import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findProvider } from '$lib/server/providerStore';
import { listProviderModels } from '$lib/server/llm';

export const GET: RequestHandler = async ({ params, cookies }) => {
  const providerId = params.provider;

  if (!providerId) {
    return json({ error: 'Provider is required' }, { status: 400 });
  }

  const provider = findProvider(cookies, providerId);
  if (!provider) {
    return json({ error: 'Unsupported provider' }, { status: 404 });
  }

  try {
    const models = await listProviderModels(provider);
    return json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list models';
    return json({ error: message }, { status: 500 });
  }
};
