import { GoogleGenAI } from '@google/genai';
import { ResolvedCredentials } from './credentials.ts';
import { AiUpstreamError } from './observability.ts';
import {
  AiAdapterRequest,
  AiAdapterResponse,
  AiChatMessage,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiProviderCapabilities,
  AiProviderId,
} from './types.ts';

export interface DiscoveredModelInfo {
  modelId: string;
  displayName: string;
  contextWindow?: number;
}

export interface AiProviderAdapter {
  readonly providerId: AiProviderId;
  readonly displayName: string;
  readonly capabilities: AiProviderCapabilities;
  testConnection(creds: ResolvedCredentials, testModelId?: string): Promise<{ ok: boolean; latencyMs: number; modelsCount?: number; message: string }>;
  listModels(creds: ResolvedCredentials): Promise<DiscoveredModelInfo[]>;
  generate(creds: ResolvedCredentials, req: AiAdapterRequest): Promise<AiAdapterResponse>;
  generateStream(
    creds: ResolvedCredentials,
    req: AiAdapterRequest,
    onChunk: (deltaText: string) => void
  ): Promise<AiAdapterResponse>;
  embed(creds: ResolvedCredentials, req: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
}

function classifyHttpError(providerId: AiProviderId, status: number, bodyText: string): AiUpstreamError {
  if (status === 401 || status === 403) {
    return new AiUpstreamError(providerId, `Falha de autenticação (${status}) em ${providerId}: ${bodyText}`, status, 'auth');
  }
  if (status === 429) {
    return new AiUpstreamError(providerId, `Rate limit excedido (429) em ${providerId}: ${bodyText}`, status, 'rate_limit');
  }
  if (status === 400 && /context|token|length/i.test(bodyText)) {
    return new AiUpstreamError(providerId, `Limite de contexto excedido em ${providerId}: ${bodyText}`, status, 'context_limit');
  }
  if (status >= 500) {
    return new AiUpstreamError(providerId, `Provedor ${providerId} indisponível (${status}): ${bodyText}`, status, 'unavailable');
  }
  return new AiUpstreamError(providerId, `Erro HTTP ${status} em ${providerId}: ${bodyText}`, status, 'bad_request');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  providerId: AiProviderId,
  timeoutMs = 30_000
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new AiUpstreamError(providerId, `Timeout após ${timeoutMs}ms ao conectar em ${providerId}.`, 504, 'timeout');
    }
    throw new AiUpstreamError(providerId, `Falha de rede em ${providerId}: ${err?.message || 'conexão recusada'}`, 503, 'unavailable');
  } finally {
    clearTimeout(timer);
  }
}

function formatOpenAiMessages(req: AiAdapterRequest) {
  const msgs: any[] = [];
  if (req.systemInstruction) {
    msgs.push({ role: 'system', content: req.systemInstruction });
  }
  for (const m of req.messages) {
    if (m.imageBase64 && m.imageMimeType) {
      msgs.push({
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: `data:${m.imageMimeType};base64,${m.imageBase64}` } },
        ],
      });
    } else {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return msgs;
}

async function readSseLines(
  body: ReadableStream<Uint8Array>,
  onEvent: (data: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        onEvent(trimmed.slice(5).trim());
      }
    }
  }
  if (buffer.trim().startsWith('data:')) {
    onEvent(buffer.trim().slice(5).trim());
  }
}

/**
 * Shared OpenAI-compatible adapter used by OpenAI, DeepSeek, OpenRouter, vLLM, and Hugging Face Router
 */
abstract class OpenAiCompatibleAdapter implements AiProviderAdapter {
  public abstract readonly providerId: AiProviderId;
  public abstract readonly displayName: string;
  public abstract readonly capabilities: AiProviderCapabilities;

  protected abstract getEndpoint(creds: ResolvedCredentials): string;

  protected buildHeaders(creds: ResolvedCredentials): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`;
    if (creds.organizationHeader) headers['OpenAI-Organization'] = creds.organizationHeader;
    if (creds.projectIdHeader) headers['OpenAI-Project'] = creds.projectIdHeader;
    return headers;
  }

  public async testConnection(creds: ResolvedCredentials): Promise<{ ok: boolean; latencyMs: number; modelsCount?: number; message: string }> {
    const start = Date.now();
    const models = await this.listModels(creds);
    return {
      ok: true,
      latencyMs: Date.now() - start,
      modelsCount: models.length,
      message: `Conexão validada com sucesso (${models.length} modelos acessíveis).`,
    };
  }

  public async listModels(creds: ResolvedCredentials): Promise<DiscoveredModelInfo[]> {
    const base = this.getEndpoint(creds).replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${base}/models`, { method: 'GET', headers: this.buildHeaders(creds) }, this.providerId, 15_000);
    if (!res.ok) {
      throw classifyHttpError(this.providerId, res.status, await res.text());
    }
    const json: any = await res.json();
    const list: any[] = Array.isArray(json?.data) ? json.data : [];
    return list.map((m) => ({
      modelId: String(m.id),
      displayName: String(m.name || m.id),
      contextWindow: typeof m.context_length === 'number' ? m.context_length : undefined,
    }));
  }

  public async generate(creds: ResolvedCredentials, req: AiAdapterRequest): Promise<AiAdapterResponse> {
    const base = this.getEndpoint(creds).replace(/\/+$/, '');
    const payload: any = {
      model: req.modelId,
      messages: formatOpenAiMessages(req),
    };
    if (req.temperature !== undefined) payload.temperature = req.temperature;
    if (req.maxOutputTokens !== undefined) payload.max_tokens = req.maxOutputTokens;
    if (req.structuredJsonSchema && this.capabilities.structuredOutput) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: { name: 'ner_structured_output', schema: req.structuredJsonSchema },
      };
    }
    if (req.tools?.length && this.capabilities.toolCalling) {
      payload.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetchWithTimeout(
      `${base}/chat/completions`,
      { method: 'POST', headers: this.buildHeaders(creds), body: JSON.stringify(payload) },
      this.providerId,
      req.timeoutMs || 35_000
    );
    if (!res.ok) {
      throw classifyHttpError(this.providerId, res.status, await res.text());
    }
    const json: any = await res.json();
    const choice = json?.choices?.[0];
    const msg = choice?.message || {};
    const reasoning = msg.reasoning_content ? `[Raciocínio]\n${msg.reasoning_content}\n\n` : '';
    const text = `${reasoning}${msg.content || ''}`.trim();
    const toolCalls = Array.isArray(msg.tool_calls)
      ? msg.tool_calls.map((tc: any) => ({
          name: tc.function?.name,
          arguments: (() => {
            try {
              return JSON.parse(tc.function?.arguments || '{}');
            } catch {
              return {};
            }
          })(),
        }))
      : undefined;

    const usage = json?.usage;
    const usageReported = Boolean(
      usage && (typeof usage.prompt_tokens === 'number' || typeof usage.completion_tokens === 'number')
    );

    return {
      text,
      modelUsed: json?.model || req.modelId,
      providerReportedVendor: json?.provider || undefined,
      inputTokens: Number(usage?.prompt_tokens || 0),
      outputTokens: Number(usage?.completion_tokens || 0),
      cachedTokens: Number(usage?.prompt_tokens_details?.cached_tokens || 0),
      reasoningTokens:
        typeof usage?.completion_tokens_details?.reasoning_tokens === 'number'
          ? usage.completion_tokens_details.reasoning_tokens
          : null,
      usageReported,
      providerReportedCostUsd: typeof usage?.cost === 'number' ? usage.cost : null,
      toolCalls,
      finishReason: choice?.finish_reason,
    };
  }

  public async generateStream(
    creds: ResolvedCredentials,
    req: AiAdapterRequest,
    onChunk: (deltaText: string) => void
  ): Promise<AiAdapterResponse> {
    const base = this.getEndpoint(creds).replace(/\/+$/, '');
    const payload: any = {
      model: req.modelId,
      messages: formatOpenAiMessages(req),
      stream: true,
    };
    if (this.providerId === 'openai' || this.providerId === 'openrouter' || this.providerId === 'deepseek') {
      payload.stream_options = { include_usage: true };
    }
    if (req.temperature !== undefined) payload.temperature = req.temperature;
    if (req.maxOutputTokens !== undefined) payload.max_tokens = req.maxOutputTokens;

    const res = await fetchWithTimeout(
      `${base}/chat/completions`,
      { method: 'POST', headers: this.buildHeaders(creds), body: JSON.stringify(payload) },
      this.providerId,
      req.timeoutMs || 45_000
    );
    if (!res.ok || !res.body) {
      throw classifyHttpError(this.providerId, res.status, await res.text());
    }

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let reasoningTokens: number | null = null;
    let providerReportedCostUsd: number | null = null;
    let usageReported = false;
    let modelUsed = req.modelId;

    await readSseLines(res.body, (data) => {
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.model) modelUsed = parsed.model;
        const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.delta?.reasoning_content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
        if (parsed.usage) {
          usageReported = true;
          inputTokens = Number(parsed.usage.prompt_tokens || inputTokens);
          outputTokens = Number(parsed.usage.completion_tokens || outputTokens);
          cachedTokens = Number(parsed.usage.prompt_tokens_details?.cached_tokens || cachedTokens);
          if (typeof parsed.usage.completion_tokens_details?.reasoning_tokens === 'number') {
            reasoningTokens = parsed.usage.completion_tokens_details.reasoning_tokens;
          }
          if (typeof parsed.usage.cost === 'number') {
            providerReportedCostUsd = parsed.usage.cost;
          }
        }
      } catch {
        // ignore partial SSE comment
      }
    });

    return {
      text: fullText,
      modelUsed,
      inputTokens,
      outputTokens,
      cachedTokens,
      reasoningTokens,
      usageReported,
      providerReportedCostUsd,
    };
  }

  public async embed(creds: ResolvedCredentials, req: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    if (!this.capabilities.embeddings) {
      throw new AiUpstreamError(this.providerId, `${this.displayName} não suporta embeddings.`, 400, 'bad_request');
    }
    const base = this.getEndpoint(creds).replace(/\/+$/, '');
    const res = await fetchWithTimeout(
      `${base}/embeddings`,
      {
        method: 'POST',
        headers: this.buildHeaders(creds),
        body: JSON.stringify({ model: req.modelId, input: req.texts }),
      },
      this.providerId,
      req.timeoutMs || 25_000
    );
    if (!res.ok) {
      throw classifyHttpError(this.providerId, res.status, await res.text());
    }
    const json: any = await res.json();
    const embeddings = (json?.data || []).map((d: any) => d.embedding as number[]);
    const usageReported = typeof json?.usage?.prompt_tokens === 'number';
    return {
      embeddings,
      modelUsed: json?.model || req.modelId,
      inputTokens: Number(json?.usage?.prompt_tokens || 0),
      usageReported,
    };
  }
}

export class OpenAiAdapter extends OpenAiCompatibleAdapter {
  public readonly providerId = 'openai' as const;
  public readonly displayName = 'OpenAI (GPT)';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: true,
    imageUnderstanding: true,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: true,
  };
  protected getEndpoint(creds: ResolvedCredentials) {
    return creds.baseUrl || 'https://api.openai.com/v1';
  }
}

export class DeepSeekAdapter extends OpenAiCompatibleAdapter {
  public readonly providerId = 'deepseek' as const;
  public readonly displayName = 'DeepSeek';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: false,
    imageUnderstanding: false,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: true,
  };
  protected getEndpoint(creds: ResolvedCredentials) {
    return creds.baseUrl || 'https://api.deepseek.com/v1';
  }
}

export class OpenRouterAdapter extends OpenAiCompatibleAdapter {
  public readonly providerId = 'openrouter' as const;
  public readonly displayName = 'OpenRouter';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: false,
    imageUnderstanding: true,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: true,
  };
  protected getEndpoint(creds: ResolvedCredentials) {
    return creds.baseUrl || 'https://openrouter.ai/api/v1';
  }
  protected buildHeaders(creds: ResolvedCredentials): Record<string, string> {
    const h = super.buildHeaders(creds);
    h['HTTP-Referer'] = process.env.APP_URL || 'https://neragency.os';
    h['X-Title'] = 'NER AGENCY OS';
    return h;
  }
}

export class VllmAdapter extends OpenAiCompatibleAdapter {
  public readonly providerId = 'vllm' as const;
  public readonly displayName = 'vLLM (Self-Hosted)';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: true,
    imageUnderstanding: false,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: false,
  };
  protected getEndpoint(creds: ResolvedCredentials) {
    if (!creds.baseUrl) {
      throw new AiUpstreamError('vllm', 'Endpoint Base URL do servidor vLLM não configurado.', 400, 'bad_request');
    }
    return creds.baseUrl;
  }
}

export class HuggingFaceAdapter extends OpenAiCompatibleAdapter {
  public readonly providerId = 'huggingface' as const;
  public readonly displayName = 'Hugging Face Inference';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: false,
    imageUnderstanding: false,
    structuredOutput: false,
    toolCalling: false,
    modelListing: true,
    documentAnalysis: false,
  };
  protected getEndpoint(creds: ResolvedCredentials) {
    return creds.baseUrl || 'https://router.huggingface.co/v1';
  }
  public async testConnection(creds: ResolvedCredentials) {
    const start = Date.now();
    if (!creds.apiKey) {
      throw new AiUpstreamError('huggingface', 'Token Hugging Face não configurado.', 401, 'auth');
    }
    const res = await fetchWithTimeout(
      'https://huggingface.co/api/whoami-v2',
      { method: 'GET', headers: { Authorization: `Bearer ${creds.apiKey}` } },
      'huggingface',
      12_000
    );
    if (!res.ok) {
      throw classifyHttpError('huggingface', res.status, await res.text());
    }
    const info: any = await res.json();
    return {
      ok: true,
      latencyMs: Date.now() - start,
      message: `Token Hugging Face validado (${info?.name || 'conta autenticada'}).`,
    };
  }
}

export class AnthropicAdapter implements AiProviderAdapter {
  public readonly providerId = 'anthropic' as const;
  public readonly displayName = 'Anthropic (Claude)';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: false,
    imageUnderstanding: true,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: true,
  };

  private headers(creds: ResolvedCredentials): Record<string, string> {
    if (!creds.apiKey) {
      throw new AiUpstreamError('anthropic', 'API Key Anthropic não configurada.', 401, 'auth');
    }
    return {
      'Content-Type': 'application/json',
      'x-api-key': creds.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  public async testConnection(creds: ResolvedCredentials) {
    const start = Date.now();
    const models = await this.listModels(creds);
    return {
      ok: true,
      latencyMs: Date.now() - start,
      modelsCount: models.length,
      message: `Anthropic validada (${models.length} modelos Claude disponíveis).`,
    };
  }

  public async listModels(creds: ResolvedCredentials): Promise<DiscoveredModelInfo[]> {
    const base = (creds.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const res = await fetchWithTimeout(
      `${base}/v1/models`,
      { method: 'GET', headers: this.headers(creds) },
      'anthropic',
      15_000
    );
    if (!res.ok) {
      throw classifyHttpError('anthropic', res.status, await res.text());
    }
    const json: any = await res.json();
    return (json?.data || []).map((m: any) => ({
      modelId: String(m.id),
      displayName: String(m.display_name || m.id),
    }));
  }

  private buildBody(req: AiAdapterRequest, stream: boolean) {
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.imageBase64 && m.imageMimeType) {
          return {
            role: m.role,
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: m.imageMimeType, data: m.imageBase64 },
              },
              { type: 'text', text: m.content },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });
    const body: any = {
      model: req.modelId,
      max_tokens: req.maxOutputTokens || 2048,
      messages,
      stream,
    };
    if (req.systemInstruction) body.system = req.systemInstruction;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    return body;
  }

  public async generate(creds: ResolvedCredentials, req: AiAdapterRequest): Promise<AiAdapterResponse> {
    const base = (creds.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const res = await fetchWithTimeout(
      `${base}/v1/messages`,
      { method: 'POST', headers: this.headers(creds), body: JSON.stringify(this.buildBody(req, false)) },
      'anthropic',
      req.timeoutMs || 35_000
    );
    if (!res.ok) {
      throw classifyHttpError('anthropic', res.status, await res.text());
    }
    const json: any = await res.json();
    const blocks: any[] = Array.isArray(json?.content) ? json.content : [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const toolCalls = blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ name: b.name, arguments: b.input || {} }));
    const usage = json?.usage;
    const usageReported = Boolean(usage && (typeof usage.input_tokens === 'number' || typeof usage.output_tokens === 'number'));
    return {
      text,
      modelUsed: json?.model || req.modelId,
      inputTokens: Number(usage?.input_tokens || 0),
      outputTokens: Number(usage?.output_tokens || 0),
      cachedTokens: Number(usage?.cache_read_input_tokens || usage?.cache_creation_input_tokens || 0),
      reasoningTokens: null,
      usageReported,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      finishReason: json?.stop_reason,
    };
  }

  public async generateStream(
    creds: ResolvedCredentials,
    req: AiAdapterRequest,
    onChunk: (deltaText: string) => void
  ): Promise<AiAdapterResponse> {
    const base = (creds.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const res = await fetchWithTimeout(
      `${base}/v1/messages`,
      { method: 'POST', headers: this.headers(creds), body: JSON.stringify(this.buildBody(req, true)) },
      'anthropic',
      req.timeoutMs || 45_000
    );
    if (!res.ok || !res.body) {
      throw classifyHttpError('anthropic', res.status, await res.text());
    }
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let usageReported = false;
    await readSseLines(res.body, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          onChunk(parsed.delta.text);
        } else if (parsed.type === 'message_start' && parsed.message?.usage) {
          usageReported = true;
          inputTokens = Number(parsed.message.usage.input_tokens || 0);
          cachedTokens = Number(parsed.message.usage.cache_read_input_tokens || parsed.message.usage.cache_creation_input_tokens || 0);
        } else if (parsed.type === 'message_delta' && parsed.usage) {
          usageReported = true;
          outputTokens = Number(parsed.usage.output_tokens || outputTokens);
        }
      } catch {
        // ignore non-json SSE line
      }
    });
    return { text: fullText, modelUsed: req.modelId, inputTokens, outputTokens, cachedTokens, usageReported };
  }

  public async embed(): Promise<AiEmbeddingResponse> {
    throw new AiUpstreamError('anthropic', 'Anthropic Claude não oferece API nativa de embeddings.', 400, 'bad_request');
  }
}

export class GeminiAdapter implements AiProviderAdapter {
  public readonly providerId = 'gemini' as const;
  public readonly displayName = 'Google Gemini';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: true,
    imageUnderstanding: true,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: true,
  };

  private createClient(creds: ResolvedCredentials) {
    if (!creds.apiKey) {
      throw new AiUpstreamError('gemini', 'API Key Google Gemini (GOOGLE_AI_API_KEY / GEMINI_API_KEY) não configurada.', 401, 'auth');
    }
    return new GoogleGenAI({
      apiKey: creds.apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  public async testConnection(creds: ResolvedCredentials) {
    const start = Date.now();
    const models = await this.listModels(creds);
    return {
      ok: true,
      latencyMs: Date.now() - start,
      modelsCount: models.length,
      message: `Google Gemini validado (${models.length} modelos disponíveis).`,
    };
  }

  public async listModels(creds: ResolvedCredentials): Promise<DiscoveredModelInfo[]> {
    if (!creds.apiKey) {
      throw new AiUpstreamError('gemini', 'API Key Google Gemini não configurada.', 401, 'auth');
    }
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(creds.apiKey)}`,
      { method: 'GET' },
      'gemini',
      15_000
    );
    if (!res.ok) {
      throw classifyHttpError('gemini', res.status, await res.text());
    }
    const json: any = await res.json();
    return (json?.models || []).map((m: any) => ({
      modelId: String(m.name || '').replace(/^models\//, ''),
      displayName: String(m.displayName || m.name),
      contextWindow: typeof m.inputTokenLimit === 'number' ? m.inputTokenLimit : undefined,
    }));
  }

  private buildContents(req: AiAdapterRequest) {
    const parts: any[] = [];
    for (const m of req.messages) {
      if (m.imageBase64 && m.imageMimeType) {
        parts.push({ inlineData: { mimeType: m.imageMimeType, data: m.imageBase64 } });
      }
      parts.push({ text: m.role === 'assistant' ? `[Assistente]: ${m.content}` : m.content });
    }
    return { parts };
  }

  private buildConfig(req: AiAdapterRequest) {
    const config: Record<string, any> = {};
    if (req.systemInstruction) config.systemInstruction = req.systemInstruction;
    if (req.structuredJsonSchema) {
      config.responseMimeType = 'application/json';
    }
    if (req.tools?.length) {
      config.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    return config;
  }

  public async generate(creds: ResolvedCredentials, req: AiAdapterRequest): Promise<AiAdapterResponse> {
    const ai = this.createClient(creds);
    try {
      const response = await ai.models.generateContent({
        model: req.modelId,
        contents: this.buildContents(req),
        config: this.buildConfig(req),
      });
      const usage = (response as any).usageMetadata;
      const usageReported = Boolean(
        usage && (typeof usage.promptTokenCount === 'number' || typeof usage.candidatesTokenCount === 'number')
      );
      return {
        text: response.text || '',
        modelUsed: req.modelId,
        inputTokens: Number(usage?.promptTokenCount || 0),
        outputTokens: Number(usage?.candidatesTokenCount || 0),
        cachedTokens: Number(usage?.cachedContentTokenCount || 0),
        reasoningTokens: typeof usage?.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : null,
        usageReported,
        finishReason: (response as any).candidates?.[0]?.finishReason,
      };
    } catch (err: any) {
      const status = Number(err?.status || err?.code || 500);
      throw classifyHttpError('gemini', status >= 400 ? status : 500, err?.message || 'Erro na API Gemini');
    }
  }

  public async generateStream(
    creds: ResolvedCredentials,
    req: AiAdapterRequest,
    onChunk: (deltaText: string) => void
  ): Promise<AiAdapterResponse> {
    const ai = this.createClient(creds);
    try {
      const stream = await ai.models.generateContentStream({
        model: req.modelId,
        contents: this.buildContents(req),
        config: this.buildConfig(req),
      });
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let reasoningTokens: number | null = null;
      let usageReported = false;
      for await (const chunk of stream) {
        const t = chunk.text || '';
        if (t) {
          fullText += t;
          onChunk(t);
        }
        const usage = (chunk as any).usageMetadata;
        if (usage) {
          usageReported = true;
          inputTokens = Number(usage.promptTokenCount || inputTokens);
          outputTokens = Number(usage.candidatesTokenCount || outputTokens);
          cachedTokens = Number(usage.cachedContentTokenCount || cachedTokens);
          if (typeof usage.thoughtsTokenCount === 'number') {
            reasoningTokens = usage.thoughtsTokenCount;
          }
        }
      }
      return {
        text: fullText,
        modelUsed: req.modelId,
        inputTokens,
        outputTokens,
        cachedTokens,
        reasoningTokens,
        usageReported,
      };
    } catch (err: any) {
      const status = Number(err?.status || 500);
      throw classifyHttpError('gemini', status >= 400 ? status : 500, err?.message || 'Erro no stream Gemini');
    }
  }

  public async embed(creds: ResolvedCredentials, req: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    const ai = this.createClient(creds);
    const embeddings: number[][] = [];
    for (const txt of req.texts) {
      const res = await ai.models.embedContent({
        model: req.modelId || 'gemini-embedding-2',
        contents: txt,
      });
      const vec = (res as any).embeddings?.[0]?.values || (res as any).embedding?.values || [];
      embeddings.push(vec);
    }
    return {
      embeddings,
      modelUsed: req.modelId || 'gemini-embedding-2',
      inputTokens: req.texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0),
      usageReported: false,
    };
  }
}

export class OllamaAdapter implements AiProviderAdapter {
  public readonly providerId = 'ollama' as const;
  public readonly displayName = 'Ollama (Modelos Locais)';
  public readonly capabilities: AiProviderCapabilities = {
    chat: true,
    textGeneration: true,
    streaming: true,
    embeddings: true,
    imageUnderstanding: true,
    structuredOutput: true,
    toolCalling: true,
    modelListing: true,
    documentAnalysis: false,
  };

  private endpoint(creds: ResolvedCredentials) {
    return (creds.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  public async testConnection(creds: ResolvedCredentials) {
    const start = Date.now();
    const models = await this.listModels(creds);
    return {
      ok: true,
      latencyMs: Date.now() - start,
      modelsCount: models.length,
      message:
        models.length > 0
          ? `Ollama online com ${models.length} modelo(s) instalado(s).`
          : 'Servidor Ollama alcançável, porém sem modelos baixados.',
    };
  }

  public async listModels(creds: ResolvedCredentials): Promise<DiscoveredModelInfo[]> {
    const base = this.endpoint(creds);
    const res = await fetchWithTimeout(`${base}/api/tags`, { method: 'GET' }, 'ollama', 10_000);
    if (!res.ok) {
      throw classifyHttpError('ollama', res.status, await res.text());
    }
    const json: any = await res.json();
    return (json?.models || []).map((m: any) => ({
      modelId: String(m.name),
      displayName: String(m.name),
    }));
  }

  public async generate(creds: ResolvedCredentials, req: AiAdapterRequest): Promise<AiAdapterResponse> {
    const base = this.endpoint(creds);
    const messages: AiChatMessage[] = req.systemInstruction
      ? [{ role: 'system', content: req.systemInstruction }, ...req.messages]
      : req.messages;
    const res = await fetchWithTimeout(
      `${base}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.modelId,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.imageBase64 ? { images: [m.imageBase64] } : {}),
          })),
          stream: false,
          ...(req.structuredJsonSchema ? { format: 'json' } : {}),
        }),
      },
      'ollama',
      req.timeoutMs || 60_000
    );
    if (!res.ok) {
      throw classifyHttpError('ollama', res.status, await res.text());
    }
    const json: any = await res.json();
    const usageReported = typeof json?.prompt_eval_count === 'number' || typeof json?.eval_count === 'number';
    return {
      text: json?.message?.content || '',
      modelUsed: json?.model || req.modelId,
      inputTokens: Number(json?.prompt_eval_count || 0),
      outputTokens: Number(json?.eval_count || 0),
      cachedTokens: 0,
      reasoningTokens: null,
      usageReported,
    };
  }

  public async generateStream(
    creds: ResolvedCredentials,
    req: AiAdapterRequest,
    onChunk: (deltaText: string) => void
  ): Promise<AiAdapterResponse> {
    const base = this.endpoint(creds);
    const messages = req.systemInstruction
      ? [{ role: 'system', content: req.systemInstruction }, ...req.messages]
      : req.messages;
    const res = await fetchWithTimeout(
      `${base}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.modelId,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      },
      'ollama',
      req.timeoutMs || 60_000
    );
    if (!res.ok || !res.body) {
      throw classifyHttpError('ollama', res.status, await res.text());
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let usageReported = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const delta = parsed?.message?.content || '';
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
          if (parsed.done) {
            usageReported = typeof parsed.prompt_eval_count === 'number' || typeof parsed.eval_count === 'number';
            inputTokens = Number(parsed.prompt_eval_count || 0);
            outputTokens = Number(parsed.eval_count || 0);
          }
        } catch {
          // ignore malformed line
        }
      }
    }

    return { text: fullText, modelUsed: req.modelId, inputTokens, outputTokens, cachedTokens: 0, usageReported };
  }

  public async embed(creds: ResolvedCredentials, req: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    const base = this.endpoint(creds);
    const embeddings: number[][] = [];
    for (const prompt of req.texts) {
      const res = await fetchWithTimeout(
        `${base}/api/embeddings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: req.modelId, prompt }),
        },
        'ollama',
        req.timeoutMs || 25_000
      );
      if (!res.ok) {
        throw classifyHttpError('ollama', res.status, await res.text());
      }
      const json: any = await res.json();
      embeddings.push(json?.embedding || []);
    }
    return { embeddings, modelUsed: req.modelId, inputTokens: 0, usageReported: false };
  }
}

export const AI_PROVIDER_ADAPTERS: Record<AiProviderId, AiProviderAdapter> = {
  openai: new OpenAiAdapter(),
  anthropic: new AnthropicAdapter(),
  deepseek: new DeepSeekAdapter(),
  gemini: new GeminiAdapter(),
  openrouter: new OpenRouterAdapter(),
  ollama: new OllamaAdapter(),
  vllm: new VllmAdapter(),
  huggingface: new HuggingFaceAdapter(),
};
