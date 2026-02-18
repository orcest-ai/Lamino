<a name="readme-top"></a>

<p align="center">
  <h1 align="center">Lamino</h1>
  <p align="center"><b>Intelligent LLM Workspace</b> — Part of the Orcest AI Ecosystem</p>
</p>

<p align="center">
  <a href="https://llm.orcest.ai">Live Instance</a> |
  <a href="https://orcest.ai">Orcest AI</a> |
  <a href="./LICENSE">License (MIT)</a>
</p>

A full-stack application that enables you to turn any document, resource, or piece of content into context that any LLM can use as a reference during chatting. Lamino connects to **RainyModel** (rm.orcest.ai) for intelligent LLM routing with automatic fallback across free, internal, and premium providers.

### Orcest AI Ecosystem

| Service | Domain | Role |
|---------|--------|------|
| **Lamino** | llm.orcest.ai | LLM Workspace |
| **RainyModel** | rm.orcest.ai | LLM Routing Proxy |
| **Maestrist** | agent.orcest.ai | AI Agent Platform |
| **Orcide** | ide.orcest.ai | Cloud IDE |
| **Login** | login.orcest.ai | SSO Authentication |

Lamino divides your documents into objects called `workspaces`. A Workspace functions a lot like a thread, but with the addition of containerization of your documents. Workspaces can share documents, but they do not talk to each other so you can keep your context for each workspace clean.

## Features

- Full MCP-compatibility
- No-code AI Agent builder
- Multi-modal support (both closed and open-source LLMs)
- Custom AI Agents
- Multi-user instance support and permissioning (Docker version)
- Agents inside your workspace (browse the web, etc)
- Custom Embeddable Chat widget for your website (Docker version)
- Multiple document type support (PDF, TXT, DOCX, etc)
- Simple chat UI with Drag-n-Drop functionality and clear citations
- 100% Cloud deployment ready
- Works with all popular closed and open-source LLM providers
- Built-in cost & time-saving measures for managing very large documents
- Full Developer API for custom integrations
- **Powered by RainyModel** for intelligent LLM routing

### Supported LLMs, Embedder Models, Speech models, and Vector Databases

**Large Language Models (LLMs):**

- [Any open-source llama.cpp compatible model](/server/storage/models/README.md#text-generation-llm-selection)
- [OpenAI](https://openai.com)
- [OpenAI (Generic)](https://openai.com)
- [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- [AWS Bedrock](https://aws.amazon.com/bedrock/)
- [Anthropic](https://www.anthropic.com/)
- [NVIDIA NIM (chat models)](https://build.nvidia.com/explore/discover)
- [Google Gemini Pro](https://ai.google.dev/)
- [Hugging Face (chat models)](https://huggingface.co/)
- [Ollama (chat models)](https://ollama.ai/)
- [LM Studio (all models)](https://lmstudio.ai)
- [LocalAI (all models)](https://localai.io/)
- [Together AI (chat models)](https://www.together.ai/)
- [Fireworks AI (chat models)](https://fireworks.ai/)
- [Perplexity (chat models)](https://www.perplexity.ai/)
- [OpenRouter (chat models)](https://openrouter.ai/)
- [DeepSeek (chat models)](https://deepseek.com/)
- [Mistral](https://mistral.ai/)
- [Groq](https://groq.com/)
- [Cohere](https://cohere.com/)
- [KoboldCPP](https://github.com/LostRuins/koboldcpp)
- [LiteLLM](https://github.com/BerriAI/litellm)
- [Text Generation Web UI](https://github.com/oobabooga/text-generation-webui)
- [Apipie](https://apipie.ai/)
- [xAI](https://x.ai/)
- [Z.AI (chat models)](https://z.ai/model-api)
- [Novita AI (chat models)](https://novita.ai/model-api/product/llm-api)
- [PPIO](https://ppinfra.com)
- [Gitee AI](https://ai.gitee.com/)
- [Moonshot AI](https://www.moonshot.ai/)
- [Microsoft Foundry Local](https://github.com/microsoft/Foundry-Local)
- [CometAPI (chat models)](https://api.cometapi.com/)
- [Docker Model Runner](https://docs.docker.com/ai/model-runner/)
- [PrivateModeAI (chat models)](https://privatemode.ai/)
- [SambaNova Cloud (chat models)](https://cloud.sambanova.ai/)

**Embedder models:**

- [Lamino Native Embedder](/server/storage/models/README.md) (default)
- [OpenAI](https://openai.com)
- [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service)
- [LocalAI (all)](https://localai.io/)
- [Ollama (all)](https://ollama.ai/)
- [LM Studio (all)](https://lmstudio.ai)
- [Cohere](https://cohere.com/)

**Audio Transcription models:**

- Lamino Built-in (default)
- [OpenAI](https://openai.com/)

**TTS (text-to-speech) support:**

- Native Browser Built-in (default)
- [PiperTTSLocal - runs in browser](https://github.com/rhasspy/piper)
- [OpenAI TTS](https://platform.openai.com/docs/guides/text-to-speech/voice-options)
- [ElevenLabs](https://elevenlabs.io/)
- Any OpenAI Compatible TTS service.

**STT (speech-to-text) support:**

- Native Browser Built-in (default)

**Vector Databases:**

- [LanceDB](https://github.com/lancedb/lancedb) (default)
- [PGVector](https://github.com/pgvector/pgvector)
- [Astra DB](https://www.datastax.com/products/datastax-astra)
- [Pinecone](https://pinecone.io)
- [Chroma & ChromaCloud](https://trychroma.com)
- [Weaviate](https://weaviate.io)
- [Qdrant](https://qdrant.tech)
- [Milvus](https://milvus.io)
- [Zilliz](https://zilliz.com)

### Technical Overview

This monorepo consists of six main sections:

- `frontend`: A viteJS + React frontend that you can run to easily create and manage all your content the LLM can use.
- `server`: A NodeJS express server to handle all the interactions and do all the vectorDB management and LLM interactions.
- `collector`: NodeJS express server that processes and parses documents from the UI.
- `docker`: Docker instructions and build process + information for building from source.
- `embed`: Submodule for generation & creation of the web embed widget.
- `browser-extension`: Submodule for the chrome browser extension.

## Self-Hosting

Lamino can be deployed via Docker or bare metal. See [BARE_METAL.md](./BARE_METAL.md) for non-Docker setup.

## How to setup for development

- `yarn setup` To fill in the required `.env` files you'll need in each of the application sections (from root of repo).
  - Go fill those out before proceeding. Ensure `server/.env.development` is filled or else things won't work right.
- `yarn dev:server` To boot the server locally (from root of repo).
- `yarn dev:frontend` To boot the frontend locally (from root of repo).
- `yarn dev:collector` To then run the document collector (from root of repo).

[Learn about documents](./server/storage/documents/DOCUMENTS.md)

[Learn about vector caching](./server/storage/vector-cache/VECTOR_CACHE.md)

## Privacy

Lamino contains an optional telemetry feature that collects anonymous usage information. Set `DISABLE_TELEMETRY=true` in your server or docker `.env` to opt out. You can also disable it in-app via sidebar > Privacy.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

---

This project is [MIT](./LICENSE) licensed.

Part of the [Orcest AI](https://orcest.ai) ecosystem.
