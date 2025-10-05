import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeGenerationOptions, type LLMSettings } from '$lib/llm/settings';
import { findProvider, getProviders } from '$lib/shared/providerStore';
import {
  createDefaultSettings,
  getClientSettings,
  getStoredSettings,
  saveStoredSettings,
  updateStoredSettings
} from '$lib/shared/settingsStore';

export const GET: RequestHandler = async ({ cookies }) => {
  const providers = getProviders(cookies);
  let settings = getStoredSettings(cookies);

  const hasProvider = providers.some((provider) => provider.id === settings.provider);
  if (!hasProvider) {
    const fallback = createDefaultSettings();
    settings = {
      ...fallback,
      tts: { ...settings.tts }
    } satisfies LLMSettings;
    saveStoredSettings(cookies, settings);
  }

  const clientSettings = getClientSettings(settings);

  return json({ settings: clientSettings });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  let payload: Partial<LLMSettings>;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, model, options } = payload ?? {};

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

  const normalizedOptions = normalizeGenerationOptions(options);

  const updated = updateStoredSettings(cookies, (current) => ({
    ...current,
    provider: providerConfig.id,
    model,
    options: normalizedOptions
  }));

  const clientSettings = getClientSettings(updated);

  return json({ settings: clientSettings });
};
