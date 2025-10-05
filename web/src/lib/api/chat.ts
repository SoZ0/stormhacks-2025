import { randomUUID } from 'crypto';
import type { Cookies } from '@sveltejs/kit';
import { findProvider } from '$lib/server/providerStore';
import { streamProviderChat, type ProviderAttachment, type ProviderMessage } from '$lib/server/llm';
import { normalizeGenerationOptions } from '$lib/llm/settings';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

interface ClientAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface ClientMessage {
  sender: 'user' | 'bot';
  text: string;
  timestamp?: string;
  attachments?: ClientAttachment[];
}

const MAX_ATTACHMENTS_PER_MESSAGE = 6;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:([^;\s]+);base64,([A-Za-z0-9+/=\s]+)$/;

const sanitizeBase64 = (value: string): string => value.replace(/\s+/g, '');

const toClientAttachment = (value: unknown): ClientAttachment | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as {
    id?: unknown;
    name?: unknown;
    mimeType?: unknown;
    size?: unknown;
    dataUrl?: unknown;
  };

  const dataUrl = typeof source.dataUrl === 'string' ? source.dataUrl.trim() : '';
  const mimeType = typeof source.mimeType === 'string' ? source.mimeType.trim() : '';

  if (!dataUrl || !mimeType) {
    return null;
  }

  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : randomUUID();
  const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'attachment';
  const sizeValue =
    typeof source.size === 'number'
      ? source.size
      : typeof source.size === 'string'
        ? Number.parseInt(source.size, 10)
        : 0;
  const size = Number.isFinite(sizeValue) && sizeValue > 0 ? Math.floor(sizeValue) : 0;

  return {
    id,
    name,
    mimeType,
    size,
    dataUrl
  };
};

const coerceClientAttachments = (value: unknown): ClientAttachment[] | null => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return null;
  }

  const attachments: ClientAttachment[] = [];

  for (const entry of value) {
    const attachment = toClientAttachment(entry);
    if (!attachment) {
      return null;
    }
    attachments.push(attachment);
  }

  return attachments;
};

interface ParsedAttachment {
  mimeType: string;
  data: string;
  size: number;
}

const parseAttachmentDataUrl = (attachment: ClientAttachment): ParsedAttachment | null => {
  const match = DATA_URL_PATTERN.exec(attachment.dataUrl);
  if (!match) {
    return null;
  }

  const [, mime, base64Raw] = match;
  const normalizedMime = attachment.mimeType || mime?.trim() || '';
  if (!normalizedMime) {
    return null;
  }

  const base64 = sanitizeBase64(base64Raw ?? '');
  if (!base64) {
    return null;
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      return null;
    }

    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return null;
    }

    return {
      mimeType: normalizedMime,
      data: base64,
      size: buffer.byteLength
    };
  } catch {
    return null;
  }
};

const toProviderAttachments = (attachments: ClientAttachment[]): ProviderAttachment[] | null => {
  if (!attachments.length) {
    return [];
  }

  const normalized: ProviderAttachment[] = [];

  for (const attachment of attachments) {
    const parsed = parseAttachmentDataUrl(attachment);
    if (!parsed) {
      return null;
    }

    normalized.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: parsed.mimeType,
      size: parsed.size,
      data: parsed.data
    });
  }

  return normalized;
};

class InvalidAttachmentError extends Error {}

const normalizeClientTimestamp = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
      return trimmed;
    }
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
};

interface ChatRequestBody {
  provider: string;
  model: string;
  messages: unknown;
  systemPrompt?: string;
  options?: unknown;
  toolsEnabled?: unknown;
}

const toClientMessage = (value: unknown): ClientMessage | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as {
    sender?: unknown;
    text?: unknown;
    timestamp?: unknown;
    attachments?: unknown;
  };
  const senderRaw = typeof source.sender === 'string' ? source.sender.trim().toLowerCase() : '';
  const sender: ClientMessage['sender'] | null = senderRaw === 'user'
    ? 'user'
    : senderRaw === 'bot' || senderRaw === 'assistant'
      ? 'bot'
      : null;

  if (!sender) {
    return null;
  }

  const textValue = source.text;
  const text = typeof textValue === 'string' ? textValue : String(textValue ?? '');
  const timestamp = normalizeClientTimestamp(source.timestamp);
  const attachments = coerceClientAttachments((source as { attachments?: unknown }).attachments);

  if (attachments === null) {
    return null;
  }

  const base = timestamp ? { sender, text, timestamp } : { sender, text };
  return attachments.length ? { ...base, attachments } : base;
};

const coerceClientMessages = (value: unknown): ClientMessage[] | null => {
  if (Array.isArray(value)) {
    const normalized: ClientMessage[] = [];
    for (const entry of value) {
      const message = toClientMessage(entry);
      if (!message) {
        return null;
      }
      normalized.push(message);
    }
    return normalized;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const numericKeys = Object.keys(record)
      .filter((key) => /^\d+$/.test(key))
      .map((key) => Number.parseInt(key, 10))
      .sort((a, b) => a - b);

    if (numericKeys.length) {
      const entries = numericKeys.map((key) => record[String(key)]);
      return coerceClientMessages(entries);
    }
  }

  return null;
};

const formatHistoryTimestamp = (timestamp: string | undefined): string | null => {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return timestamp.trim() ? timestamp : null;
};

const normalizeHistory = (messages: ClientMessage[], systemPrompt?: string): ProviderMessage[] => {
  const history: ProviderMessage[] = [];

  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
    history.push({ role: 'system', content: systemPrompt.trim() });
  }

  for (const message of messages) {
    const timestamp = formatHistoryTimestamp(message.timestamp);
    const prefix = timestamp ? `[${timestamp}] ` : '';
    const content = `${prefix}${message.text}`;
    const entry: ProviderMessage = {
      role: message.sender === 'user' ? 'user' : 'assistant',
      content
    };

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length) {
      const normalizedAttachments = toProviderAttachments(attachments);
      if (!normalizedAttachments) {
        throw new InvalidAttachmentError('Attachment payload is invalid or exceeds the allowed size.');
      }
      if (normalizedAttachments.length) {
        entry.attachments = normalizedAttachments;
      }
    }

    history.push(entry);
  }

  return history;
};

const createStreamingResponse = (stream: ReadableStream<Uint8Array>): Response =>
  new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  });

export const handleChatRequest = async (
  payload: ChatRequestBody,
  cookies: Cookies
): Promise<Response> => {
  const { provider, model, messages, systemPrompt, options, toolsEnabled } = payload ?? {};

  if (!provider || typeof provider !== 'string') {
    throw new HttpError(400, 'provider is required');
  }

  if (!model || typeof model !== 'string') {
    throw new HttpError(400, 'model is required');
  }

  const normalizedMessages = coerceClientMessages(messages);
  if (!normalizedMessages) {
    throw new HttpError(400, 'messages must be an array');
  }

  const providerConfig = findProvider(cookies, provider);
  if (!providerConfig) {
    throw new HttpError(404, 'Unsupported provider');
  }

  let history: ProviderMessage[];
  try {
    history = normalizeHistory(
      normalizedMessages,
      typeof systemPrompt === 'string' ? systemPrompt : undefined
    );
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }

  const generationOptions = normalizeGenerationOptions(options);

  try {
    const stream = await streamProviderChat(
      providerConfig,
      model,
      history,
      typeof systemPrompt === 'string' ? systemPrompt : undefined,
      generationOptions,
      toolsEnabled === undefined ? true : toolsEnabled === true
    );
    return createStreamingResponse(stream);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpError(500, message);
  }
};
