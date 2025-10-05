import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import {
  SETTINGS_COOKIE,
  defaultSettings,
  maskSettingsForClient,
  parseSettings,
  type ClientSettings,
  type LLMSettings
} from '$lib/llm/settings';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: !dev,
  maxAge: 60 * 60 * 24 * 365
};

const cloneSettings = (settings: LLMSettings): LLMSettings => ({
  provider: settings.provider,
  model: settings.model,
  options: { ...settings.options },
  tts: { ...settings.tts }
});

export const createDefaultSettings = (): LLMSettings => cloneSettings(defaultSettings);

export const getStoredSettings = (cookies: Cookies): LLMSettings => {
  const raw = cookies.get(SETTINGS_COOKIE);
  const parsed = parseSettings(raw);
  return parsed ? cloneSettings(parsed) : createDefaultSettings();
};

export const saveStoredSettings = (cookies: Cookies, settings: LLMSettings) => {
  const serialized = JSON.stringify(settings);
  cookies.set(SETTINGS_COOKIE, serialized, cookieOptions);
};

export const getClientSettings = (settings: LLMSettings): ClientSettings => maskSettingsForClient(settings);

export const updateStoredSettings = (
  cookies: Cookies,
  updater: (current: LLMSettings) => LLMSettings
): LLMSettings => {
  const current = getStoredSettings(cookies);
  const next = updater(cloneSettings(current));
  saveStoredSettings(cookies, next);
  return next;
};
