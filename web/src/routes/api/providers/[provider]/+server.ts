import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  maskProviderForClient,
  maskProvidersForClient,
  removeProvider
} from '$lib/shared/providerStore';

export const DELETE: RequestHandler = ({ params, cookies }) => {
  const providerId = params.provider;

  if (!providerId) {
    return json({ error: 'Provider is required' }, { status: 400 });
  }

  try {
    const result = removeProvider(cookies, providerId);
    return json({
      provider: maskProviderForClient(result.removed),
      providers: maskProvidersForClient(result.providers)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove provider';
    const status = /not found/i.test(message) ? 404 : 400;
    return json({ error: message }, { status });
  }
};
