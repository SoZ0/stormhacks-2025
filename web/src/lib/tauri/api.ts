import type { Cookies } from '@sveltejs/kit';
import { handleChatRequest, HttpError } from '$lib/api/chat';
import {
  createProviderConfig,
  findProvider,
  getProviders,
  maskProviderForClient,
  maskProvidersForClient,
  removeProvider,
  saveProviders
} from '$lib/shared/providerStore';
import {
  createDefaultSettings,
  getClientSettings,
  getStoredSettings,
  saveStoredSettings,
  updateStoredSettings
} from '$lib/shared/settingsStore';
import { listProviderModels, checkProviderToolSupport } from '$lib/shared/llm';
import { normalizeGenerationOptions, sanitizeElevenLabsApiKey } from '$lib/llm/settings';
import { getLocalCookieJar } from '$lib/tauri/cookies';

const isTauri = () => typeof window !== 'undefined' && typeof (window as any).__TAURI__ !== 'undefined';

const jsonResponse = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

const errorResponse = (message: string, status = 400) => jsonResponse({ error: message }, { status });

const parseJson = async (request: Request): Promise<any | null> => {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
};

const getRuntimeEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process?.env?.[key]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  if (typeof globalThis !== 'undefined') {
    const tauriEnv = (globalThis as { __TAURI_PRIVATE_ENV__?: Record<string, string> }).__TAURI_PRIVATE_ENV__;
    const value = tauriEnv?.[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
};

const handleProviders = async (pathname: string, request: Request, cookies: Cookies) => {
  if (pathname === '/api/providers') {
    if (request.method === 'GET') {
      const providers = maskProvidersForClient(getProviders(cookies));
      return jsonResponse({ providers });
    }

    if (request.method === 'POST') {
      const payload = await parseJson(request);
      if (!payload) {
        return errorResponse('Invalid JSON body', 400);
      }

      try {
        const existing = getProviders(cookies);
        const provider = createProviderConfig(payload, existing);
        const next = [...existing, provider];
        saveProviders(cookies, next);
        return jsonResponse({
          provider: maskProviderForClient(provider),
          providers: maskProvidersForClient(next)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create provider';
        return errorResponse(message, 400);
      }
    }
  }

  const removeMatch = /^\/api\/providers\/([^/]+)$/.exec(pathname);
  if (removeMatch && request.method === 'DELETE') {
    const providerId = decodeURIComponent(removeMatch[1]);
    try {
      const result = removeProvider(cookies, providerId);
      return jsonResponse({
        provider: maskProviderForClient(result.removed),
        providers: maskProvidersForClient(result.providers)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove provider';
      const status = /not found/i.test(message) ? 404 : 400;
      return errorResponse(message, status);
    }
  }

  return undefined;
};

const ensureSettingsProvider = (cookies: Cookies) => {
  const providers = getProviders(cookies);
  let settings = getStoredSettings(cookies);
  const hasProvider = providers.some((provider) => provider.id === settings.provider);
  if (!hasProvider) {
    const fallback = createDefaultSettings();
    settings = {
      ...fallback,
      tts: { ...settings.tts }
    };
    saveStoredSettings(cookies, settings);
  }
  return { providers, settings };
};

const handleSettings = async (pathname: string, request: Request, cookies: Cookies) => {
  if (pathname === '/api/settings') {
    if (request.method === 'GET') {
      const { settings } = ensureSettingsProvider(cookies);
      const clientSettings = getClientSettings(settings);
      return jsonResponse({ settings: clientSettings });
    }

    if (request.method === 'POST') {
      const payload = await parseJson(request);
      if (!payload) {
        return errorResponse('Invalid JSON body', 400);
      }

      const { provider, model, options } = payload ?? {};

      if (!provider || typeof provider !== 'string') {
        return errorResponse('provider is required', 400);
      }

      if (typeof model !== 'string') {
        return errorResponse('model is required', 400);
      }

      const providerConfig = findProvider(cookies, provider);
      if (!providerConfig) {
        return errorResponse('Unsupported provider', 404);
      }

      const normalizedOptions = normalizeGenerationOptions(options);
      const updated = updateStoredSettings(cookies, (current) => ({
        ...current,
        provider: providerConfig.id,
        model,
        options: normalizedOptions
      }));

      const clientSettings = getClientSettings(updated);
      return jsonResponse({ settings: clientSettings });
    }
  }

  if (pathname === '/api/settings/tts') {
    if (request.method === 'GET') {
      const settings = getStoredSettings(cookies);
      return jsonResponse({ settings: { hasElevenLabsApiKey: Boolean(settings.tts.elevenLabsApiKey) } });
    }

    if (request.method === 'POST') {
      const payload = await parseJson(request);
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'apiKey')) {
        return errorResponse('apiKey is required', 400);
      }

      const nextKey = sanitizeElevenLabsApiKey(payload.apiKey);
      const updated = updateStoredSettings(cookies, (current) => ({
        ...current,
        tts: {
          ...current.tts,
          elevenLabsApiKey: nextKey
        }
      }));

      return jsonResponse({ settings: { hasElevenLabsApiKey: Boolean(updated.tts.elevenLabsApiKey) } });
    }
  }

  return undefined;
};

const handleModels = async (pathname: string, request: Request, cookies: Cookies) => {
  const match = /^\/api\/models\/([^/]+)$/.exec(pathname);
  if (!match || request.method !== 'GET') {
    return undefined;
  }

  const providerId = decodeURIComponent(match[1]);
  const provider = findProvider(cookies, providerId);
  if (!provider) {
    return errorResponse('Unsupported provider', 404);
  }

  try {
    const models = await listProviderModels(provider);
    return jsonResponse({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list models';
    return errorResponse(message, 500);
  }
};

const handleToolSupport = async (pathname: string, request: Request, cookies: Cookies) => {
  if (pathname !== '/api/tool-support' || request.method !== 'POST') {
    return undefined;
  }

  const payload = await parseJson(request);
  if (!payload) {
    return errorResponse('Invalid JSON body', 400);
  }

  const providerId = typeof payload.provider === 'string' ? payload.provider : '';
  const modelId = typeof payload.model === 'string' ? payload.model : '';

  if (!providerId) {
    return errorResponse('provider is required', 400);
  }

  if (!modelId) {
    return errorResponse('model is required', 400);
  }

  const provider = findProvider(cookies, providerId);
  if (!provider) {
    return errorResponse('Unsupported provider', 404);
  }

  try {
    const supported = await checkProviderToolSupport(provider, modelId);
    return jsonResponse({ supported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to determine tool support';
    return errorResponse(message, 500);
  }
};

const handleChat = async (pathname: string, request: Request, cookies: Cookies) => {
  if (pathname !== '/api/chat' || request.method !== 'POST') {
    return undefined;
  }

  const payload = await parseJson(request);
  if (!payload) {
    return errorResponse('Invalid JSON body', 400);
  }

  try {
    return await handleChatRequest(payload, cookies);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error('Tauri chat handler error:', error);
    return errorResponse('Internal server error', 500);
  }
};

const handleTts = async (pathname: string, request: Request, cookies: Cookies) => {
  if (pathname !== '/api/tts' || request.method !== 'POST') {
    return undefined;
  }

  const payload = await parseJson(request);
  if (!payload) {
    return errorResponse('Invalid JSON', 400);
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const voiceId = typeof payload.voiceId === 'string' ? payload.voiceId.trim() : '';

  if (!text || !voiceId) {
    return errorResponse('Missing text or voiceId', 400);
  }

  const settings = getStoredSettings(cookies);
  const apiKey = settings.tts.elevenLabsApiKey ?? getRuntimeEnv('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return errorResponse(
      'Missing ElevenLabs API key. Add one in settings or configure ELEVENLABS_API_KEY in the environment.',
      500
    );
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_128'
      })
    });

    if (!response.ok) {
      const message = await response.text();
      return errorResponse(message || 'Conversion failed', response.status);
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conversion failed';
    return errorResponse(message, 500);
  }
};

const handleLive2D = (pathname: string) => {
  if (pathname.startsWith('/api/live2d/')) {
    return errorResponse('Live2D API is not yet available in the desktop build.', 501);
  }
  return undefined;
};

const handleApiRequest = async (pathname: string, request: Request, cookies: Cookies) => {
  return (
    (await handleProviders(pathname, request, cookies)) ??
    (await handleSettings(pathname, request, cookies)) ??
    (await handleModels(pathname, request, cookies)) ??
    (await handleToolSupport(pathname, request, cookies)) ??
    (await handleChat(pathname, request, cookies)) ??
    (await handleTts(pathname, request, cookies)) ??
    handleLive2D(pathname)
  );
};

export const setupTauriApiInterceptor = () => {
  if (!isTauri()) {
    return;
  }

  const cookies = getLocalCookieJar();
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, window.location.origin);

    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const response = await handleApiRequest(url.pathname, request, cookies);
      if (response) {
        return response;
      }
    }

    return originalFetch(input, init);
  };
};
