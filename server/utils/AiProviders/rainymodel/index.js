const { NativeEmbedder } = require("../../EmbeddingEngines/native");
const {
  LLMPerformanceMonitor,
} = require("../../helpers/chat/LLMPerformanceMonitor");
const { v4: uuidv4 } = require("uuid");
const {
  writeResponseChunk,
  clientAbortedHandler,
} = require("../../helpers/chat/responses");

const RAINYMODEL_MODELS = {
  "rainymodel/auto": { maxTokens: 32768, name: "RainyModel Auto" },
  "rainymodel/chat": { maxTokens: 32768, name: "RainyModel Chat" },
  "rainymodel/code": { maxTokens: 32768, name: "RainyModel Code" },
  "rainymodel/agent": { maxTokens: 32768, name: "RainyModel Agent" },
};

class RainyModelLLM {
  constructor(embedder = null, modelPreference = null) {
    const { OpenAI: OpenAIApi } = require("openai");
    this.className = "RainyModelLLM";
    this.basePath =
      process.env.RAINYMODEL_BASE_PATH || "https://rm.orcest.ai/v1";
    const apiKey = process.env.RAINYMODEL_API_KEY || "rm-no-key";
    this.openai = new OpenAIApi({
      baseURL: this.basePath,
      apiKey,
      defaultHeaders: {
        "X-RainyModel-Policy": process.env.RAINYMODEL_POLICY || "auto",
      },
    });
    this.model =
      modelPreference || process.env.RAINYMODEL_MODEL_PREF || "rainymodel/auto";
    this.maxTokens = 4096;
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
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
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

  static promptWindowLimit(modelName) {
    return RAINYMODEL_MODELS[modelName]?.maxTokens ?? 32768;
  }

  promptWindowLimit() {
    return RAINYMODEL_MODELS[this.model]?.maxTokens ?? 32768;
  }

  isValidChatCompletionModel(modelName = "") {
    return true;
  }

  #generateContent({ userPrompt, attachments = [] }) {
    if (!attachments.length) return userPrompt;
    const content = [{ type: "text", text: userPrompt }];
    for (let attachment of attachments) {
      content.push({
        type: "image_url",
        image_url: { url: attachment.contentString, detail: "high" },
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
    const { formatChatHistory } = require("../../helpers/chat/responses");
    return [
      prompt,
      ...formatChatHistory(chatHistory, this.#generateContent),
      {
        role: "user",
        content: this.#generateContent({ userPrompt, attachments }),
      },
    ];
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
    const { uuid = uuidv4(), sources = [] } = responseProps;
    let hasUsageMetrics = false;
    let usage = { completion_tokens: 0 };

    return new Promise(async (resolve) => {
      let fullText = "";

      const handleAbort = () => {
        stream?.endMeasurement(usage);
        clientAbortedHandler(resolve, fullText);
      };
      response.on("close", handleAbort);

      try {
        for await (const chunk of stream) {
          const message = chunk?.choices?.[0];
          const token = message?.delta?.content;

          if (
            chunk.hasOwnProperty("usage") &&
            !!chunk.usage &&
            Object.values(chunk.usage).length > 0
          ) {
            if (chunk.usage.hasOwnProperty("prompt_tokens"))
              usage.prompt_tokens = Number(chunk.usage.prompt_tokens);
            if (chunk.usage.hasOwnProperty("completion_tokens")) {
              hasUsageMetrics = true;
              usage.completion_tokens = Number(chunk.usage.completion_tokens);
            }
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

async function fetchRainyModelModels(basePath = null) {
  const { OpenAI: OpenAIApi } = require("openai");
  const url = basePath || process.env.RAINYMODEL_BASE_PATH || "https://rm.orcest.ai/v1";
  const apiKey = process.env.RAINYMODEL_API_KEY || "rm-no-key";

  try {
    const openai = new OpenAIApi({ baseURL: url, apiKey });
    const list = await openai.models.list().catch(() => null);
    if (list?.data?.length > 0) {
      return list.data.map((m) => ({ id: m.id }));
    }
  } catch (_) {}

  return [
    { id: "rainymodel/auto" },
    { id: "rainymodel/chat" },
    { id: "rainymodel/code" },
    { id: "rainymodel/agent" },
  ];
}

module.exports = {
  RainyModelLLM,
  fetchRainyModelModels,
};
