import {
  createOutlinesClient,
  type CourseOption,
  type CourseOutline,
  type SectionOption,
  type SubjectOption,
  type TermOption,
  type ValueOption,
  type YearOption
} from '$lib/sfu/outlines/client';
import type { ToolFunctionDefinition } from '$lib/shared/tools/types';

const outlinesClient = createOutlinesClient();

type Instructor = NonNullable<CourseOutline['instructor']>[number];
type ScheduleEntry = NonNullable<CourseOutline['courseSchedule']>[number];
type ExamEntry = NonNullable<CourseOutline['examSchedule']>[number];
type GradeItem = NonNullable<CourseOutline['grades']>[number];
type TextItem = NonNullable<CourseOutline['requiredText']>[number];

const MAX_LIST_LIMIT = 25;
const DEFAULT_LIMIT = 20;

const toSimpleValueOption = (option: ValueOption | YearOption | TermOption | SubjectOption) => ({
  value: option.value,
  text: option.text ?? null
});

const toCourseResponse = (option: CourseOption) => ({
  value: option.value,
  text: option.text ?? null,
  title: option.title ?? null
});

const toSectionResponse = (option: SectionOption) => ({
  value: option.value,
  text: option.text ?? null,
  title: option.title ?? null,
  classType: option.classType ?? null,
  sectionCode: option.sectionCode ?? null,
  associatedClass: option.associatedClass ?? null
});

const clampLimit = (raw: unknown) => {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(raw)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(MAX_LIST_LIMIT, parsed));
    }
  }
  return DEFAULT_LIMIT;
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

const requireStringArg = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new Error(`Missing required argument: ${key}`);
};

const simplifyOutline = (outline: CourseOutline) => {
  const info = outline.info ?? {};
  const pick = <T extends object, K extends keyof T>(target: T, keys: K[]): Partial<T> => {
    const result: Partial<T> = {};
    for (const key of keys) {
      if (key in target && target[key] != null) {
        result[key] = target[key];
      }
    }
    return result;
  };

  return {
    source: 'sfu_course_outlines',
    info: pick(info, [
      'name',
      'title',
      'description',
      'courseDetails',
      'units',
      'term',
      'section',
      'type',
      'prerequisites',
      'corequisites',
      'requiredReadingNotes',
      'notes',
      'materials',
      'designation',
      'deliveryMethod',
      'specialTopic',
      'shortNote',
      'gradingNotes'
    ] as Array<keyof typeof info>),
    instructors: (outline.instructor ?? []).map((entry) =>
      pick(entry as Instructor, [
        'name',
        'commonName',
        'firstName',
        'lastName',
        'email',
        'phone',
        'office',
        'officeHours',
        'roleCode'
      ] as Array<keyof Instructor>)
    ),
    courseSchedule: (outline.courseSchedule ?? []).map((entry) =>
      pick(entry as ScheduleEntry, [
        'sectionCode',
        'days',
        'startTime',
        'endTime',
        'startDate',
        'endDate',
        'location',
        'campus',
        'instructor'
      ] as Array<keyof ScheduleEntry>)
    ),
    examSchedule: (outline.examSchedule ?? []).map((entry) =>
      pick(entry as ExamEntry, [
        'sectionCode',
        'days',
        'startTime',
        'endTime',
        'startDate',
        'endDate',
        'location',
        'campus'
      ] as Array<keyof ExamEntry>)
    ),
    grades: (outline.grades ?? []).map((entry) => pick(entry as GradeItem, ['description', 'weight'] as Array<keyof GradeItem>)),
    requiredText: (outline.requiredText ?? []).map((entry) => pick(entry as TextItem, ['title', 'details'] as Array<keyof TextItem>)),
    optionalText: (outline.optionalText ?? []).map((entry) => pick(entry as TextItem, ['title', 'details'] as Array<keyof TextItem>)),
    recommendedText: (outline.recommendedText ?? []).map((entry) => pick(entry as TextItem, ['title', 'details'] as Array<keyof TextItem>))
  };
};

const handleListYears = async (_args: Record<string, unknown>) => {
  const years = await outlinesClient.listYears();
  return {
    source: 'sfu_course_outlines',
    years: years.slice(0, MAX_LIST_LIMIT).map(toSimpleValueOption)
  };
};

const handleListTerms = async (args: Record<string, unknown>) => {
  const year = requireStringArg(args, 'year');
  const terms = await outlinesClient.listTerms(year);
  return {
    source: 'sfu_course_outlines',
    year,
    terms: terms.slice(0, MAX_LIST_LIMIT).map(toSimpleValueOption)
  };
};

const handleListSubjects = async (args: Record<string, unknown>) => {
  const year = requireStringArg(args, 'year');
  const term = requireStringArg(args, 'term');
  const subjects = await outlinesClient.listSubjects(year, term);
  const limit = clampLimit(args.limit);
  return {
    source: 'sfu_course_outlines',
    year,
    term,
    subjects: subjects.slice(0, limit).map(toSimpleValueOption)
  };
};

const handleListCourses = async (args: Record<string, unknown>) => {
  const year = requireStringArg(args, 'year');
  const term = requireStringArg(args, 'term');
  const subject = requireStringArg(args, 'subject');
  const limit = clampLimit(args.limit);
  const courses = await outlinesClient.listCourses(year, term, subject);
  return {
    source: 'sfu_course_outlines',
    year,
    term,
    subject,
    courses: courses.slice(0, limit).map(toCourseResponse)
  };
};

const handleListSections = async (args: Record<string, unknown>) => {
  const year = requireStringArg(args, 'year');
  const term = requireStringArg(args, 'term');
  const subject = requireStringArg(args, 'subject');
  const courseNumber = requireStringArg(args, 'courseNumber');
  const limit = clampLimit(args.limit);
  const sections = await outlinesClient.listSections(year, term, subject, courseNumber);
  return {
    source: 'sfu_course_outlines',
    year,
    term,
    subject,
    courseNumber,
    sections: sections.slice(0, limit).map(toSectionResponse)
  };
};

const handleGetOutline = async (args: Record<string, unknown>) => {
  const year = requireStringArg(args, 'year');
  const term = requireStringArg(args, 'term');
  const subject = requireStringArg(args, 'subject');
  const courseNumber = requireStringArg(args, 'courseNumber');
  const section = requireStringArg(args, 'section');
  const outline = await outlinesClient.getOutline(year, term, subject, courseNumber, section);
  return {
    source: 'sfu_course_outlines',
    year,
    term,
    subject,
    courseNumber,
    section,
    outline: simplifyOutline(outline)
  };
};

const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  list_years: handleListYears,
  list_terms: handleListTerms,
  list_subjects: handleListSubjects,
  list_courses: handleListCourses,
  list_sections: handleListSections,
  get_course_outline: handleGetOutline
};

export const SFU_OUTLINES_TOOLS: ToolFunctionDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_years',
      description: 'List the most recent academic years with available course outlines at SFU.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_terms',
      description: 'List the academic terms (e.g., fall, spring) available for a given year.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description: 'Academic year value returned by list_years (e.g., "2024").'
          }
        },
        required: ['year']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_subjects',
      description: 'List SFU subjects (departments) that offer courses in a specific year and term.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description: 'Academic year value (e.g., "2024").'
          },
          term: {
            type: 'string',
            description: 'Academic term identifier (e.g., "fall").'
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of subjects to return (default 20, max 25).'
          }
        },
        required: ['year', 'term']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_courses',
      description: 'List courses for a given subject during a specific year and term.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description: 'Academic year (e.g., "2024").'
          },
          term: {
            type: 'string',
            description: 'Academic term identifier (e.g., "fall").'
          },
          subject: {
            type: 'string',
            description: 'Subject code (e.g., "CMPT").'
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of courses to return (default 20, max 25).'
          }
        },
        required: ['year', 'term', 'subject']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_sections',
      description: 'List sections for a specific SFU course.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description: 'Academic year (e.g., "2024").'
          },
          term: {
            type: 'string',
            description: 'Academic term (e.g., "fall").'
          },
          subject: {
            type: 'string',
            description: 'Subject code (e.g., "CMPT").'
          },
          courseNumber: {
            type: 'string',
            description: 'Course number (e.g., "120").'
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of sections to return (default 20, max 25).'
          }
        },
        required: ['year', 'term', 'subject', 'courseNumber']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_course_outline',
      description: 'Fetch the full course outline for a specific SFU course section.',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description: 'Academic year (e.g., "2024").'
          },
          term: {
            type: 'string',
            description: 'Academic term (e.g., "fall").'
          },
          subject: {
            type: 'string',
            description: 'Subject code (e.g., "CMPT").'
          },
          courseNumber: {
            type: 'string',
            description: 'Course number (e.g., "120").'
          },
          section: {
            type: 'string',
            description: 'Section identifier (e.g., "D100").'
          }
        },
        required: ['year', 'term', 'subject', 'courseNumber', 'section']
      }
    }
  }
];

interface GlobalSfuToolRegistry {
  SFU_OUTLINES_TOOLS?: ToolFunctionDefinition[];
}

if (typeof globalThis !== 'undefined') {
  const globalScope = globalThis as GlobalSfuToolRegistry;
  if (!Array.isArray(globalScope.SFU_OUTLINES_TOOLS)) {
    globalScope.SFU_OUTLINES_TOOLS = SFU_OUTLINES_TOOLS;
  }
}

export const executeSfuOutlinesTool = async (name: string, rawArgs: unknown) => {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unsupported tool: ${name}`);
  }
  const args = parseArguments(rawArgs);
  const result = await handler(args);
  return result;
};
