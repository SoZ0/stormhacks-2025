import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import {
  DEFAULT_PROVIDER_ID,
  defaultProviders,
  getProviderTemplate,
  providerTemplates,
  type ProviderConfig,
  type ProviderId,
  type ProviderKind
} from '$lib/llm/providers';

export const PROVIDERS_COOKIE = 'llm-providers';
const MASKED_VALUE = '***';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: !dev,
  maxAge: 60 * 60 * 24 * 365
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeSettings = (kind: ProviderKind, raw: unknown): Record<string, string> => {
  if (!isObject(raw)) return {};
  const template = getProviderTemplate(kind);
  if (!template) return {};

  const settings: Record<string, string> = {};
  for (const field of template.fields) {
    const candidate = raw[field.name];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      settings[field.name] = candidate.trim();
    }
  }
  return settings;
};

const sanitizeProvider = (raw: unknown): ProviderConfig | null => {
  if (!isObject(raw)) return null;

  const { id, label, kind, description, settings } = raw;
  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof label !== 'string' || !label.trim()) return null;
  if (typeof kind !== 'string') return null;

  const template = getProviderTemplate(kind as ProviderKind);
  if (!template) return null;

  const cleanSettings = sanitizeSettings(template.kind, settings);

  return {
    id: id.trim(),
    label: label.trim(),
    kind: template.kind,
    description: typeof description === 'string' ? description.trim() : undefined,
    settings: cleanSettings
  };
};

const parseProvidersCookie = (raw: string | undefined): ProviderConfig[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => sanitizeProvider(entry))
      .filter((entry): entry is ProviderConfig => Boolean(entry));
  } catch {
    return [];
  }
};

const mergeProviders = (stored: ProviderConfig[]): ProviderConfig[] => {
  const map = new Map<string, ProviderConfig>();
  for (const provider of defaultProviders) {
    map.set(provider.id, provider);
  }
  for (const provider of stored) {
    map.set(provider.id, provider);
  }
  return Array.from(map.values());
};

export const getProviders = (cookies: Cookies): ProviderConfig[] => {
  const raw = cookies.get(PROVIDERS_COOKIE);
  const stored = parseProvidersCookie(raw);
  return mergeProviders(stored);
};

export const findProvider = (
  cookies: Cookies,
  providerId: ProviderId
): ProviderConfig | undefined => getProviders(cookies).find((provider) => provider.id === providerId);

export const saveProviders = (cookies: Cookies, providers: ProviderConfig[]) => {
  const userDefined = providers.filter((provider) => provider.id !== DEFAULT_PROVIDER_ID);
  cookies.set(PROVIDERS_COOKIE, JSON.stringify(userDefined), cookieOptions);
};

const slugify = (value: string, fallback: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-');
  return slug.length > 0 ? slug : fallback;
};

export interface CreateProviderInput {
  kind: string;
  label?: string;
  description?: string;
  settings?: Record<string, string>;
}

export const createProviderConfig = (
  input: CreateProviderInput,
  existingProviders: ProviderConfig[]
): ProviderConfig => {
  const { kind, label, description, settings = {} } = input;
  if (typeof kind !== 'string') {
    throw new Error('Provider type is required.');
  }

  const template = providerTemplates.find((entry) => entry.kind === kind);
  if (!template) {
    throw new Error('Unsupported provider type.');
  }

  const finalLabel = (label ?? template.defaultLabel ?? template.label).trim();
  if (!finalLabel) {
    throw new Error('Provider name is required.');
  }

  const normalizedSettings: Record<string, string> = {};
  for (const field of template.fields) {
    const rawValue = settings[field.name];
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (field.required && !value) {
      throw new Error(`${field.label} is required.`);
    }

    if (value) {
      normalizedSettings[field.name] = value;
    }
  }

  const existingIds = new Set(existingProviders.map((provider) => provider.id));
  const baseSlug = slugify(finalLabel, template.kind);
  let candidate = `${template.kind}-${baseSlug}`;
  let suffix = 1;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${template.kind}-${baseSlug}-${suffix}`;
  }

  if (candidate === DEFAULT_PROVIDER_ID) {
    candidate = `${template.kind}-${baseSlug}-${Date.now()}`;
  }

  return {
    id: candidate,
    label: finalLabel,
    kind: template.kind,
    description: description?.trim() || template.description,
    settings: normalizedSettings
  };
};


export interface RemoveProviderResult {
  removed: ProviderConfig;
  providers: ProviderConfig[];
}

export const removeProvider = (
  cookies: Cookies,
  providerId: ProviderId
): RemoveProviderResult => {
  if (providerId === DEFAULT_PROVIDER_ID) {
    throw new Error('The default provider cannot be removed.');
  }

  const providers = getProviders(cookies);
  const removed = providers.find((provider) => provider.id === providerId);

  if (!removed) {
    throw new Error('Provider not found.');
  }

  const next = providers.filter((provider) => provider.id !== providerId);

  saveProviders(cookies, next);

  return {
    removed,
    providers: next
  };
};

export const maskProviderForClient = (provider: ProviderConfig): ProviderConfig => {
  const template = getProviderTemplate(provider.kind);
  if (!template) return provider;

  const maskedSettings: Record<string, string> = { ...provider.settings };
  for (const field of template.fields) {
    if (field.secret && maskedSettings[field.name]) {
      maskedSettings[field.name] = MASKED_VALUE;
    }
  }

  return { ...provider, settings: maskedSettings };
};

export const maskProvidersForClient = (providers: ProviderConfig[]): ProviderConfig[] =>
  providers.map((provider) => maskProviderForClient(provider));
