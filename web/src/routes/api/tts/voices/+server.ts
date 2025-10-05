import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getStoredSettings } from '$lib/server/settingsStore';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const settings = getStoredSettings(cookies);
    const apiKey = settings.tts.elevenLabsApiKey ?? env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return json(
        {
          voices: [],
          error:
            'Missing ElevenLabs API key. Add one in settings or configure ELEVENLABS_API_KEY in the environment.'
        },
        { status: 400 }
      );
    }

    const client = new ElevenLabsClient({ apiKey });
    const response = await client.voices.getAll();
    const list = Array.isArray(response?.voices)
      ? (response.voices as Array<{ voice_id?: string; name?: string }>)
      : [];
    const voices = list
      .map((voice) => ({
        id: voice?.voice_id ?? '',
        name: voice?.name?.trim() || voice?.voice_id || 'Unknown Voice'
      }))
      .filter((voice) => voice.id);

    return json({ voices });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load ElevenLabs voices';
    return json({ voices: [], error: message }, { status: 500 });
  }
};
