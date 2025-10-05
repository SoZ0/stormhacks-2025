export interface ElevenLabsVoiceOption {
  id: string;
  name: string;
}

interface ElevenLabsVoiceListResponse {
  voices: ElevenLabsVoiceOption[];
  error?: string;
}

export const listElevenLabsVoices = async (): Promise<ElevenLabsVoiceOption[]> => {
  const response = await fetch('/api/tts/voices', { method: 'GET' });
  let data: ElevenLabsVoiceListResponse | null = null;

  try {
    data = (await response.json()) as ElevenLabsVoiceListResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error ?? `Unable to load ElevenLabs voices (${response.status})`;
    throw new Error(message);
  }

  return Array.isArray(data?.voices) ? data.voices : [];
};
