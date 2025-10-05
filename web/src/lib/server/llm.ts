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
  options: LLMGenerationOptions
): Promise<ReadableStream<Uint8Array>> => {
  const normalizedHistory = provider.kind === 'ollama' ? prependToolInstruction(history) : history;

  switch (provider.kind) {
    case 'ollama':
      return streamOllamaChat(provider, model, normalizedHistory, options);
    case 'gemini':
      return streamGeminiChat(provider, model, history, systemPrompt, options);
    default:
      throw new Error(`Unsupported provider: ${provider.kind}`);
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
  };
  response?: string;
  done?: boolean;
  error?: unknown;
}

const resolveOllamaContent = (payload: OllamaChatResponse['message'], fallback?: string): string => {
  if (!payload) {
    return fallback ?? '';
  }

  const { content } = payload;

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

    if (Array.isArray(data.message?.tool_calls)) {
      toolCalls = data.message?.tool_calls ?? [];
    }

    if (data.message) {
      finalMessage = {
        ...data.message,
        content: typeof data.message.content === 'string'
          ? data.message.content
          : finalMessage?.content ?? ''
      };
    } else if (typeof data.response === 'string') {
      finalMessage = {
        role: 'assistant',
        content: accumulated
      };
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

  const content = accumulated || finalMessage?.content || '';

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

const runOllamaChatWithTools = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  options: LLMGenerationOptions,
  emitDelta: (chunk: string) => void
): Promise<string> => {
  const baseUrl = buildOllamaBaseUrl(provider);
  const ollamaOptions = buildOllamaOptions(options);
  const messages = mapHistoryToOllamaMessages(history);
  const requestBase: Record<string, unknown> = {
    model,
    messages,
    tools: SFU_OUTLINES_TOOLS
  };

  if (Object.keys(ollamaOptions).length > 0) {
    requestBase.options = ollamaOptions;
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

    const finalContent = assistantContent || resolveOllamaContent(message, undefined) || '';
    messages.push({ role: 'assistant', content: finalContent });
    return finalContent;
  }

  throw new Error('Tool execution exceeded maximum allowed iterations.');
};

const streamOllamaChat = async (
  provider: ProviderConfig,
  model: string,
  history: ProviderMessage[],
  options: LLMGenerationOptions
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
        finalContent = await runOllamaChatWithTools(provider, model, history, options, emitDelta);
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
