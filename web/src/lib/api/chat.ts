import type { Cookies } from '@sveltejs/kit';
import { findProvider } from '$lib/server/providerStore';
import { streamProviderChat, type ProviderAttachment, type ProviderMessage } from '$lib/server/llm';
import { normalizeGenerationOptions } from '$lib/llm/settings';

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const MAX_ATTACHMENTS_PER_MESSAGE = 6;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:([^;\s]+);base64,([A-Za-z0-9+/=\s]+)$/;

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

export interface ChatRequestPayload {
  provider?: unknown;
  model?: unknown;
  messages?: unknown;
  systemPrompt?: unknown;
  options?: unknown;
  toolsEnabled?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeBase64 = (value: string): string => value.replace(/\s+/g, '');

const decodeBase64 = (value: string): Uint8Array | null => {
  const atobRef = (globalThis as { atob?: (data: string) => string }).atob;

  try {
    if (typeof atobRef === 'function') {
      const binary = atobRef(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }
  } catch {
    return null;
  }

  try {
    const globalBuffer = (globalThis as { Buffer?: { from?: (v: string, encoding: string) => any } }).Buffer;
    if (globalBuffer?.from) {
      const buffer = globalBuffer.from(value, 'base64');
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
  } catch {
    return null;
  }

  return null;
};

const generateId = () => {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  return `attachment-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
};

const toClientAttachment = (value: unknown): ClientAttachment | null => {
  if (!isObject(value)) {
    return null;
  }

  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl.trim() : '';
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType.trim() : '';

  if (!dataUrl || !mimeType) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : generateId();
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'attachment';
  const sizeValue =
    typeof value.size === 'number'
      ? value.size
      : typeof value.size === 'string'
        ? Number.parseInt(value.size, 10)
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

  const decoded = decodeBase64(base64);
  if (!decoded || decoded.byteLength === 0 || decoded.byteLength > MAX_ATTACHMENT_BYTES) {
    return null;
  }

  return {
    mimeType: normalizedMime,
    data: base64,
    size: decoded.byteLength
  };
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

const toClientMessage = (value: unknown): ClientMessage | null => {
  if (!isObject(value)) {
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
  const attachments = coerceClientAttachments(source.attachments);

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

  if (isObject(value)) {
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

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    history.push({ role: 'system', content: systemPrompt.trim() });
  }

  for (const message of messages) {
    const timestamp = formatHistoryTimestamp(message.timestamp);
    const prefix = timestamp ? `[${timestamp}] ` : '';
    const entry: ProviderMessage = {
      role: message.sender === 'user' ? 'user' : 'assistant',
      content: `${prefix}${message.text}`
    };

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length) {
      const normalizedAttachments = toProviderAttachments(attachments);
      if (!normalizedAttachments) {
        throw new HttpError('Attachment payload is invalid or exceeds the allowed size.', 400);
      }
      if (normalizedAttachments.length) {
        entry.attachments = normalizedAttachments;
      }
    }

    history.push(entry);
  }

  return history;
};

export const handleChatRequest = async (
  payload: unknown,
  cookies: Cookies
): Promise<Response> => {
  if (!isObject(payload)) {
    throw new HttpError('Invalid JSON body', 400);
  }

  const { provider, model, messages, systemPrompt, options, toolsEnabled } =
    payload as ChatRequestPayload;

  if (!provider || typeof provider !== 'string') {
    throw new HttpError('provider is required', 400);
  }

  if (!model || typeof model !== 'string') {
    throw new HttpError('model is required', 400);
  }

  const normalizedMessages = coerceClientMessages(messages);
  if (!normalizedMessages) {
    throw new HttpError('messages must be an array', 400);
  }

  const providerConfig = findProvider(cookies, provider);
  if (!providerConfig) {
    throw new HttpError('Unsupported provider', 404);
  }

  let history: ProviderMessage[];
  try {
    history = normalizeHistory(
      normalizedMessages,
      typeof systemPrompt === 'string' ? systemPrompt : undefined
    );
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError('Failed to normalize chat history', 400);
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

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpError(message, 500);
  }
};
