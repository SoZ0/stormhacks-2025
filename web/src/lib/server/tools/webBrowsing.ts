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

const STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'about',
  'per',
  'at',
  'by',
  'of',
  'in',
  'on',
  'a',
  'an',
  'or',
  'to',
  'is',
  'are'
]);

const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;

const normalizePlainText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const dedupe = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (value == null) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const tokenizeQuery = (query: string): string[] => {
  if (!query) {
    return [];
  }
  const normalized = normalizePlainText(query);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(' ')
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
};

interface SfuPageEntry {
  url: string;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  weight: number;
}

interface PreparedSfuPage extends SfuPageEntry {
  normalizedTitle: string;
  normalizedDescription: string;
  normalizedKeywords: string[];
}

const SFU_PAGE_ENTRIES: readonly SfuPageEntry[] = [
  {
    url: 'https://www.sfu.ca/students/deadlines.html',
    title: 'Important Dates and Deadlines',
    description:
      'Registrar-managed term calendars covering registration, course change, tuition payment, and exam deadlines for the academic year.',
    category: 'Registrar & Enrolment',
    keywords: [
      'dates and deadlines',
      'academic deadlines',
      'registration dates',
      'course add drop',
      'tuition deadline',
      'fee payment deadline',
      'exam schedule',
      'refund deadline',
      'registrar calendar'
    ],
    weight: 10
  },
  {
    url: 'https://www.sfu.ca/students/deadlines/fall.html',
    title: 'Fall Term Dates and Deadlines',
    description:
      'Fall term calendar with enrollment windows, course change deadlines, tuition due dates, and exam milestones.',
    category: 'Registrar & Enrolment',
    keywords: [
      'fall term',
      'fall deadlines',
      'autumn semester',
      'fall tuition deadline',
      'fall course drop',
      'fall exam schedule',
      'fall refund dates'
    ],
    weight: 9
  },
  {
    url: 'https://www.sfu.ca/students/deadlines/spring.html',
    title: 'Spring Term Dates and Deadlines',
    description:
      'Spring term calendar highlighting enrollment times, add/drop deadlines, tuition payment dates, and exam periods.',
    category: 'Registrar & Enrolment',
    keywords: [
      'spring term',
      'spring deadlines',
      'january semester',
      'spring tuition deadline',
      'spring course drop',
      'spring exam schedule',
      'spring refund dates'
    ],
    weight: 9
  },
  {
    url: 'https://www.sfu.ca/students/deadlines/summer.html',
    title: 'Summer Term Dates and Deadlines',
    description:
      'Summer term calendar outlining registration periods, course change windows, tuition deadlines, and exam timelines.',
    category: 'Registrar & Enrolment',
    keywords: [
      'summer term',
      'summer deadlines',
      'may semester',
      'summer tuition deadline',
      'summer course drop',
      'summer exam schedule',
      'summer refund dates'
    ],
    weight: 9
  },
  {
    url: 'https://www.sfu.ca/students/calendar.html',
    title: 'SFU Academic Calendar',
    description:
      'Official academic calendar covering program requirements, university regulations, and policy information for the current academic year.',
    category: 'Registrar & Enrolment',
    keywords: [
      'academic calendar',
      'program requirements',
      'university regulations',
      'degree requirements',
      'calendar policies',
      'calendar deadlines'
    ],
    weight: 8
  },
  {
    url: 'https://www.sfu.ca/students/enrolment-services/fees/how-to-pay.html',
    title: 'How to Pay Tuition and Student Fees',
    description:
      'Step-by-step instructions for paying tuition and student fees, including online banking, wire transfers, and third-party payments.',
    category: 'Fees & Finances',
    keywords: [
      'tuition payment',
      'fee payment',
      'how to pay',
      'online banking',
      'wire transfer',
      'payment methods',
      'student fees'
    ],
    weight: 8
  },
  {
    url: 'https://www.sfu.ca/students/calendar/current/fees-and-regulations/tuition-fees/undergraduate.html',
    title: 'Undergraduate Tuition and Fees',
    description:
      'Academic Calendar breakdown of undergraduate tuition rates, mandatory supplementary fees, and refund policies.',
    category: 'Fees & Finances',
    keywords: [
      'undergraduate tuition',
      'tuition fees',
      'supplementary fees',
      'fee schedule',
      'tuition rates',
      'domestic tuition',
      'international tuition'
    ],
    weight: 7
  },
  {
    url: 'https://www.sfu.ca/students/calendar/current/fees-and-regulations/tuition-fees/graduate.html',
    title: 'Graduate Tuition and Fees',
    description:
      'Academic Calendar listing of graduate tuition rates, installment schedules, and program-specific fee information.',
    category: 'Fees & Finances',
    keywords: [
      'graduate tuition',
      'graduate fees',
      'masters tuition',
      'phd tuition',
      'tuition schedule',
      'graduate fee deadline'
    ],
    weight: 7
  },
  {
    url: 'https://www.sfu.ca/students/calendar/current/fees-and-regulations/tuition-fees/refund-schedule.html',
    title: 'Tuition Refund Schedule',
    description:
      'Refund schedule outlining tuition repayment percentages, withdrawal deadlines, and penalty timelines.',
    category: 'Fees & Finances',
    keywords: [
      'refund schedule',
      'tuition refund',
      'course withdrawal',
      'refund deadlines',
      'penalty schedule',
      'drop deadline',
      'financial penalty'
    ],
    weight: 7
  },
  {
    url: 'https://www.sfu.ca/students/enrolment-services/exams.html',
    title: 'Exams and Exam Schedules',
    description:
      'Registrar information on exam schedules, room assignments, deferred exams, and regulations.',
    category: 'Registrar & Enrolment',
    keywords: [
      'exam schedule',
      'final exams',
      'deferred exam',
      'exam timetable',
      'exam conflicts',
      'exam regulations'
    ],
    weight: 6
  },
  {
    url: 'https://www.sfu.ca/students/enrolment-services/gosfu.html',
    title: 'GoSFU Student Center Guide',
    description:
      'Guide to using the GoSFU Student Center for enrollment, waitlists, swapping courses, and updating personal information.',
    category: 'Registrar & Enrolment',
    keywords: [
      'gosfu',
      'student center',
      'class enrollment',
      'schedule changes',
      'waitlist',
      'swap classes',
      'enrollment tools'
    ],
    weight: 6
  },
  {
    url: 'https://www.sfu.ca/students/financial-aid.html',
    title: 'Financial Aid and Awards',
    description:
      'Overview of scholarships, bursaries, loans, and application timelines for student financial assistance.',
    category: 'Fees & Finances',
    keywords: [
      'financial aid',
      'scholarships',
      'bursaries',
      'grants',
      'loans',
      'financial assistance',
      'aid deadlines',
      'award applications'
    ],
    weight: 6
  },
  {
    url: 'https://www.sfu.ca/students/academicadvising.html',
    title: 'Academic Advising',
    description:
      'Academic advising hub for degree planning, program requirements, and booking appointments with advisors.',
    category: 'Advising & Support',
    keywords: [
      'academic advising',
      'degree planning',
      'program requirements',
      'advising appointments',
      'course planning',
      'advising contact'
    ],
    weight: 5
  },
  {
    url: 'https://www.sfu.ca/students/residences/apply.html',
    title: 'Residence Application and Deadlines',
    description:
      'Residence and Housing application steps, key deadlines, and information on fees and move-in dates.',
    category: 'Housing & Community',
    keywords: [
      'residence application',
      'housing deadlines',
      'on-campus housing',
      'residence fees',
      'move-in dates',
      'residence waitlist'
    ],
    weight: 5
  },
  {
    url: 'https://www.sfu.ca/students/health.html',
    title: 'Health & Counselling Services',
    description:
      'Health & Counselling resources including medical appointments, mental health support, and wellness programming.',
    category: 'Advising & Support',
    keywords: [
      'health services',
      'counselling',
      'medical clinic',
      'mental health',
      'health appointments',
      'wellness resources'
    ],
    weight: 5
  },
  {
    url: 'https://www.sfu.ca/students/career.html',
    title: 'Career and Work Integrated Learning',
    description:
      'Career support, job search resources, résumé help, and co-op information for SFU students.',
    category: 'Career & Work',
    keywords: [
      'career services',
      'work integrated learning',
      'co-op',
      'job search',
      'career advising',
      'resume help'
    ],
    weight: 4
  }
] as const;

const PREPARED_SFU_PAGES: readonly PreparedSfuPage[] = SFU_PAGE_ENTRIES.map((entry) => ({
  ...entry,
  normalizedTitle: normalizePlainText(entry.title),
  normalizedDescription: normalizePlainText(entry.description),
  normalizedKeywords: dedupe([
    ...entry.keywords.map(normalizeToken).filter(Boolean),
    ...tokenizeQuery(entry.title),
    ...tokenizeQuery(entry.description)
  ])
}));

const DEFAULT_SEARCH_SUGGESTIONS = [
  'tuition deadlines',
  'course add drop dates',
  'fee payment methods',
  'exam schedule',
  'financial aid deadlines',
  'housing application dates'
];

const clampSearchLimit = (raw: unknown): number => {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(raw)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(MAX_SEARCH_LIMIT, parsed));
    }
  }
  return DEFAULT_SEARCH_LIMIT;
};

interface SfuSearchResult {
  title: string;
  url: string;
  description: string;
  category: string;
  keywords: string[];
  matchScore: number;
  matchedTerms: string[];
}

interface SearchComputation {
  results: SfuSearchResult[];
  matchedTokens: string[];
  fallbackReason?: string;
}

const searchSfuPageIndex = (query: string, limit: number): SearchComputation => {
  const trimmed = query.trim();
  const normalizedQuery = normalizePlainText(trimmed);
  const tokens = tokenizeQuery(trimmed);

  const toResult = (entry: PreparedSfuPage, score: number, matchedTerms: string[]): SfuSearchResult => ({
    title: entry.title,
    url: entry.url,
    description: entry.description,
    category: entry.category,
    keywords: entry.keywords,
    matchScore: score,
    matchedTerms: dedupe(matchedTerms)
  });

  const recommended = () =>
    [...PREPARED_SFU_PAGES]
      .sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title))
      .slice(0, limit)
      .map((entry) => toResult(entry, entry.weight, []));

  if (!tokens.length) {
    return {
      results: recommended(),
      matchedTokens: [],
      fallbackReason: 'Showing recommended SFU resources because no specific keywords were provided.'
    };
  }

  const matches: { entry: PreparedSfuPage; score: number; matchedTerms: string[] }[] = [];

  for (const entry of PREPARED_SFU_PAGES) {
    let score = entry.weight;
    const matched = new Set<string>();

    if (normalizedQuery && entry.normalizedTitle.includes(normalizedQuery)) {
      score += Math.max(4, tokens.length * 2);
      matched.add(normalizedQuery);
    }

    for (const token of tokens) {
      if (entry.normalizedTitle.includes(token)) {
        score += 6;
        matched.add(token);
        continue;
      }

      if (entry.normalizedKeywords.includes(token)) {
        score += 5;
        matched.add(token);
        continue;
      }

      if (entry.normalizedKeywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) {
        score += 4;
        matched.add(token);
        continue;
      }

      if (entry.normalizedDescription.includes(token)) {
        score += 2;
        matched.add(token);
      }
    }

    if (matched.size > 0) {
      matches.push({ entry, score, matchedTerms: Array.from(matched) });
    }
  }

  if (!matches.length) {
    return {
      results: recommended(),
      matchedTokens: tokens,
      fallbackReason: 'No direct matches were found; showing high-value SFU resources instead.'
    };
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.entry.weight !== a.entry.weight) return b.entry.weight - a.entry.weight;
    return a.entry.title.localeCompare(b.entry.title);
  });

  const limited = matches.slice(0, limit);

  return {
    results: limited.map((match) => toResult(match.entry, match.score, match.matchedTerms)),
    matchedTokens: dedupe(limited.flatMap((match) => match.matchedTerms))
  };
};

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

const handleSearchSfuPages = async (args: Record<string, unknown>) => {
  const rawQuery = typeof args.query === 'string' ? args.query : '';
  const query = rawQuery.trim();
  const limit = clampSearchLimit(args.limit);
  const { results, matchedTokens, fallbackReason } = searchSfuPageIndex(query, limit);

  return {
    source: 'sfu_web_search',
    query,
    limit,
    results,
    matchedTokens,
    ...(fallbackReason
      ? { note: fallbackReason, suggestions: DEFAULT_SEARCH_SUGGESTIONS }
      : {})
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
  search_sfu_pages: handleSearchSfuPages,
  fetch_sfu_page: handleFetchSfuPage,
  fetch_web_page: handleFetchWebPage
};

export const WEB_BROWSING_TOOLS: ToolFunctionDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_sfu_pages',
      description:
        'Search curated Simon Fraser University student resources (deadlines, tuition, support pages) and return relevant links.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords describing the SFU resource to find (e.g., "tuition deadlines", "exam schedule").'
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of results to return (default 8, max 20).'
          }
        },
        required: ['query']
      }
    }
  },
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
