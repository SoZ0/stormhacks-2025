import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { SETTINGS_COOKIE, defaultSettings, parseSettings, type LLMSettings } from '$lib/llm/settings';
import { findProvider, getProviders } from '$lib/server/providerStore';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: !dev,
  maxAge: 60 * 60 * 24 * 365
};

export const GET: RequestHandler = async ({ cookies }) => {
  const raw = cookies.get(SETTINGS_COOKIE);
  let settings = parseSettings(raw) ?? defaultSettings;

  const providers = getProviders(cookies);
  const hasProvider = providers.some((provider) => provider.id === settings.provider);
  if (!hasProvider) {
    settings = { ...defaultSettings };
  }

  return json({ settings });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  let payload: Partial<LLMSettings>;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model } = payload ?? {};

  if (!provider || typeof provider !== 'string') {
    return json({ error: 'provider is required' }, { status: 400 });
  }

  if (typeof model !== 'string') {
    return json({ error: 'model is required' }, { status: 400 });
  }

  const providerConfig = findProvider(cookies, provider);
  if (!providerConfig) {
    return json({ error: 'Unsupported provider' }, { status: 404 });
  }

  const settings: LLMSettings = { provider: providerConfig.id, model };
  cookies.set(SETTINGS_COOKIE, JSON.stringify(settings), cookieOptions);

  return json({ settings });
};
