import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sanitizeElevenLabsApiKey } from '$lib/llm/settings';
import { getStoredSettings, updateStoredSettings } from '$lib/shared/settingsStore';

const toResponse = (hasKey: boolean) => json({ settings: { hasElevenLabsApiKey: hasKey } });

export const GET: RequestHandler = ({ cookies }) => {
  const settings = getStoredSettings(cookies);
  return toResponse(Boolean(settings.tts.elevenLabsApiKey));
};

interface TtsSettingsPayload {
  apiKey?: unknown;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  let payload: TtsSettingsPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'apiKey')) {
    return json({ error: 'apiKey is required' }, { status: 400 });
  }

  const nextKey = sanitizeElevenLabsApiKey(payload.apiKey);

  const updated = updateStoredSettings(cookies, (current) => ({
    ...current,
    tts: {
      ...current.tts,
      elevenLabsApiKey: nextKey
    }
  }));

  return toResponse(Boolean(updated.tts.elevenLabsApiKey));
};
