import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { ELEVENLABS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

if (!ELEVENLABS_API_KEY) {
  throw new Error(
    'Missing ELEVENLABS_API_KEY in environment. Create a .env with ELEVENLABS_API_KEY=sk_… and restart.'
  );
}

const eleven = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

export const POST: RequestHandler = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { text, voiceId } = body;
  if (!text || !voiceId) {
    return new Response(
      JSON.stringify({ error: 'Missing text or voiceId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Call the SDK
    const sdkRes = await eleven.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128'
    });

    // sdkRes may be a Buffer (Node) or a Response-like. Handle both:
    let bodyData: ArrayBuffer | Uint8Array;
    if (typeof (sdkRes as any).arrayBuffer === 'function') {
      bodyData = await (sdkRes as Response).arrayBuffer();
    } else {
      // sdkRes is likely a Node Buffer / Uint8Array
      bodyData = sdkRes as Uint8Array;
    }

    return new Response(bodyData, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (err: any) {
    console.error('TTS convert error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Conversion failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};