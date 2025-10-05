import { marked } from 'marked';
import type { MarkedOptions } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { IOptions as SanitizeOptions } from 'sanitize-html';

const MARKED_OPTIONS: MarkedOptions = {
  breaks: true,
  gfm: true
};

const SANITIZE_OPTIONS: SanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'table', 'thead', 'tbody', 'tfoot']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: (tagName: string, attribs: sanitizeHtml.Attributes) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: attribs.rel ?? 'noopener noreferrer',
        target: attribs.target ?? '_blank'
      }
    })
  }
};

marked.setOptions(MARKED_OPTIONS);

export const markdownToHtml = (input: string | undefined | null): string => {
  if (!input) return '';
  const rawHtml = marked.parse(input) as string;
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
};
