import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getStoredSettings } from '$lib/server/settingsStore';
import { Readable } from 'node:stream';

const textEncoder = new TextEncoder();

const missingKeyResponse = () =>
  new Response(
    JSON.stringify({
      error: 'Missing ElevenLabs API key. Add one in settings or configure ELEVENLABS_API_KEY in the environment.'
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  );

const hasArrayBuffer = (value: unknown): value is { arrayBuffer: () => Promise<ArrayBuffer> } =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );

const isIterableNumber = (value: unknown): value is Iterable<number> =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Iterable<number>)[Symbol.iterator] === 'function'
  );

const isArrayLikeNumber = (value: unknown): value is ArrayLike<number> =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { length?: unknown }).length === 'number'
  );

const arrayBufferFromView = (view: ArrayBufferView | Uint8Array): ArrayBuffer => {
  const slice = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const copy = new Uint8Array(slice.length);
  copy.set(slice);
  return copy.buffer;
};

const isWebReadableStream = (
  value: unknown
): value is ReadableStream<Uint8Array> =>
  Boolean(value && typeof value === 'object' && typeof (value as { getReader?: unknown }).getReader === 'function');

const isNodeReadableStream = (value: unknown): value is Readable => value instanceof Readable;

const arrayBufferFromWebStream = async (stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> => {
  const response = new Response(stream);
  return response.arrayBuffer();
};

const arrayBufferFromNodeStream = async (stream: Readable): Promise<ArrayBuffer> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      chunks.push(textEncoder.encode(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(chunk);
    } else if (chunk instanceof ArrayBuffer) {
      chunks.push(new Uint8Array(chunk));
    } else if (ArrayBuffer.isView(chunk)) {
      chunks.push(new Uint8Array(arrayBufferFromView(chunk as ArrayBufferView)));
    } else if (isArrayLikeNumber(chunk)) {
      chunks.push(new Uint8Array(chunk));
    } else if (isIterableNumber(chunk)) {
      chunks.push(Uint8Array.from(chunk));
    } else {
      throw new Error('Unsupported chunk type received from ElevenLabs stream.');
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged.buffer;
};

export const POST: RequestHandler = async ({ request, cookies }) => {
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
    const storedSettings = getStoredSettings(cookies);
    const apiKey = storedSettings.tts.elevenLabsApiKey ?? env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return missingKeyResponse();
    }

    const eleven = new ElevenLabsClient({ apiKey });

    // Call the SDK
    const sdkRes = await eleven.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128'
    });

    // sdkRes may be a Buffer (Node), ArrayBuffer, or a Response-like object. Normalize to ArrayBuffer.
    let bodyData: ArrayBuffer;

    if (hasArrayBuffer(sdkRes)) {
      bodyData = await sdkRes.arrayBuffer();
    } else if (sdkRes instanceof Uint8Array) {
      bodyData = arrayBufferFromView(sdkRes);
    } else if (sdkRes instanceof ArrayBuffer) {
      bodyData = sdkRes;
    } else if (ArrayBuffer.isView(sdkRes)) {
      bodyData = arrayBufferFromView(sdkRes as ArrayBufferView);
    } else if (isWebReadableStream(sdkRes)) {
      bodyData = await arrayBufferFromWebStream(sdkRes);
    } else if (isNodeReadableStream(sdkRes)) {
      bodyData = await arrayBufferFromNodeStream(sdkRes);
    } else {
      throw new Error('Unexpected ElevenLabs response type.');
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
