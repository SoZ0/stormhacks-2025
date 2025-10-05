import sanitizeHtml from 'sanitize-html';
import type { ToolFunctionDefinition } from '$lib/server/tools/types';

const DEFAULT_MAX_CHARACTERS = 6000;
const ABSOLUTE_MAX_CHARACTERS = 12000;
const FETCH_TIMEOUT_MS = 15000;

const SFU_DOMAIN_SUFFIX = '.sfu.ca';

const USER_AGENT =
  'Mozilla/5.0 (compatible; StormHacksAssistant/1.0; +https://github.com/stormhacks)';

const privateHostPatterns = [
  /^localhost$/i,
  /^127(?:\.\d{1,3}){3}$/,
  /^0(?:\.\d{1,3}){3}$/,
  /^10(?:\.\d{1,3}){3}$/,
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^169\.254(?:\.\d{1,3}){2}$/,
  /\.local$/i,
  /\.internal$/i
];

const sanitizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  const value = sanitizeWhitespace(sanitizeHtml(match[1] ?? '', { allowedTags: [], allowedAttributes: {} }));
  return value || null;
};

const extractMetaDescription = (html: string): string | null => {
  const match = html.match(
    /<meta[^>]*name\s*=\s*"description"[^>]*content\s*=\s*"([^"]*)"[^>]*>/i
  );
  if (!match) return null;
  const value = sanitizeWhitespace(match[1] ?? '');
  return value || null;
};

const extractHeadings = (html: string): string[] => {
  const headings: string[] = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const raw = match[2] ?? '';
    const text = sanitizeWhitespace(sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }));
    if (text) headings.push(text);
  }
  return headings.slice(0, 15);
};

const htmlToPlainText = (html: string): string => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|header|footer|main|aside)>/gi, '\n\n')
    .replace(/<\/(h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  const plain = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r/g, '');

  const lines = plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.join('\n');
};

const clampMaxCharacters = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1000, Math.min(ABSOLUTE_MAX_CHARACTERS, Math.floor(value)));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1000, Math.min(ABSOLUTE_MAX_CHARACTERS, parsed));
    }
  }
  return DEFAULT_MAX_CHARACTERS;
};

const parseArguments = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      throw new Error(`Invalid JSON arguments: ${(error as Error).message}`);
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return {};
};

const requireUrlArg = (args: Record<string, unknown>): URL => {
  const value = args.url;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing required argument: url');
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Invalid URL provided.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP(S) URLs are supported.');
  }

  const hostname = url.hostname.trim();
  if (!hostname) {
    throw new Error('URL must include a valid hostname.');
  }

  for (const pattern of privateHostPatterns) {
    if (pattern.test(hostname)) {
      throw new Error('Refusing to fetch private or local network addresses.');
    }
  }

  return url;
};

const enforceSfuDomain = (url: URL) => {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'sfu.ca') return;
  if (hostname.endsWith(SFU_DOMAIN_SUFFIX)) return;
  throw new Error('URL must belong to a Simon Fraser University domain ending with sfu.ca.');
};

const fetchWithTimeout = async (
  url: URL
): Promise<{ status: number; body: string; contentType: string | null }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type');
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    if (!contentType || !contentType.includes('html')) {
      throw new Error('Only HTML responses are supported for summarization.');
    }

    return { status: response.status, body, contentType };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timed out while fetching the page.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const buildFetchResponse = (
  url: URL,
  html: string,
  maxCharacters: number
) => {
  const title = extractTitle(html);
  const description = extractMetaDescription(html);
  const headings = extractHeadings(html);
  const fullText = htmlToPlainText(html);

  const truncated = fullText.length > maxCharacters;
  const content = truncated ? fullText.slice(0, maxCharacters) : fullText;
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    url: url.toString(),
    hostname: url.hostname,
    fetchedAt: new Date().toISOString(),
    metadata: {
      title,
      description,
      headings
    },
    content,
    truncated,
    characterCount: content.length,
    wordCount
  };
};

const handleFetchSfuPage = async (args: Record<string, unknown>) => {
  const url = requireUrlArg(args);
  enforceSfuDomain(url);
  const maxCharacters = clampMaxCharacters(args.maxCharacters);
  const { status, body } = await fetchWithTimeout(url);
  return {
    source: 'sfu_web',
    statusCode: status,
    ...buildFetchResponse(url, body, maxCharacters)
  };
};

const handleFetchWebPage = async (args: Record<string, unknown>) => {
  const url = requireUrlArg(args);
  const maxCharacters = clampMaxCharacters(args.maxCharacters);
  const { status, body } = await fetchWithTimeout(url);
  return {
    source: 'general_web',
    statusCode: status,
    ...buildFetchResponse(url, body, maxCharacters)
  };
};

const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  fetch_sfu_page: handleFetchSfuPage,
  fetch_web_page: handleFetchWebPage
};

export const WEB_BROWSING_TOOLS: ToolFunctionDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_sfu_page',
      description:
        'Fetch and summarize textual content from a Simon Fraser University webpage (domains ending with sfu.ca).',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Absolute URL to the SFU page (must use https:// and end with sfu.ca).'
          },
          maxCharacters: {
            type: 'integer',
            description: 'Maximum characters of page text to return (default 6000, max 12000).'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_web_page',
      description: 'Fetch and summarize textual content from a public webpage on the internet.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Absolute HTTP(S) URL to fetch.'
          },
          maxCharacters: {
            type: 'integer',
            description: 'Maximum characters of page text to return (default 6000, max 12000).'
          }
        },
        required: ['url']
      }
    }
  }
];

export const executeWebBrowsingTool = async (name: string, rawArgs: unknown) => {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unsupported web browsing tool: ${name}`);
  }
  const args = parseArguments(rawArgs);
  return handler(args);
};
