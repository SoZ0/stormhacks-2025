import { defaultProvider } from './providers';
import type { ProviderId } from './providers';

export const SETTINGS_COOKIE = 'llm-settings';

export interface LLMSettings {
  provider: ProviderId;
  model: string;
}

export const defaultSettings: LLMSettings = {
  provider: defaultProvider.id,
  model: ''
};

export const parseSettings = (raw: string | undefined | null): LLMSettings | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LLMSettings>;
    if (!parsed || typeof parsed !== 'object') return null;

    const provider = parsed.provider;
    const model = parsed.model;

    if (!provider || typeof provider !== 'string') return null;
    if (typeof model !== 'string') return null;

    return { provider, model };
  } catch {
    return null;
  }
};
