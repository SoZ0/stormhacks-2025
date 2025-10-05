import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getStoredSettings } from '$lib/shared/settingsStore';

const DEFAULT_ELEVENLABS_VOICES: Array<{ id: string; name: string }> = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { id: 'VR6AewLTIGWG4xSOukaG', name: 'Arnold' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },
  { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'Nicole' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Clyde' }
];

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
    const response = await client.voices.getAll({
      // Include legacy voices so built-in ElevenLabs options show up in the dropdown
      showLegacy: true
    });
    const list = Array.isArray(response?.voices)
      ? (response.voices as Array<{ voice_id?: string; name?: string }>)
      : [];
    const fetchedVoices = list
      .map((voice) => ({
        id: voice?.voice_id ?? '',
        name: voice?.name?.trim() || voice?.voice_id || 'Unknown Voice'
      }))
      .filter((voice) => voice.id);

    const fallbackVoices = DEFAULT_ELEVENLABS_VOICES.filter(
      (fallback) => !fetchedVoices.some((voice) => voice.id === fallback.id)
    );

    const voices = [...fetchedVoices, ...fallbackVoices];

    return json({ voices });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load ElevenLabs voices';
    return json({ voices: [], error: message }, { status: 500 });
  }
};
