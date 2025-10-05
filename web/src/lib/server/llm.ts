import { env } from '$env/dynamic/private';
import type { ProviderConfig } from '$lib/llm/providers';
import type { LLMGenerationOptions } from '$lib/llm/settings';
import { SFU_OUTLINES_TOOLS, executeSfuOutlinesTool } from '$lib/server/tools/sfuOutlines';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatStreamEvent {
  type: 'delta' | 'done' | 'error';
  value?: string;
  message?: string;
}

const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort();

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
    (message) => message.role === 'system' && message.content === SFU_TOOL_SYSTEM_PROMPT
  );
  if (alreadyPresent) {
    return history;
  }
  return [{ role: 'system', content: SFU_TOOL_SYSTEM_PROMPT }, ...history];
};

export const streamProviderChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  systemPrompt: string | undefined,
  options: LLMGenerationOptions,
  enableTools = true
): Promise<ReadableStream<Uint8Array>> => {
  const shouldUseTools = enableTools && provider.kind === 'ollama';
  const normalizedHistory = shouldUseTools ? prependToolInstruction(history) : history;

  switch (provider.kind) {
    case 'ollama':
      return streamOllamaChat(provider, model, normalizedHistory, options, shouldUseTools);
    case 'gemini':
      return streamGeminiChat(provider, model, history, systemPrompt, options);
    default:
      throw new Error(`Unsupported provider: ${provider.kind}`);
  }
};

const checkOllamaToolSupport = async (provider: ProviderConfig, model: string): Promise<boolean> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    tools: SFU_OUTLINES_TOOLS,
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
      return false;
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
  history.map((entry) => ({ role: entry.role, content: entry.content }));

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
  index: number
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
  enableTools: boolean
): Promise<string> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const ollamaOptions = buildOllamaOptions(options);
  const messages = mapHistoryToOllamaMessages(history);
  const requestBase: Record<string, unknown> = {
    model,
    messages
  };

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
        const toolMessage = await handleToolCall(call, iteration, index);
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

      try {
        finalContent = await runOllamaChat(provider, model, history, options, emitDelta, enableTools);
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

const chatWithGemini = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  systemPrompt: string | undefined,
  options: LLMGenerationOptions
): Promise<string> => {
  const apiKey = resolveGeminiApiKey(provider);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const dialogue = history.filter((entry) => entry.role !== 'system');
  const systemMessages = history
    .filter((entry) => entry.role === 'system')
    .map((entry) => entry.content?.trim())
    .filter((value): value is string => Boolean(value && value.length));

  if (systemPrompt && systemPrompt.trim()) {
    const trimmed = systemPrompt.trim();
    if (!systemMessages.some((message) => message === trimmed)) {
      systemMessages.push(trimmed);
    }
  }

  const contents = dialogue.map((entry) => ({
    role: entry.role === 'user' ? 'user' : 'model',
    parts: [{ text: entry.content }]
  }));

  const body: Record<string, unknown> = { contents };

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

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  if (systemMessages.length) {
    body.systemInstruction = {
      role: 'system',
      parts: systemMessages.map((text) => ({ text }))
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? 'Unknown Gemini error';
    throw new Error(`Gemini request failed (${response.status}): ${message}`);
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .filter(Boolean)
    .join('\n');

  if (!reply) {
    throw new Error('Gemini response missing assistant reply');
  }

  return reply;
};

const streamGeminiChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  systemPrompt: string | undefined,
  options: LLMGenerationOptions
): Promise<ReadableStream<Uint8Array>> => {
  const reply = await chatWithGemini(provider, model, history, systemPrompt, options);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      if (reply) {
        controller.enqueue(encodeEvent(encoder, { type: 'delta', value: reply }));
      }
      controller.enqueue(encodeEvent(encoder, { type: 'done', value: reply }));
      controller.close();
    }
  });
};
