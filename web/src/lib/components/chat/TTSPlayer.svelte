import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { ELEVENLABS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

// Log that the endpoint was hit and your key is loaded
console.log('[tts] ELEVENLABS_API_KEY is', !!ELEVENLABS_API_KEY);

const eleven = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
    console.log('[tts] request body:', body);
  } catch (err) {
    console.error('[tts] failed to parse JSON body:', err);
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { text, voiceId, modelId = 'eleven_multilingual_v2', outputFormat = 'mp3_44100_128' } = body;

  if (!text || !voiceId) {
    console.error('[tts] missing text or voiceId:', { text, voiceId });
    return new Response(JSON.stringify({ error: 'Missing text or voiceId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // This is where the SDK might throw
    const sdkRes = await eleven.textToSpeech.convert(voiceId, {
      text,
      modelId,
      outputFormat
    });
    console.log('[tts] SDK responded, status:', sdkRes.status);

    const arrayBuffer = await sdkRes.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' }
    });

  } catch (err: any) {
    console.error('[tts] ElevenLabsClient.convert() failed:', err);
    return new Response(JSON.stringify({ error: err.message || 'Conversion error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};