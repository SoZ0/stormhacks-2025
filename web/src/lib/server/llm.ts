import { env } from '$env/dynamic/private';
import type { ProviderConfig } from '$lib/llm/providers';
import type { LLMGenerationOptions } from '$lib/llm/settings';
import { REGISTERED_TOOLS, executeRegisteredTool } from '$lib/server/tools';
import { LIVE2D_TOOLS, executeLive2DTool } from '$lib/server/tools/live2d';

export interface ProviderAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: ProviderAttachment[];
}

export interface ChatStreamEvent {
  type: 'delta' | 'done' | 'error';
  value?: string;
  message?: string;
}

const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort();

const isImageMimeType = (mimeType: string): boolean => mimeType.toLowerCase().startsWith('image/');

const partitionAttachments = (attachments: ProviderAttachment[] | undefined) => {
  const images: ProviderAttachment[] = [];
  const others: ProviderAttachment[] = [];

  if (!attachments?.length) {
    return { images, others };
  }

  for (const attachment of attachments) {
    if (!attachment) continue;
    if (isImageMimeType(attachment.mimeType)) {
      images.push(attachment);
    } else {
      others.push(attachment);
    }
  }

  return { images, others };
};

const mergeContentWithAttachmentNotes = (
  content: string,
  attachments: ProviderAttachment[] | undefined
): string => {
  if (!attachments?.length) {
    return content;
  }

  const sections: string[] = [];
  if (content) {
    sections.push(content);
  }

  for (const attachment of attachments) {
    const header = `Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`;
    sections.push(`${header}\nBase64:\n${attachment.data}`);
  }

  return sections.join('\n\n');
};

const normalizeUrl = (baseUrl: string, port?: string): string => {
  let normalized = baseUrl.trim().replace(/\/$/, '');
  if (!/^https?:\/\//.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  const hasPort = /:(\d+)$/.test(normalized);
  if (port && port.trim() && !hasPort) {
    normalized = `${normalized}:${port.trim()}`;
  }

  return normalized;
};

const buildOllamaBaseUrl = (provider: ProviderConfig): string => {
  const fallback = env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const baseUrl = provider.settings.baseUrl || fallback;
  const port = provider.settings.port;

  // If the stored base URL already encodes the port, prefer it.
  return normalizeUrl(baseUrl, port);
};

const buildOllamaOptions = (options: LLMGenerationOptions): Record<string, number> => {
  const payload: Record<string, number> = {};

  if (typeof options.temperature === 'number') {
    payload.temperature = options.temperature;
  }
  if (typeof options.topP === 'number') {
    payload.top_p = options.topP;
  }
  if (typeof options.topK === 'number') {
    payload.top_k = options.topK;
  }
  if (typeof options.maxInputTokens === 'number') {
    payload.num_ctx = options.maxInputTokens;
  }
  if (typeof options.maxOutputTokens === 'number') {
    payload.num_predict = options.maxOutputTokens;
  }

  return payload;
};

const resolveOllamaThinkSetting = (
  level: LLMGenerationOptions['thinkingLevel'] | undefined
): boolean | 'low' | 'medium' | 'high' | undefined => {
  switch (level) {
    case 'off':
      return false;
    case 'low':
    case 'medium':
    case 'high':
      return level;
    default:
      return undefined;
  }
};

const resolveGeminiApiKey = (provider: ProviderConfig): string => {
  const key = provider.settings.apiKey?.trim() || env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Gemini provider is missing an API key.');
  }
  return key;
};

export const listProviderModels = async (provider: ProviderConfig): Promise<string[]> => {
  switch (provider.kind) {
    case 'ollama':
      return listOllamaModels(provider);
    case 'gemini':
      return listGeminiModels(provider);
    default:
      return [];
  }
};

const encodeEvent = (encoder: TextEncoder, event: ChatStreamEvent): Uint8Array =>
  encoder.encode(`${JSON.stringify(event)}\n`);

const SFU_TOOL_SYSTEM_PROMPT = `You can access Simon Fraser University's course outline tools via function calls. Call them when you need up-to-date course details (years, terms, subjects, courses, sections, and full outlines) before answering. Summarize tool results for the user.`;

const prependToolInstruction = (history: ProviderMessage[]): ProviderMessage[] => {
  const alreadyPresent = history.some(
    (message) => message.role === 'system' && message.content === TOOL_SYSTEM_PROMPT
  );
  if (alreadyPresent) {
    return history;
  }
  return [{ role: 'system', content: TOOL_SYSTEM_PROMPT }, ...history];
};

export const streamProviderChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  systemPrompt: string | undefined,
  options: LLMGenerationOptions,
  enableTools = true
): Promise<ReadableStream<Uint8Array>> => {
  const shouldUseTools =
    enableTools && (provider.kind === 'ollama' || provider.kind === 'gemini');
  const normalizedHistory = shouldUseTools ? prependToolInstruction(history) : history;

  switch (provider.kind) {
    case 'ollama':
      return streamOllamaChat(provider, model, normalizedHistory, options, shouldUseTools);
    case 'gemini':
      return streamGeminiChat(
        provider,
        model,
        normalizedHistory,
        systemPrompt,
        options,
        shouldUseTools
      );
    default:
      throw new Error(`Unsupported provider: ${provider.kind}`);
  }
};

const checkOllamaToolSupport = async (provider: ProviderConfig, model: string): Promise<boolean> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    tools: REGISTERED_TOOLS,
    messages: [
      {
        role: 'user',
        content: ' '
      }
    ],
    options: {
      num_predict: 1
    }
  };

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const raw = await response.text();

  const containsToolUnsupported = (value: string | null | undefined) =>
    typeof value === 'string' && value.toLowerCase().includes('does not support tools');

  if (!response.ok) {
    if (containsToolUnsupported(raw)) {
      return false;
    }
    const message = raw?.trim() ? raw.trim() : 'Unknown error';
    throw new Error(`Ollama tool support check failed (${response.status}): ${message}`);
  }

  if (!raw || !raw.trim()) {
    return true;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return true;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const errorValue = record.error;
    const errorMessage =
      typeof errorValue === 'string'
        ? errorValue
        : errorValue && typeof errorValue === 'object' && 'message' in errorValue
          ? ((errorValue as { message?: unknown }).message as string | undefined)
          : undefined;

    if (containsToolUnsupported(errorMessage)) {
      return false;
    }

    if (errorMessage && errorMessage.trim()) {
      throw new Error(errorMessage.trim());
    }
  }

  return true;
};

export const checkProviderToolSupport = async (
  provider: ProviderConfig,
  model: string
): Promise<boolean> => {
  switch (provider.kind) {
    case 'ollama':
      return checkOllamaToolSupport(provider, model);
    case 'gemini':
      return checkGeminiToolSupport(provider, model);
    default:
      return false;
  }
};

const listOllamaModels = async (provider: ProviderConfig): Promise<string[]> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama list models failed (${response.status}): ${message}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.models)
    ? data.models
        .map((entry: { name?: string }) => entry?.name)
        .filter((name: string | undefined): name is string => Boolean(name))
    : [];

  return uniqueSorted(models);
};

type OllamaRole = 'system' | 'user' | 'assistant' | 'tool';

interface OllamaFunctionCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
}

interface OllamaChatMessage {
  role: OllamaRole;
  content: string;
  images?: string[];
  tool_calls?: OllamaFunctionCall[];
  tool_call_id?: string;
  name?: string;
}

interface OllamaChatResponse {
  message?: {
    role?: string;
    content?: unknown;
    tool_calls?: OllamaFunctionCall[];
    tool_call_id?: string;
    name?: string;
  };
  response?: string;
  done?: boolean;
  error?: unknown;
}

const isOllamaRole = (value: unknown): value is OllamaRole =>
  value === 'system' || value === 'user' || value === 'assistant' || value === 'tool';

const normalizeOllamaRole = (role: unknown, fallback: OllamaRole): OllamaRole =>
  isOllamaRole(role) ? role : fallback;

const resolveOllamaContent = (
  payload: OllamaChatResponse['message'] | OllamaChatMessage | null | undefined,
  fallback?: string
): string => {
  if (!payload) {
    return fallback ?? '';
  }

  const { content } = payload as { content?: unknown };

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text?: string }).text ?? '';
        }
        return '';
      })
      .filter(Boolean)
      .join('');
    if (text.trim()) {
      return text;
    }
  }

  if (typeof fallback === 'string') {
    return fallback;
  }

  return '';
};

const normalizeOllamaMessage = (
  message: OllamaChatResponse['message'] | null | undefined,
  fallback: OllamaChatMessage | null
): OllamaChatMessage | null => {
  if (!message) return fallback;

  const role = normalizeOllamaRole(message.role, fallback?.role ?? 'assistant');
  const content = resolveOllamaContent(message, fallback?.content ?? '');
  const normalized: OllamaChatMessage = { role, content };

  const currentToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (currentToolCalls.length > 0) {
    normalized.tool_calls = currentToolCalls;
  } else if (fallback?.tool_calls?.length) {
    normalized.tool_calls = fallback.tool_calls;
  }

  if (typeof message.tool_call_id === 'string') {
    normalized.tool_call_id = message.tool_call_id;
  } else if (fallback?.tool_call_id) {
    normalized.tool_call_id = fallback.tool_call_id;
  }

  if (typeof message.name === 'string') {
    normalized.name = message.name;
  } else if (fallback?.name) {
    normalized.name = fallback.name;
  }

  return normalized;
};

const mapHistoryToOllamaMessages = (history: ProviderMessage[]): OllamaChatMessage[] =>
  history.map((entry) => {
    const message: OllamaChatMessage = {
      role: entry.role,
      content: mergeContentWithAttachmentNotes(entry.content, entry.attachments)
    };
    const { images } = partitionAttachments(entry.attachments);
    if (images.length) {
      message.images = images.map((attachment) => attachment.data);
    }
    return message;
  });

const callOllamaChat = async (
  baseUrl: string,
  requestBody: Record<string, unknown>,
  emitDelta: ((chunk: string) => void) | null
): Promise<{
  content: string;
  message: OllamaChatMessage | null;
  toolCalls: OllamaFunctionCall[];
}> => {
  const payload = { ...requestBody, stream: true };

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error('Ollama response missing body');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let toolCalls: OllamaFunctionCall[] = [];
  let finalMessage: OllamaChatMessage | null = null;
  let lastMessageContent = '';

  const flushLine = (line: string) => {
    if (!line) return;

    let data: OllamaChatResponse;
    try {
      data = JSON.parse(line) as OllamaChatResponse;
    } catch {
      return;
    }

    if (data?.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }

    const chunk = typeof data.message?.content === 'string'
      ? data.message.content
      : typeof data.response === 'string'
        ? data.response
        : '';

    if (chunk) {
      accumulated += chunk;
      if (emitDelta) {
        emitDelta(chunk);
      }
    }

    if (data.message) {
      finalMessage = normalizeOllamaMessage(data.message, finalMessage);
      toolCalls = finalMessage?.tool_calls ?? [];
      lastMessageContent = finalMessage?.content ?? lastMessageContent;
    } else if (typeof data.response === 'string') {
      finalMessage = {
        role: 'assistant',
        content: accumulated
      };
      lastMessageContent = finalMessage.content;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      } else if (done) {
        buffer += decoder.decode();
      }

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        flushLine(line);
        newlineIndex = buffer.indexOf('\n');
      }

      if (done) {
        const remainder = buffer.trim();
        if (remainder) {
          flushLine(remainder);
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const content = accumulated || lastMessageContent;

  return {
    content,
    message: finalMessage,
    toolCalls
  };
};

const handleToolCall = async (
  call: OllamaFunctionCall,
  iteration: number,
  index: number,
  emitTool?: (payload: unknown) => void
): Promise<OllamaChatMessage> => {
  const toolName = call?.function?.name ?? 'unknown_tool';
  const toolCallId = call?.id ?? `${toolName}-${iteration}-${index}`;

  if (!call?.function?.name) {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: JSON.stringify({ ok: false, tool: toolName, error: 'Tool call missing function name.' })
    };
  }

  try {
    const result = await executeSfuOutlinesTool(toolName, call.function.arguments);
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: JSON.stringify({ ok: true, tool: toolName, data: result })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown tool execution error';
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: JSON.stringify({ ok: false, tool: toolName, error: message })
    };
  }
};

const runOllamaChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  options: LLMGenerationOptions,
  emitDelta: (chunk: string) => void,
  emitTool: (payload: unknown) => void,
  enableTools: boolean
): Promise<string> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const ollamaOptions = buildOllamaOptions(options);
  const messages = mapHistoryToOllamaMessages(history);
  const requestBase: Record<string, unknown> = {
    model,
    messages
  };

  const thinkSetting = resolveOllamaThinkSetting(options.thinkingLevel);
  if (thinkSetting !== undefined) {
    requestBase.think = thinkSetting;
  }

  if (Object.keys(ollamaOptions).length > 0) {
    requestBase.options = ollamaOptions;
  }

  if (enableTools) {
    requestBase.tools = SFU_OUTLINES_TOOLS;
  }

  if (!enableTools) {
    const { content, message } = await callOllamaChat(baseUrl, requestBase, emitDelta);
    const assistantContent = content.length
      ? content
      : typeof message?.content === 'string'
        ? message.content
        : resolveOllamaContent(message) ?? '';
    return assistantContent;
  }

  const MAX_TOOL_ITERATIONS = 6;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    requestBase.messages = messages;
    const { content, message, toolCalls } = await callOllamaChat(baseUrl, requestBase, emitDelta);
    const normalizedToolCalls = Array.isArray(toolCalls) ? toolCalls : [];
    const assistantContent = content.length
      ? content
      : typeof message?.content === 'string'
        ? message.content
        : '';

    if (normalizedToolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: assistantContent,
        tool_calls: normalizedToolCalls
      });

      for (let index = 0; index < normalizedToolCalls.length; index += 1) {
        const call = normalizedToolCalls[index];
        const toolMessage = await handleToolCall(call, iteration, index, emitTool);
        messages.push(toolMessage);
      }

      continue;
    }

    const finalContent = assistantContent || resolveOllamaContent(message) || '';
    messages.push({ role: 'assistant', content: finalContent });
    return finalContent;
  }

  throw new Error('Tool execution exceeded maximum allowed iterations.');
};

const streamOllamaChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  options: LLMGenerationOptions,
  enableTools: boolean
): Promise<ReadableStream<Uint8Array>> => {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let finalContent = '';

      const emitDelta = (chunk: string) => {
        if (!chunk) return;
        controller.enqueue(encodeEvent(encoder, { type: 'delta', value: chunk }));
      };

      const emitTool = (payload: unknown) => {
        controller.enqueue(encodeEvent(encoder, { type: 'delta', value: '', ...(payload ? { tool: payload } : {}) } as any));
      };

      try {
        finalContent = await runOllamaChat(provider, model, history, options, emitDelta, emitTool, enableTools);
        controller.enqueue(encodeEvent(encoder, { type: 'done', value: finalContent }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encodeEvent(encoder, { type: 'error', message }));
      } finally {
        controller.close();
      }
    }
  });
};

const listGeminiModels = async (provider: ProviderConfig): Promise<string[]> => {
  const apiKey = resolveGeminiApiKey(provider);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message ?? 'Unknown Gemini error';
    throw new Error(`Gemini list models failed (${response.status}): ${message}`);
  }

  const models = Array.isArray(data?.models)
    ? data.models
        .filter((model: { supportedGenerationMethods?: string[] }) =>
          Array.isArray(model?.supportedGenerationMethods)
            ? model.supportedGenerationMethods.includes('generateContent')
            : false
        )
        .map((model: { name?: string }) => model?.name?.replace(/^models\//, '') ?? '')
        .filter((name: string) => Boolean(name))
    : [];

  return uniqueSorted(models);
};

type GeminiRole = 'user' | 'model' | 'function';

interface GeminiFunctionCallPart {
  name?: string;
  args?: unknown;
}

interface GeminiFunctionResponsePart {
  name?: string;
  response?: unknown;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCallPart;
  functionResponse?: GeminiFunctionResponsePart;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
}

interface GeminiPromptFeedback {
  blockReason?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: GeminiPromptFeedback;
  error?: { message?: string };
}

const ensureGeminiRole = (role: unknown, fallback: GeminiRole = 'model'): GeminiRole => {
  if (role === 'user' || role === 'model' || role === 'function') {
    return role;
  }
  return fallback;
};

const mapHistoryToGeminiContents = (history: ProviderMessage[]): GeminiContent[] =>
  history
    .filter((entry) => entry.role !== 'system')
    .map((entry) => {
      const parts: GeminiPart[] = [];
      if (entry.content) {
        parts.push({ text: entry.content });
      }

      for (const attachment of entry.attachments ?? []) {
        const summary = `Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`;
        if (isImageMimeType(attachment.mimeType)) {
          parts.push({ text: `${summary}\n[Image data provided inline.]` });
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.data
            }
          });
        } else {
          parts.push({ text: `${summary}\nBase64:\n${attachment.data}` });
        }
      }

      if (!parts.length) {
        parts.push({ text: '' });
      }

      return {
        role: entry.role === 'user' ? 'user' : 'model',
        parts
      };
    });

const buildGeminiGenerationConfig = (options: LLMGenerationOptions): Record<string, number> => {
  const generationConfig: Record<string, number> = {};
  if (typeof options.temperature === 'number') {
    generationConfig.temperature = options.temperature;
  }
  if (typeof options.topP === 'number') {
    generationConfig.topP = options.topP;
  }
  if (typeof options.topK === 'number') {
    generationConfig.topK = options.topK;
  }
  if (typeof options.maxOutputTokens === 'number') {
    generationConfig.maxOutputTokens = options.maxOutputTokens;
  }
  return generationConfig;
};

const buildGeminiSystemInstruction = (messages: string[]) =>
  messages.length
    ? {
        role: 'system',
        parts: messages.map((text) => ({ text }))
      }
    : undefined;

const buildGeminiToolsPayload = () => [
  {
    functionDeclarations: SFU_OUTLINES_TOOLS.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }))
  }
];

const GEMINI_TOOL_UNSUPPORTED_PATTERNS = [
  'tools are not supported',
  'tool use is not supported',
  'function calling is not supported',
  "function calling isn't supported",
  'does not support tools',
  'does not support function',
  'functioncall is not available'
];

const geminiMessageIndicatesUnsupported = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  const lower = value.toLowerCase();
  return GEMINI_TOOL_UNSUPPORTED_PATTERNS.some((pattern) => lower.includes(pattern));
};

const checkGeminiToolSupport = async (
  provider: ProviderConfig,
  model: string
): Promise<boolean> => {
  const apiKey = resolveGeminiApiKey(provider);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Tool support probe.' }]
      }
    ],
    tools: buildGeminiToolsPayload(),
    generationConfig: {
      temperature: 0
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const raw = await response.text();

  if (response.ok) {
    return true;
  }

  let parsed: GeminiGenerateContentResponse | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as GeminiGenerateContentResponse) : null;
  } catch {
    parsed = null;
  }

  const message = parsed?.error?.message ?? raw ?? '';
  if (geminiMessageIndicatesUnsupported(message)) {
    return false;
  }

  const finalMessage = message.trim() ? message.trim() : 'Unknown Gemini error';
  throw new Error(`Gemini tool support check failed (${response.status}): ${finalMessage}`);
};

const normalizeGeminiContent = (content: GeminiContent | null | undefined): GeminiContent => ({
  role: ensureGeminiRole(content?.role, 'model'),
  parts: Array.isArray(content?.parts) ? [...content.parts] : []
});

const extractGeminiText = (content: GeminiContent): string => {
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
};

interface GeminiToolCall {
  name: string;
  args: unknown;
}

const extractGeminiToolCalls = (content: GeminiContent): GeminiToolCall[] => {
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const calls: GeminiToolCall[] = [];

  for (const part of parts) {
    const call = part?.functionCall;
    if (call && typeof call.name === 'string') {
      calls.push({ name: call.name, args: call.args });
    }
  }

  return calls;
};

const createGeminiToolResponseContent = async (
  toolName: string,
  rawArgs: unknown
): Promise<GeminiContent> => {
  const normalized = toolName.trim();
  if (!normalized) {
    return {
      role: 'function',
      parts: [
        {
          functionResponse: {
            name: 'unknown_tool',
            response: {
              ok: false,
              tool: 'unknown_tool',
              error: 'Tool call missing function name.'
            }
          }
        }
      ]
    };
  }

  try {
    const data = await executeRegisteredTool(normalized, rawArgs);
    return {
      role: 'function',
      parts: [
        {
          functionResponse: {
            name: normalized,
            response: {
              ok: true,
              tool: normalized,
              data
            }
          }
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown tool execution error';
    return {
      role: 'function',
      parts: [
        {
          functionResponse: {
            name: normalized,
            response: {
              ok: false,
              tool: normalized,
              error: message
            }
          }
        }
      ]
    };
  }
};

const pickGeminiCandidateContent = (
  data: GeminiGenerateContentResponse
): GeminiContent | null => {
  if (!Array.isArray(data?.candidates)) {
    return null;
  }

  for (const candidate of data.candidates) {
    if (candidate?.content && Array.isArray(candidate.content.parts)) {
      return candidate.content;
    }
  }

  return data.candidates[0]?.content ?? null;
};

const GEMINI_MAX_TOOL_ITERATIONS = 6;

const chatWithGemini = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  systemPrompt: string | undefined,
  options: LLMGenerationOptions,
  enableTools: boolean
): Promise<string> => {
  const apiKey = resolveGeminiApiKey(provider);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemMessages = history
    .filter((entry) => entry.role === 'system')
    .map((entry) => entry.content?.trim())
    .filter((value): value is string => Boolean(value && value.length));

  if (systemPrompt && systemPrompt.trim()) {
    const trimmed = systemPrompt.trim();
    if (!systemMessages.includes(trimmed)) {
      systemMessages.push(trimmed);
    }
  }

  const conversation = mapHistoryToGeminiContents(history);
  const generationConfig = buildGeminiGenerationConfig(options);

  const baseRequest: Record<string, unknown> & { contents: GeminiContent[] } = {
    contents: conversation
  };

  if (Object.keys(generationConfig).length > 0) {
    baseRequest.generationConfig = generationConfig;
  }

  const systemInstruction = buildGeminiSystemInstruction(systemMessages);
  if (systemInstruction) {
    baseRequest.systemInstruction = systemInstruction;
  }

  if (enableTools) {
    baseRequest.tools = buildGeminiToolsPayload();
  }

  const maxIterations = enableTools ? GEMINI_MAX_TOOL_ITERATIONS : 1;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const requestBody = { ...baseRequest, contents: conversation };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message ?? 'Unknown Gemini error';
      throw new Error(`Gemini request failed (${response.status}): ${message}`);
    }

    const candidateContent = pickGeminiCandidateContent(data);
    if (!candidateContent) {
      const blockReason = data?.promptFeedback?.blockReason ?? '';
      const message = blockReason
        ? `Gemini response blocked: ${blockReason}`
        : 'Gemini response missing assistant reply';
      throw new Error(message);
    }

    const normalizedContent = normalizeGeminiContent(candidateContent);
    conversation.push(normalizedContent);

    if (enableTools) {
      const toolCalls = extractGeminiToolCalls(normalizedContent);

      if (toolCalls.length > 0) {
        for (const call of toolCalls) {
          const toolResponseContent = await createGeminiToolResponseContent(call.name, call.args);
          conversation.push(toolResponseContent);
        }
        continue;
      }
    }

    const reply = extractGeminiText(normalizedContent).trim();
    if (reply) {
      return reply;
    }
  }

  if (enableTools) {
    throw new Error('Tool execution exceeded maximum allowed iterations.');
  }

  throw new Error('Gemini response missing assistant reply');
};

const streamGeminiChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  systemPrompt: string | undefined,
  options: LLMGenerationOptions,
  enableTools: boolean
): Promise<ReadableStream<Uint8Array>> => {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const reply = await chatWithGemini(
          provider,
          model,
          history,
          systemPrompt,
          options,
          enableTools
        );
        if (reply) {
          controller.enqueue(encodeEvent(encoder, { type: 'delta', value: reply }));
        }
        controller.enqueue(encodeEvent(encoder, { type: 'done', value: reply }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encodeEvent(encoder, { type: 'error', message }));
      } finally {
        controller.close();
      }
    }
  });
};
