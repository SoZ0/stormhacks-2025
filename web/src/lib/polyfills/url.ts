// Lightweight browser-oriented polyfill for Node's legacy `url` module APIs.
// Provides the small subset of functionality that Pixi uses: parse/format/resolve.

type ParsedUrlQuery = Record<string, string | string[]>;

export interface UrlObject {
  href?: string;
  protocol?: string;
  slashes?: boolean;
  auth?: string;
  host?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  query?: string | ParsedUrlQuery;
  hash?: string;
  path?: string;
}

const ensureUrl = (value: string | URL): URL => {
  if (value instanceof URL) {
    return value;
  }
  try {
    return new URL(value);
  } catch {
    const base = typeof window !== 'undefined' && window.location
      ? window.location.href
      : 'http://localhost';
    return new URL(value, base);
  }
};

export const parse = (value: string, parseQueryString = false): UrlObject => {
  const url = ensureUrl(value);
  const auth = url.username || url.password ? `${url.username}:${url.password}` : undefined;
  const queryString = url.search ? url.search.slice(1) : undefined;
  return {
    href: url.href,
    protocol: url.protocol,
    slashes: url.href.includes('//'),
    auth,
    host: url.host || undefined,
    hostname: url.hostname || undefined,
    port: url.port || undefined,
    pathname: url.pathname || undefined,
    search: url.search || undefined,
    query: parseQueryString
      ? Object.fromEntries(url.searchParams.entries())
      : queryString,
    hash: url.hash || undefined,
    path: `${url.pathname}${url.search}` || undefined
  };
};

const buildSearch = (object: UrlObject): string => {
  if (object.search != null) {
    return object.search.startsWith('?') || object.search === ''
      ? object.search
      : `?${object.search}`;
  }
  if (typeof object.query === 'string') {
    return object.query ? `?${object.query}` : '';
  }
  if (object.query && typeof object.query === 'object') {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(object.query)) {
      const value = Array.isArray(raw) ? raw : [raw];
      for (const entry of value) {
        params.append(key, entry ?? '');
      }
    }
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
  }
  return '';
};

export const format = (object: UrlObject | URL): string => {
  if (object instanceof URL) {
    return object.toString();
  }
  if (object.href) {
    return object.href;
  }
  const protocol = object.protocol ?? '';
  const slashes = object.slashes ?? Boolean(protocol);
  const auth = object.auth ? `${object.auth}@` : '';
  const host = object.host || (object.hostname ? `${object.hostname}${object.port ? `:${object.port}` : ''}` : '');
  const search = buildSearch(object);
  const hash = object.hash ?? '';
  const pathname = object.pathname ?? '';
  const prefix = protocol ? `${protocol}${slashes ? '//' : ''}` : slashes ? '//' : '';
  return `${prefix}${auth}${host}${pathname}${search}${hash}`;
};

export const resolve = (from: string, to: string): string => {
  try {
    return new URL(to, ensureUrl(from)).toString();
  } catch {
    return to;
  }
};

export const URLSearchParams = globalThis.URLSearchParams;
export const URL = globalThis.URL;

export default {
  parse,
  format,
  resolve,
  URLSearchParams,
  URL
};
