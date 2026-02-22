const OpenAI = require("openai");
const Provider = require("./ai-provider.js");
const InheritMultiple = require("./helpers/classes.js");
const UnTooled = require("./helpers/untooled.js");
const { toValidNumber } = require("../../../http/index.js");
const { getLaminoUserAgent } = require("../../../../endpoints/utils");

/**
 * The agent provider for the RainyModel provider.
 */
class RainyModelProvider extends InheritMultiple([Provider, UnTooled]) {
  model;

  constructor(config = {}) {
    super();
    const { model = "rainymodel/auto" } = config;
    const client = new OpenAI({
      baseURL: process.env.RAINYMODEL_BASE_PATH,
      apiKey: process.env.RAINYMODEL_API_KEY ?? null,
      maxRetries: 3,
      defaultHeaders: {
        "User-Agent": getLaminoUserAgent(),
      },
    });

    this._client = client;
    this.model = model;
    this.verbose = true;
    this.maxTokens = process.env.RAINYMODEL_MAX_TOKENS
      ? toValidNumber(process.env.RAINYMODEL_MAX_TOKENS, 1024)
      : 1024;
  }

  get client() {
    return this._client;
  }

  get supportsAgentStreaming() {
    return true;
  }

  async #handleFunctionCallChat({ messages = [] }) {
    return await this.client.chat.completions
      .create({
        model: this.model,
        temperature: 0,
        messages,
        max_tokens: this.maxTokens,
      })
      .then((result) => {
        if (!result.hasOwnProperty("choices"))
          throw new Error("RainyModel chat: No results!");
        if (result.choices.length === 0)
          throw new Error("RainyModel chat: No results length!");
        return result.choices[0].message.content;
      })
      .catch((_) => {
        return null;
      });
  }

  async #handleFunctionCallStream({ messages = [] }) {
    return await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      messages,
    });
  }

  async stream(messages, functions = [], eventHandler = null) {
    return await UnTooled.prototype.stream.call(
      this,
      messages,
      functions,
      this.#handleFunctionCallStream.bind(this),
      eventHandler
    );
  }

  async complete(messages, functions = []) {
    return await UnTooled.prototype.complete.call(
      this,
      messages,
      functions,
      this.#handleFunctionCallChat.bind(this)
    );
  }

  /**
   * Get the cost of the completion.
   *
   * @param _usage The completion to get the cost for.
   * @returns The cost of the completion.
   */
  getCost(_usage) {
    return 0;
  }
}

module.exports = RainyModelProvider;
