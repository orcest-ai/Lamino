const { NativeEmbedder } = require("../../EmbeddingEngines/native");
const {
  LLMPerformanceMonitor,
} = require("../../helpers/chat/LLMPerformanceMonitor");
const {
  formatChatHistory,
  writeResponseChunk,
  clientAbortedHandler,
} = require("../../helpers/chat/responses");
const { toValidNumber } = require("../../http");
const { getLaminoUserAgent } = require("../../../endpoints/utils");

/**
 * Cost tier definitions for Orcest ecosystem models.
 * Each tier has a symbol and description for display in the UI.
 */
const COST_TIERS = {
  FREE: { symbol: "\u{1F7E2}", label: "Free" },
  INTERNAL_FREE: { symbol: "\u{1F3E0}", label: "Internal Free" },
  EXTERNAL_FREE: { symbol: "\u{1F310}", label: "External Free" },
  LOCKED: { symbol: "\u{1F512}", label: "Locked" },
  CHEAP: { symbol: "\u{1FA99}", label: "Cheap" },
  NORMAL: { symbol: "\u{1F4B2}", label: "Normal Cost" },
  EXPENSIVE: { symbol: "\u{1F4B0}", label: "Too Expensive" },
  MOST_EXPENSIVE: { symbol: "\u{1F48E}", label: "Most Expensive" },
};

/**
 * RainyModel-specific models with their cost tiers.
 * Maps model IDs to metadata including cost tier, description, and sub-provider info.
 */
const RAINYMODEL_MODELS = {
  "rainymodel/auto": {
    id: "rainymodel/auto",
    name: "RainyModel Auto",
    description: "Auto-routed: FREE >> INTERNAL >> PREMIUM",
    costTier: COST_TIERS.FREE,
    organization: "RainyModel",
  },
  "rainymodel/chat": {
    id: "rainymodel/chat",
    name: "RainyModel Chat",
    description: "Optimized for conversations",
    costTier: COST_TIERS.FREE,
    organization: "RainyModel",
  },
  "rainymodel/code": {
    id: "rainymodel/code",
    name: "RainyModel Code",
    description: "Optimized for code generation",
    costTier: COST_TIERS.FREE,
    organization: "RainyModel",
  },
  "rainymodel/agent": {
    id: "rainymodel/agent",
    name: "RainyModel Agent",
    description: "Premium-first for agent tasks",
    costTier: COST_TIERS.NORMAL,
    organization: "RainyModel",
  },
};

class RainyModelLLM {
  constructor(embedder = null, modelPreference = null) {
    const { OpenAI: OpenAIApi } = require("openai");
    if (!process.env.RAINYMODEL_BASE_PATH)
      throw new Error(
        "RainyModel must have a valid base path. Set RAINYMODEL_BASE_PATH."
      );

    this.className = "RainyModelLLM";
    this.basePath = process.env.RAINYMODEL_BASE_PATH;
    this.openai = new OpenAIApi({
      baseURL: this.basePath,
      apiKey: process.env.RAINYMODEL_API_KEY ?? null,
      defaultHeaders: {
        "User-Agent": getLaminoUserAgent(),
        "X-RainyModel-Policy":
          process.env.RAINYMODEL_POLICY ?? "auto",
      },
    });
    this.model =
      modelPreference ?? process.env.RAINYMODEL_MODEL_PREF ?? "rainymodel/auto";
    this.maxTokens = process.env.RAINYMODEL_MAX_TOKENS
      ? toValidNumber(process.env.RAINYMODEL_MAX_TOKENS, 1024)
      : 1024;
    if (!this.model)
      throw new Error("RainyModel must have a valid model set.");
    this.limits = {
      history: this.promptWindowLimit() * 0.15,
      system: this.promptWindowLimit() * 0.15,
      user: this.promptWindowLimit() * 0.7,
    };

    this.embedder = embedder ?? new NativeEmbedder();
    this.defaultTemp = 0.7;
    this.log(`Inference API: ${this.basePath} Model: ${this.model}`);
  }

  log(text, ...args) {
    console.log(`\x1b[35m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  #appendContext(contextTexts = []) {
    if (!contextTexts || !contextTexts.length) return "";
    return (
      "\nContext:\n" +
      contextTexts
        .map((text, i) => {
          return `[CONTEXT ${i}]:\n${text}\n[END CONTEXT ${i}]\n\n`;
        })
        .join("")
    );
  }

  streamingEnabled() {
    return "streamGetChatCompletion" in this;
  }

  static promptWindowLimit(_modelName) {
    const limit = process.env.RAINYMODEL_TOKEN_LIMIT || 32768;
    if (!limit || isNaN(Number(limit)))
      throw new Error("No token context limit was set.");
    return Number(limit);
  }

  promptWindowLimit() {
    const limit = process.env.RAINYMODEL_TOKEN_LIMIT || 32768;
    if (!limit || isNaN(Number(limit)))
      throw new Error("No token context limit was set.");
    return Number(limit);
  }

  isValidChatCompletionModel(_modelName = "") {
    return true;
  }

  #generateContent({ userPrompt, attachments = [] }) {
    if (!attachments.length) {
      return userPrompt;
    }

    const content = [{ type: "text", text: userPrompt }];
    for (let attachment of attachments) {
      content.push({
        type: "image_url",
        image_url: {
          url: attachment.contentString,
          detail: "high",
        },
      });
    }
    return content.flat();
  }

  constructPrompt({
    systemPrompt = "",
    contextTexts = [],
    chatHistory = [],
    userPrompt = "",
    attachments = [],
  }) {
    const prompt = {
      role: "system",
      content: `${systemPrompt}${this.#appendContext(contextTexts)}`,
    };
    return [
      prompt,
      ...formatChatHistory(chatHistory, this.#generateContent),
      {
        role: "user",
        content: this.#generateContent({ userPrompt, attachments }),
      },
    ];
  }

  /**
   * Parses RainyModel routing headers from a response.
   * @param {Object} response - The API response object
   * @returns {Object} Routing metadata
   */
  static parseRoutingHeaders(response) {
    const headers = response?.headers || response?.response?.headers || {};
    return {
      route: headers["x-rainymodel-route"] || null,
      upstream: headers["x-rainymodel-upstream"] || null,
      actualModel: headers["x-rainymodel-model"] || null,
      latencyMs: headers["x-rainymodel-latency-ms"] || null,
      fallbackReason: headers["x-rainymodel-fallback-reason"] || null,
    };
  }

  /**
   * Formats the routing chain as a display string.
   * e.g. "RainyModel >> OpenRouter >> GPT5 Pro"
   * @param {Object} routing - Parsed routing headers
   * @returns {string}
   */
  static formatRoutingChain(routing) {
    const parts = ["RainyModel"];
    if (routing.upstream && routing.upstream !== "none") {
      const upstreamMap = {
        hf: "HuggingFace",
        ollama: "Ollama",
        openrouter: "OpenRouter",
        ollamafreeapi: "OllamaFreeAPI",
      };
      parts.push(upstreamMap[routing.upstream] || routing.upstream);
    }
    if (routing.actualModel) {
      parts.push(routing.actualModel);
    }
    return parts.join(" >> ");
  }

  /**
   * Returns the cost tier symbol for a given route.
   * @param {string} route - The route tier
   * @returns {Object} Cost tier info
   */
  static getCostTierForRoute(route) {
    switch (route) {
      case "free":
        return COST_TIERS.FREE;
      case "internal":
        return COST_TIERS.INTERNAL_FREE;
      case "premium":
        return COST_TIERS.NORMAL;
      case "error":
        return COST_TIERS.LOCKED;
      default:
        return COST_TIERS.FREE;
    }
  }

  async getChatCompletion(messages = null, { temperature = 0.7 }) {
    const result = await LLMPerformanceMonitor.measureAsyncFunction(
      this.openai.chat.completions
        .create({
          model: this.model,
          messages,
          temperature,
          max_tokens: this.maxTokens,
        })
        .catch((e) => {
          throw new Error(e.message);
        })
    );

    if (
      !result.output.hasOwnProperty("choices") ||
      result.output.choices.length === 0
    )
      return null;

    const routing = RainyModelLLM.parseRoutingHeaders(result.output);
    const costTier = RainyModelLLM.getCostTierForRoute(routing.route);
    const routingChain = RainyModelLLM.formatRoutingChain(routing);

    const usage = {
      prompt_tokens: result.output?.usage?.prompt_tokens || 0,
      completion_tokens: result.output?.usage?.completion_tokens || 0,
      total_tokens: result.output?.usage?.total_tokens || 0,
      duration: result.duration,
    };

    return {
      textResponse: result.output.choices[0].message?.content,
      metrics: {
        ...usage,
        outputTps: usage.completion_tokens / usage.duration,
        model: this.model,
        provider: this.className,
        timestamp: new Date(),
        routingChain,
        costTier: costTier.label,
        costTierSymbol: costTier.symbol,
        actualModel: routing.actualModel,
        upstream: routing.upstream,
      },
    };
  }

  async streamGetChatCompletion(messages = null, { temperature = 0.7 }) {
    const measuredStreamRequest = await LLMPerformanceMonitor.measureStream({
      func: this.openai.chat.completions.create({
        model: this.model,
        stream: true,
        messages,
        temperature,
        max_tokens: this.maxTokens,
      }),
      messages,
      runPromptTokenCalculation: true,
      modelTag: this.model,
      provider: this.className,
    });
    return measuredStreamRequest;
  }

  handleStream(response, stream, responseProps) {
    const { uuid = require("uuid").v4(), sources = [] } = responseProps;
    let hasUsageMetrics = false;
    let usage = {
      completion_tokens: 0,
    };

    return new Promise(async (resolve) => {
      let fullText = "";
      let reasoningText = "";
      let sentRoutingInfo = false;

      const handleAbort = () => {
        stream?.endMeasurement(usage);
        clientAbortedHandler(resolve, fullText);
      };
      response.on("close", handleAbort);

      try {
        for await (const chunk of stream) {
          const message = chunk?.choices?.[0];
          const token = message?.delta?.content;
          const reasoningToken = message?.delta?.reasoning_content;

          // Try to extract routing headers from the first chunk
          if (!sentRoutingInfo && chunk) {
            const routing = RainyModelLLM.parseRoutingHeaders(chunk);
            if (routing.route || routing.upstream) {
              const routingChain = RainyModelLLM.formatRoutingChain(routing);
              const costTier = RainyModelLLM.getCostTierForRoute(routing.route);
              writeResponseChunk(response, {
                uuid,
                sources: [],
                type: "routingInfo",
                routingChain,
                costTierSymbol: costTier.symbol,
                costTierLabel: costTier.label,
                actualModel: routing.actualModel,
                close: false,
                error: false,
              });
              sentRoutingInfo = true;
            }
          }

          if (
            chunk.hasOwnProperty("usage") &&
            !!chunk.usage &&
            Object.values(chunk.usage).length > 0
          ) {
            if (chunk.usage.hasOwnProperty("prompt_tokens")) {
              usage.prompt_tokens = Number(chunk.usage.prompt_tokens);
            }
            if (chunk.usage.hasOwnProperty("completion_tokens")) {
              hasUsageMetrics = true;
              usage.completion_tokens = Number(chunk.usage.completion_tokens);
            }
          }

          if (reasoningToken) {
            if (reasoningText.length === 0) {
              writeResponseChunk(response, {
                uuid,
                sources: [],
                type: "textResponseChunk",
                textResponse: `<think>${reasoningToken}`,
                close: false,
                error: false,
              });
              reasoningText += `<think>${reasoningToken}`;
              continue;
            } else {
              writeResponseChunk(response, {
                uuid,
                sources: [],
                type: "textResponseChunk",
                textResponse: reasoningToken,
                close: false,
                error: false,
              });
              reasoningText += reasoningToken;
            }
          }

          if (!!reasoningText && !reasoningToken && token) {
            writeResponseChunk(response, {
              uuid,
              sources: [],
              type: "textResponseChunk",
              textResponse: `</think>`,
              close: false,
              error: false,
            });
            fullText += `${reasoningText}</think>`;
            reasoningText = "";
          }

          if (token) {
            fullText += token;
            if (!hasUsageMetrics) usage.completion_tokens++;
            writeResponseChunk(response, {
              uuid,
              sources: [],
              type: "textResponseChunk",
              textResponse: token,
              close: false,
              error: false,
            });
          }

          if (
            message?.hasOwnProperty("finish_reason") &&
            message.finish_reason !== "" &&
            message.finish_reason !== null
          ) {
            writeResponseChunk(response, {
              uuid,
              sources,
              type: "textResponseChunk",
              textResponse: "",
              close: true,
              error: false,
            });

            response.removeListener("close", handleAbort);
            stream?.endMeasurement(usage);
            resolve(fullText);
            break;
          }
        }
      } catch (e) {
        console.log(`\x1b[43m\x1b[34m[STREAMING ERROR]\x1b[0m ${e.message}`);
        writeResponseChunk(response, {
          uuid,
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: e.message,
        });
        stream?.endMeasurement(usage);
        resolve(fullText);
      }
    });
  }

  async embedTextInput(textInput) {
    return await this.embedder.embedTextInput(textInput);
  }
  async embedChunks(textChunks = []) {
    return await this.embedder.embedChunks(textChunks);
  }

  async compressMessages(promptArgs = {}, rawHistory = []) {
    const { messageArrayCompressor } = require("../../helpers/chat");
    const messageArray = this.constructPrompt(promptArgs);
    return await messageArrayCompressor(this, messageArray, rawHistory);
  }
}

module.exports = {
  RainyModelLLM,
  RAINYMODEL_MODELS,
  COST_TIERS,
};
