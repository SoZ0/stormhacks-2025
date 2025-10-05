import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createProviderConfig,
  getProviders,
  maskProviderForClient,
  maskProvidersForClient,
  saveProviders,
  type CreateProviderInput
} from '$lib/shared/providerStore';

export const GET: RequestHandler = ({ cookies }) => {
  const providers = maskProvidersForClient(getProviders(cookies));
  return json({ providers });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  let payload: CreateProviderInput;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const existing = getProviders(cookies);
    const provider = createProviderConfig(payload, existing);
    const next = [...existing, provider];

    saveProviders(cookies, next);

    return json({ provider: maskProviderForClient(provider), providers: maskProvidersForClient(next) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create provider';
    return json({ error: message }, { status: 400 });
  }
};
