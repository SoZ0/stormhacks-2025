const DEFAULT_BASE_URL = 'https://www.sfu.ca/bin/wcm/course-outlines';

export { DEFAULT_BASE_URL as DEFAULT_OUTLINES_BASE_URL };

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ValueOption {
  value: string;
  text?: string;
}

export type YearOption = ValueOption;
export type TermOption = ValueOption;
export type SubjectOption = ValueOption;

export interface CourseOption extends ValueOption {
  title?: string;
}

export interface SectionOption extends CourseOption {
  classType?: string;
  sectionCode?: string;
  associatedClass?: string;
}

export interface OutlineInstructor {
  profileUrl?: string;
  commonName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  roleCode?: string;
  name?: string;
  officeHours?: string;
  office?: string;
  email?: string;
  [key: string]: unknown;
}

export interface OutlineMeeting {
  campus?: string;
  days?: string;
  sectionCode?: string;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
  isExam?: boolean;
  location?: string;
  instructor?: string;
  [key: string]: unknown;
}

export interface OutlineGradeItem {
  description?: string;
  weight?: string;
  [key: string]: unknown;
}

export interface OutlineTextItem {
  title?: string;
  details?: string;
  [key: string]: unknown;
}

export interface OutlineInfo {
  educationalGoals?: string;
  notes?: string;
  deliveryMethod?: string;
  description?: string;
  section?: string;
  units?: string;
  title?: string;
  type?: string;
  classNumber?: string;
  departmentalUgradNotes?: string;
  prerequisites?: string;
  number?: string;
  requiredReadingNotes?: string;
  registrarNotes?: string;
  shortNote?: string;
  outlinePath?: string;
  term?: string;
  gradingNotes?: string;
  corequisites?: string;
  dept?: string;
  degreeLevel?: string;
  specialTopic?: string;
  courseDetails?: string;
  materials?: string;
  name?: string;
  designation?: string;
  [key: string]: unknown;
}

export interface CourseOutline {
  info?: OutlineInfo;
  instructor?: OutlineInstructor[];
  courseSchedule?: OutlineMeeting[];
  examSchedule?: OutlineMeeting[];
  grades?: OutlineGradeItem[];
  requiredText?: OutlineTextItem[];
  optionalText?: OutlineTextItem[];
  recommendedText?: OutlineTextItem[];
  [key: string]: unknown;
}

export interface OutlinesClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface SfuOutlinesClient {
  listYears(init?: RequestInit): Promise<YearOption[]>;
  listTerms(year: string | number, init?: RequestInit): Promise<TermOption[]>;
  listSubjects(year: string | number, term: string, init?: RequestInit): Promise<SubjectOption[]>;
  listCourses(
    year: string | number,
    term: string,
    subject: string,
    init?: RequestInit
  ): Promise<CourseOption[]>;
  listSections(
    year: string | number,
    term: string,
    subject: string,
    courseNumber: string | number,
    init?: RequestInit
  ): Promise<SectionOption[]>;
  getOutline(
    year: string | number,
    term: string,
    subject: string,
    courseNumber: string | number,
    section: string,
    init?: RequestInit
  ): Promise<CourseOutline>;
}

export class SfuOutlinesApiError extends Error {
  readonly status?: number;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = 'SfuOutlinesApiError';
    this.status = options.status;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

interface ClientContext {
  baseUrl: string;
  fetchImpl: FetchLike;
}

const resolveFetch = (fetchOverride?: FetchLike): FetchLike => {
  if (fetchOverride) {
    return fetchOverride;
  }
  if (typeof fetch === 'function') {
    return fetch.bind(globalThis);
  }
  throw new SfuOutlinesApiError('Fetch API is not available; provide a custom fetch implementation.');
};

const normalizeBaseUrl = (value?: string): string => {
  const url = value?.trim();
  if (!url) {
    return DEFAULT_BASE_URL;
  }
  return url.replace(/\/?$/, '');
};

const normalizeSegment = (
  label: string,
  value: string | number,
  options: { lowercase?: boolean } = {}
): string => {
  if (value === null || value === undefined) {
    throw new SfuOutlinesApiError(`A non-empty ${label} is required.`);
  }
  const normalizedValue = String(value)
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!normalizedValue) {
    throw new SfuOutlinesApiError(`A non-empty ${label} is required.`);
  }
  const lowered = options.lowercase === false ? normalizedValue : normalizedValue.toLowerCase();
  return encodeURIComponent(lowered);
};

const buildUrl = (baseUrl: string, segments: string[]): string => {
  const url = new URL(baseUrl);
  url.search = segments.length ? segments.join('/') : '';
  return url.toString();
};

const extractApiErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const errorField = (payload as { error?: unknown }).error;
  if (typeof errorField === 'string' && errorField.trim().length) {
    return errorField.trim();
  }

  const messageField = (payload as { errorMessage?: unknown }).errorMessage;
  if (typeof messageField === 'string' && messageField.trim().length) {
    return messageField.trim();
  }

  return null;
};

const ensureArray = (payload: unknown, description: string): unknown[] => {
  if (!Array.isArray(payload)) {
    throw new SfuOutlinesApiError(`Expected ${description} array but received a different payload.`);
  }
  return payload;
};

const compact = <T>(list: Array<T | null | undefined>): T[] => list.filter((item): item is T => item != null);

const normalizeValueOption = (payload: unknown): ValueOption | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'string') {
    return null;
  }
  const text = (payload as { text?: unknown }).text;
  const normalized: ValueOption = {
    value: value.trim(),
    text: typeof text === 'string' && text.trim().length ? text.trim() : undefined
  };
  return normalized;
};

const normalizeCourseOption = (payload: unknown): CourseOption | null => {
  const base = normalizeValueOption(payload);
  if (!base) return null;
  const title = (payload as { title?: unknown }).title;
  return {
    ...base,
    title: typeof title === 'string' && title.trim().length ? title.trim() : undefined
  };
};

const normalizeSectionOption = (payload: unknown): SectionOption | null => {
  const base = normalizeCourseOption(payload);
  if (!base) return null;
  const source = payload as {
    classType?: unknown;
    sectionCode?: unknown;
    associatedClass?: unknown;
  };
  return {
    ...base,
    classType: typeof source.classType === 'string' && source.classType.trim().length ? source.classType.trim() : undefined,
    sectionCode:
      typeof source.sectionCode === 'string' && source.sectionCode.trim().length
        ? source.sectionCode.trim()
        : undefined,
    associatedClass:
      typeof source.associatedClass === 'string' && source.associatedClass.trim().length
        ? source.associatedClass.trim()
        : undefined
  };
};

const normalizeOutline = (payload: unknown): CourseOutline => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SfuOutlinesApiError('Expected course outline object but received a different payload.');
  }
  return payload as CourseOutline;
};

const request = async (
  ctx: ClientContext,
  segments: string[],
  init?: RequestInit
): Promise<unknown> => {
  const url = buildUrl(ctx.baseUrl, segments);
  const response = await ctx.fetchImpl(url, { ...init, method: 'GET' });

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new SfuOutlinesApiError('Failed to parse response as JSON.', {
      status: response.status,
      cause: error
    });
  }

  const apiError = extractApiErrorMessage(data);
  if (!response.ok) {
    throw new SfuOutlinesApiError(apiError ?? `Request failed with status ${response.status}.`, {
      status: response.status
    });
  }

  if (apiError) {
    throw new SfuOutlinesApiError(apiError, { status: response.status });
  }

  return data;
};

export const createOutlinesClient = (options: OutlinesClientOptions = {}): SfuOutlinesClient => {
  const ctx: ClientContext = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    fetchImpl: resolveFetch(options.fetch)
  };

  const listYears = async (init?: RequestInit): Promise<YearOption[]> => {
    const payload = await request(ctx, [], init);
    const list = ensureArray(payload, 'year options');
    return compact(list.map(normalizeValueOption));
  };

  const listTerms = async (
    year: string | number,
    init?: RequestInit
  ): Promise<TermOption[]> => {
    const payload = await request(ctx, [normalizeSegment('year', year, { lowercase: false })], init);
    const list = ensureArray(payload, 'term options');
    return compact(list.map(normalizeValueOption));
  };

  const listSubjects = async (
    year: string | number,
    term: string,
    init?: RequestInit
  ): Promise<SubjectOption[]> => {
    const payload = await request(
      ctx,
      [normalizeSegment('year', year, { lowercase: false }), normalizeSegment('term', term)],
      init
    );
    const list = ensureArray(payload, 'subject options');
    return compact(list.map(normalizeValueOption));
  };

  const listCourses = async (
    year: string | number,
    term: string,
    subject: string,
    init?: RequestInit
  ): Promise<CourseOption[]> => {
    const payload = await request(
      ctx,
      [
        normalizeSegment('year', year, { lowercase: false }),
        normalizeSegment('term', term),
        normalizeSegment('subject', subject)
      ],
      init
    );
    const list = ensureArray(payload, 'course options');
    return compact(list.map(normalizeCourseOption));
  };

  const listSections = async (
    year: string | number,
    term: string,
    subject: string,
    courseNumber: string | number,
    init?: RequestInit
  ): Promise<SectionOption[]> => {
    const payload = await request(
      ctx,
      [
        normalizeSegment('year', year, { lowercase: false }),
        normalizeSegment('term', term),
        normalizeSegment('subject', subject),
        normalizeSegment('course number', courseNumber)
      ],
      init
    );
    const list = ensureArray(payload, 'section options');
    return compact(list.map(normalizeSectionOption));
  };

  const getOutline = async (
    year: string | number,
    term: string,
    subject: string,
    courseNumber: string | number,
    section: string,
    init?: RequestInit
  ): Promise<CourseOutline> => {
    const payload = await request(
      ctx,
      [
        normalizeSegment('year', year, { lowercase: false }),
        normalizeSegment('term', term),
        normalizeSegment('subject', subject),
        normalizeSegment('course number', courseNumber),
        normalizeSegment('section', section)
      ],
      init
    );
    return normalizeOutline(payload);
  };

  return {
    listYears,
    listTerms,
    listSubjects,
    listCourses,
    listSections,
    getOutline
  };
};
