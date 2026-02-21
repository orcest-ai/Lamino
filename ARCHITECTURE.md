# Lamino — Architecture & Flow Documentation

> Intelligent LLM Workspace — part of the Orcest AI Ecosystem
> Domain: `llm.orcest.ai`

---

## Table of Contents

1. [System Architecture Diagram](#1-system-architecture-diagram)
2. [Complete Chat Flow — Detailed Flowchart](#2-complete-chat-flow--detailed-flowchart)
3. [Authentication Flow](#3-authentication-flow)
4. [Document Processing & RAG Pipeline](#4-document-processing--rag-pipeline)
5. [Agent Execution Flow](#5-agent-execution-flow)
6. [Workspace & Thread Management](#6-workspace--thread-management)
7. [MCP Server Integration](#7-mcp-server-integration)
8. [Embed Mode Architecture](#8-embed-mode-architecture)
9. [Component Details](#9-component-details)

---

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORCEST AI ECOSYSTEM                                  │
│                                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │orcest.ai │  │  Orcide  │  │Maestrist │  │  Status  │  │OllamaAPI │    │
│  │(Gateway) │  │ (IDE)    │  │ (Agent)  │  │(Monitor) │  │ (Free)   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │              │          │
│       └──────────────┴──────┬───────┴──────────────┴──────────────┘          │
│                             │                                                │
│                    ┌────────▼────────┐                                       │
│                    │  login.orcest.ai│                                       │
│                    │   (SSO/OIDC)    │                                       │
│                    └────────┬────────┘                                       │
│                             │                                                │
└─────────────────────────────┼────────────────────────────────────────────────┘
                              │
        ┌─────────────────────▼─────────────────────┐
        │              LAMINO (llm.orcest.ai)        │
        │                                            │
        │  ┌─────────────────────────────────────┐   │
        │  │         Frontend (React SPA)         │   │
        │  │  ┌──────┐ ┌───────┐ ┌────────────┐  │   │
        │  │  │ Chat │ │Wrkspc │ │  Settings  │  │   │
        │  │  │  UI  │ │Manager│ │   Panel    │  │   │
        │  │  └──┬───┘ └───┬───┘ └─────┬──────┘  │   │
        │  └─────┼─────────┼───────────┼──────────┘   │
        │        │         │           │               │
        │  ══════╪═════════╪═══════════╪══════════     │
        │  HTTP/SSE    REST API    WebSocket           │
        │  ══════╪═════════╪═══════════╪══════════     │
        │        │         │           │               │
        │  ┌─────▼─────────▼───────────▼──────────┐   │
        │  │     Express.js Server (Node.js)       │   │
        │  │                                       │   │
        │  │  ┌─────────────────────────────────┐  │   │
        │  │  │        Middleware Stack          │  │   │
        │  │  │  ┌──────────┐ ┌──────────────┐  │  │   │
        │  │  │  │  Orcest  │ │  Validated   │  │  │   │
        │  │  │  │   SSO    │ │   Request    │  │  │   │
        │  │  │  └──────────┘ └──────────────┘  │  │   │
        │  │  │  ┌──────────┐ ┌──────────────┐  │  │   │
        │  │  │  │  Multi   │ │   Valid      │  │  │   │
        │  │  │  │  User    │ │  Workspace   │  │  │   │
        │  │  │  └──────────┘ └──────────────┘  │  │   │
        │  │  └─────────────────────────────────┘  │   │
        │  │                                       │   │
        │  │  ┌─────────────────────────────────┐  │   │
        │  │  │        Endpoint Handlers         │  │   │
        │  │  │  ┌──────┐ ┌────────┐ ┌────────┐ │  │   │
        │  │  │  │ Chat │ │Wrkspc  │ │ Admin  │ │  │   │
        │  │  │  │Stream│ │  CRUD  │ │  Mgmt  │ │  │   │
        │  │  │  └──────┘ └────────┘ └────────┘ │  │   │
        │  │  │  ┌──────┐ ┌────────┐ ┌────────┐ │  │   │
        │  │  │  │Agent │ │  Doc   │ │  MCP   │ │  │   │
        │  │  │  │ WS   │ │Upload  │ │Servers │ │  │   │
        │  │  │  └──────┘ └────────┘ └────────┘ │  │   │
        │  │  │  ┌──────┐ ┌────────┐ ┌────────┐ │  │   │
        │  │  │  │Embed │ │Browser │ │ Agent  │ │  │   │
        │  │  │  │ API  │ │  Ext   │ │ Flows  │ │  │   │
        │  │  │  └──────┘ └────────┘ └────────┘ │  │   │
        │  │  └─────────────────────────────────┘  │   │
        │  │                                       │   │
        │  │  ┌─────────────────────────────────┐  │   │
        │  │  │       Core Services Layer        │  │   │
        │  │  │                                  │  │   │
        │  │  │  ┌────────────┐ ┌─────────────┐  │  │   │
        │  │  │  │ Chat Engine│ │ Agent Engine │  │  │   │
        │  │  │  │ (stream.js)│ │  (AIbitat)  │  │  │   │
        │  │  │  └─────┬──────┘ └──────┬──────┘  │  │   │
        │  │  │        │               │          │  │   │
        │  │  │  ┌─────▼───────────────▼──────┐   │  │   │
        │  │  │  │    LLM Provider Router     │   │  │   │
        │  │  │  │  (35+ providers supported) │   │  │   │
        │  │  │  └────────────┬───────────────┘   │  │   │
        │  │  │               │                   │  │   │
        │  │  │  ┌────────────▼───────────────┐   │  │   │
        │  │  │  │   Embedding Engine Router   │   │  │   │
        │  │  │  │  (13+ engines supported)   │   │  │   │
        │  │  │  └────────────┬───────────────┘   │  │   │
        │  │  │               │                   │  │   │
        │  │  │  ┌────────────▼───────────────┐   │  │   │
        │  │  │  │   Vector DB Provider        │   │  │   │
        │  │  │  │  (LanceDB default, 10+)    │   │  │   │
        │  │  │  └────────────────────────────┘   │  │   │
        │  │  └─────────────────────────────────┘  │   │
        │  └───────────────────────────────────────┘   │
        │                                              │
        │  ┌───────────────────────────────────────┐   │
        │  │         Data / Storage Layer           │   │
        │  │  ┌──────────┐ ┌──────────┐ ┌────────┐ │   │
        │  │  │ SQLite   │ │ LanceDB  │ │  File  │ │   │
        │  │  │ (Prisma) │ │(Vectors) │ │Storage │ │   │
        │  │  └──────────┘ └──────────┘ └────────┘ │   │
        │  └───────────────────────────────────────┘   │
        └──────────────────┬───────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   rm.orcest.ai          │
              │   (RainyModel Proxy)    │
              │                         │
              │  FREE ──► INTERNAL ──►  │
              │  (HF)    (Ollama)       │
              │           ──► PREMIUM   │
              │           (OpenRouter)  │
              └─────────────────────────┘
```

---

## 2. Complete Chat Flow — Detailed Flowchart

```
USER SENDS MESSAGE
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  POST /workspace/:slug/stream-chat                               │
│  POST /workspace/:slug/thread/:threadSlug/stream-chat            │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Middleware Chain    │
            │                     │
            │ 1. orcestSSO        │──── Token in cookie/header?
            │    middleware        │     │
            │                     │     ├── NO ──► 401 / Redirect to SSO
            │                     │     │
            │                     │     └── YES ─► Verify with login.orcest.ai
            │                     │                  │
            │                     │                  ├── INVALID ──► 401
            │                     │                  │
            │                     │                  └── VALID ──► Set res.locals.ssoUser
            │                     │
            │ 2. validatedRequest │──── API key or SSO token valid?
            │                     │     │
            │                     │     ├── NO ──► 403 Forbidden
            │                     │     │
            │                     │     └── YES ──► Continue
            │                     │
            │ 3. flexUserRole     │──── User has required role?
            │    Valid             │     │
            │                     │     ├── NO ──► 403 Forbidden
            │                     │     │
            │                     │     └── YES ──► Continue
            │                     │
            │ 4. validWorkspace   │──── Workspace slug exists?
            │    Slug              │     │
            │                     │     ├── NO ──► 400 Bad Request
            │                     │     │
            │                     │     └── YES ──► Set response.locals.workspace
            └─────────┬───────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │  Validate Message   │
            │                     │
            │  message is string  │
            │  AND not empty?     │
            │     │               │
            │     ├── NO ──► 400  │
            │     │   "Message    │
            │     │   is empty"   │
            │     │               │
            │     └── YES         │
            └─────────┬───────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │ Set SSE Headers     │
            │                     │
            │ Content-Type:       │
            │   text/event-stream │
            │ Cache-Control:      │
            │   no-cache          │
            │ Connection:         │
            │   keep-alive        │
            └─────────┬───────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │ Multi-User Mode?    │
            │                     │
            │ ┌── YES             │
            │ │   │               │
            │ │   ▼               │
            │ │ User.canSendChat? │
            │ │   │               │
            │ │   ├── NO ─► abort │
            │ │   │  "24h quota   │
            │ │   │   exceeded"   │
            │ │   │               │
            │ │   └── YES         │
            │ │                   │
            │ └── NO (single)     │
            └─────────┬───────────┘
                      │
                      ▼
       ┌──────────────────────────────┐
       │  streamChatWithWorkspace()   │
       │  (server/utils/chats/stream) │
       └──────────────┬───────────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │ 1. GREP COMMANDS    │
            │                     │
            │ Parse slash commands │
            │ & user presets       │
            │                     │
            │ message starts       │
            │ with /reset?         │
            │   │                  │
            │   ├── YES ──► Reset  │
            │   │   workspace      │
            │   │   memory & RETURN│
            │   │                  │
            │   └── NO ──► Replace │
            │       user preset    │
            │       commands with  │
            │       prompt text    │
            └─────────┬───────────┘
                      │
                      ▼
            ┌─────────────────────────┐
            │ 2. GREP AGENTS          │
            │                         │
            │ Does message invoke     │
            │ @agent handles?         │
            │   │                     │
            │   ├── YES               │
            │   │   │                 │
            │   │   ▼                 │
            │   │ Create new          │
            │   │ AgentInvocation     │
            │   │   │                 │
            │   │   ├── FAIL ──►      │
            │   │   │  statusResponse │
            │   │   │  "agents could  │
            │   │   │  not be called" │
            │   │   │                 │
            │   │   └── SUCCESS       │
            │   │       │             │
            │   │       ▼             │
            │   │  Send websocketUUID │
            │   │  to frontend        │
            │   │       │             │
            │   │       ▼             │
            │   │  Frontend opens     │
            │   │  WebSocket to       │
            │   │  /agent-invocation/ │
            │   │  :uuid              │
            │   │       │             │
            │   │       ▼             │
            │   │  [Agent Execution   │
            │   │   Flow - Section 5] │
            │   │       │             │
            │   │       ▼             │
            │   │  RETURN (exit HTTP) │
            │   │                     │
            │   └── NO                │
            └─────────┬───────────────┘
                      │
                      ▼
            ┌──────────────────────────┐
            │ 3. INITIALIZE PROVIDERS  │
            │                          │
            │ LLMConnector =           │
            │   getLLMProvider({        │
            │     provider:            │
            │       workspace.         │
            │       chatProvider,      │
            │     model:              │
            │       workspace.         │
            │       chatModel          │
            │   })                     │
            │                          │
            │ VectorDb =               │
            │   getVectorDbClass()     │
            │   (default: LanceDB)     │
            └─────────┬────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 4. CHECK VECTOR SPACE        │
            │                              │
            │ hasVectorizedSpace =         │
            │   VectorDb.hasNamespace(     │
            │     workspace.slug)          │
            │                              │
            │ embeddingsCount =            │
            │   VectorDb.namespaceCount(   │
            │     workspace.slug)          │
            │                              │
            │ ┌─────────────────────────┐  │
            │ │ chatMode == "query"     │  │
            │ │ AND embeddingsCount == 0│  │
            │ │   │                     │  │
            │ │   ├── YES ──► Return    │  │
            │ │   │   queryRefusal      │  │
            │ │   │   Response          │  │
            │ │   │   "No relevant      │  │
            │ │   │   information"      │  │
            │ │   │   + Save to DB      │  │
            │ │   │   + RETURN          │  │
            │ │   │                     │  │
            │ │   └── NO ──► Continue   │  │
            │ └─────────────────────────┘  │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 5. GATHER CHAT HISTORY       │
            │                              │
            │ messageLimit =               │
            │   workspace.openAiHistory    │
            │   (default: 20)              │
            │                              │
            │ { rawHistory, chatHistory } = │
            │   recentChatHistory({        │
            │     user, workspace,         │
            │     thread, messageLimit     │
            │   })                         │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 6. COLLECT CONTEXT SOURCES   │
            │                              │
            │ ┌──────────────────────────┐ │
            │ │ A. Pinned Documents       │ │
            │ │                          │ │
            │ │ DocumentManager({        │ │
            │ │   workspace,             │ │
            │ │   maxTokens:             │ │
            │ │     LLM.promptWindow()   │ │
            │ │ }).pinnedDocs()          │ │
            │ │   │                      │ │
            │ │   └── For each pinned:   │ │
            │ │       - Add to context   │ │
            │ │       - Add to sources   │ │
            │ │       - Track identifier │ │
            │ └──────────────────────────┘ │
            │                              │
            │ ┌──────────────────────────┐ │
            │ │ B. Parsed Files          │ │
            │ │                          │ │
            │ │ WorkspaceParsedFiles.    │ │
            │ │   getContextFiles(       │ │
            │ │     workspace,           │ │
            │ │     thread, user         │ │
            │ │   )                      │ │
            │ │   │                      │ │
            │ │   └── For each file:     │ │
            │ │       - Add to context   │ │
            │ │       - Add to sources   │ │
            │ └──────────────────────────┘ │
            │                              │
            │ ┌──────────────────────────┐ │
            │ │ C. Vector Similarity     │ │
            │ │    Search                │ │
            │ │                          │ │
            │ │ embeddingsCount > 0?     │ │
            │ │   │                      │ │
            │ │   ├── YES                │ │
            │ │   │   │                  │ │
            │ │   │   ▼                  │ │
            │ │   │ VectorDb.perform     │ │
            │ │   │   SimilaritySearch({ │ │
            │ │   │     namespace:       │ │
            │ │   │       workspace.slug,│ │
            │ │   │     input: message,  │ │
            │ │   │     LLMConnector,    │ │
            │ │   │     similarity       │ │
            │ │   │       Threshold,     │ │
            │ │   │     topN,            │ │
            │ │   │     filterIdentifiers│ │
            │ │   │       (pinned docs), │ │
            │ │   │     rerank:          │ │
            │ │   │       workspace.     │ │
            │ │   │       vectorSearch   │ │
            │ │   │       Mode=="rerank" │ │
            │ │   │   })                 │ │
            │ │   │                      │ │
            │ │   │   Search failed?     │ │
            │ │   │     │                │ │
            │ │   │     ├── YES ──►      │ │
            │ │   │     │  abort with    │ │
            │ │   │     │  error msg     │ │
            │ │   │     │  RETURN        │ │
            │ │   │     │                │ │
            │ │   │     └── NO ──►       │ │
            │ │   │        Continue      │ │
            │ │   │                      │ │
            │ │   └── NO ──► Empty       │ │
            │ │       results            │ │
            │ └──────────────────────────┘ │
            │                              │
            │ ┌──────────────────────────┐ │
            │ │ D. Fill Source Window    │ │
            │ │                          │ │
            │ │ fillSourceWindow({       │ │
            │ │   nDocs: topN || 4,      │ │
            │ │   searchResults,         │ │
            │ │   history: rawHistory,   │ │
            │ │   filterIdentifiers      │ │
            │ │ })                       │ │
            │ │                          │ │
            │ │ Backfill from history    │ │
            │ │ citations to maintain    │ │
            │ │ context continuity       │ │
            │ └──────────────────────────┘ │
            │                              │
            │ Merge all:                   │
            │ contextTexts = pinned +      │
            │   parsed + filled + search   │
            │ sources = pinned + parsed +  │
            │   vectorSearch (not filled)  │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 7. QUERY MODE FINAL CHECK    │
            │                              │
            │ chatMode == "query"          │
            │ AND contextTexts.length == 0 │
            │   │                          │
            │   ├── YES ──► Return         │
            │   │   queryRefusalResponse   │
            │   │   + Save to DB           │
            │   │   + RETURN               │
            │   │                          │
            │   └── NO ──► Continue        │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 8. COMPRESS & ASSEMBLE       │
            │                              │
            │ messages =                   │
            │   LLMConnector.compress      │
            │   Messages({                 │
            │     systemPrompt:            │
            │       chatPrompt(            │
            │         workspace, user),    │
            │     userPrompt: message,     │
            │     contextTexts,            │
            │     chatHistory,             │
            │     attachments              │
            │   }, rawHistory)             │
            │                              │
            │ - Builds system message      │
            │   with workspace prompt      │
            │ - Injects context chunks     │
            │ - Adds chat history           │
            │ - Compresses if > token      │
            │   limit (80% threshold)      │
            │ - Appends user message       │
            │ - Handles multimodal         │
            │   attachments                │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 9. LLM INFERENCE             │
            │                              │
            │ Streaming enabled?           │
            │   │                          │
            │   ├── NO (rare)              │
            │   │   │                      │
            │   │   ▼                      │
            │   │ LLMConnector.            │
            │   │   getChatCompletion(     │
            │   │     messages,            │
            │   │     { temperature,       │
            │   │       user }             │
            │   │   )                      │
            │   │   │                      │
            │   │   ▼                      │
            │   │ Send single              │
            │   │ textResponseChunk        │
            │   │ with close=true          │
            │   │                          │
            │   └── YES (default)          │
            │       │                      │
            │       ▼                      │
            │   LLMConnector.              │
            │     streamGetChatCompletion( │
            │       messages,              │
            │       { temperature,         │
            │         user }               │
            │     )                        │
            │       │                      │
            │       ▼                      │
            │   ┌─────────────────────┐    │
            │   │ LLM Provider sends  │    │
            │   │ request to:         │    │
            │   │                     │    │
            │   │ rm.orcest.ai/v1/    │    │
            │   │ chat/completions    │    │
            │   │ (via RainyModel)    │    │
            │   │                     │    │
            │   │ RainyModel routes:  │    │
            │   │ FREE (HuggingFace)  │    │
            │   │  ──► INTERNAL       │    │
            │   │      (Ollama)       │    │
            │   │  ──► PREMIUM        │    │
            │   │      (OpenRouter)   │    │
            │   └─────────────────────┘    │
            │       │                      │
            │       ▼                      │
            │   LLMConnector.handleStream( │
            │     response, stream,        │
            │     { uuid, sources }        │
            │   )                          │
            │       │                      │
            │       ▼                      │
            │   Stream chunks via SSE:     │
            │   ┌───────────────────┐      │
            │   │ { type:           │      │
            │   │   "textResponse   │      │
            │   │    Chunk",        │      │
            │   │   textResponse:   │      │
            │   │     "partial...", │      │
            │   │   close: false }  │      │
            │   │       │           │      │
            │   │       ▼           │      │
            │   │   ... repeat ...  │      │
            │   │       │           │      │
            │   │       ▼           │      │
            │   │ { close: true }   │      │
            │   └───────────────────┘      │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 10. SAVE & FINALIZE          │
            │                              │
            │ completeText.length > 0?     │
            │   │                          │
            │   ├── YES                    │
            │   │   │                      │
            │   │   ▼                      │
            │   │ WorkspaceChats.new({     │
            │   │   workspaceId,           │
            │   │   prompt: message,       │
            │   │   response: {            │
            │   │     text: completeText,  │
            │   │     sources,             │
            │   │     type: chatMode,      │
            │   │     attachments,         │
            │   │     metrics              │
            │   │   },                     │
            │   │   threadId, user         │
            │   │ })                       │
            │   │                          │
            │   └── (both paths)           │
            │                              │
            │ Send finalizeResponseStream  │
            │ { close: true,               │
            │   chatId, metrics }          │
            └─────────┬────────────────────┘
                      │
                      ▼
            ┌──────────────────────────────┐
            │ 11. POST-RESPONSE            │
            │                              │
            │ If thread chat:              │
            │   WorkspaceThread.           │
            │     autoRenameThread()       │
            │   (rename thread to first    │
            │    22 chars of message)      │
            │                              │
            │ Telemetry.sendTelemetry(     │
            │   "sent_chat", { ... })      │
            │                              │
            │ EventLogs.logEvent(          │
            │   "sent_chat", { ... })      │
            │                              │
            │ response.end()               │
            └──────────────────────────────┘
```

---

## 3. Authentication Flow

```
┌──────────┐                  ┌──────────────┐              ┌────────────────┐
│  Browser  │                  │    Lamino    │              │ login.orcest.ai│
│ (Client)  │                  │   Server     │              │    (SSO)       │
└─────┬─────┘                  └──────┬───────┘              └───────┬────────┘
      │                               │                              │
      │  GET /any-page                │                              │
      │──────────────────────────────►│                              │
      │                               │                              │
      │                    ┌──────────┴──────────┐                   │
      │                    │ orcestSSO middleware │                   │
      │                    │                     │                   │
      │                    │ Check cookie:       │                   │
      │                    │ lamino_sso_token    │                   │
      │                    │    │                │                   │
      │                    │    ├── EXISTS       │                   │
      │                    │    │   │            │                   │
      │                    │    │   ▼            │                   │
      │                    │    │ Check cache    │                   │
      │                    │    │ (5min TTL)     │                   │
      │                    │    │   │            │                   │
      │                    │    │   ├── HIT ──►  │                   │
      │                    │    │   │  Set user  │                   │
      │                    │    │   │  next()    │                   │
      │                    │    │   │            │                   │
      │                    │    │   └── MISS     │                   │
      │                    │    │       │        │                   │
      │                    │    │       ▼        │                   │
      │                    │    │   POST /api/   │                   │
      │                    │    │   token/verify─┼──────────────────►│
      │                    │    │       │        │                   │
      │                    │    │       │        │◄──────────────────│
      │                    │    │       │        │  {valid, sub,     │
      │                    │    │       │        │   name, role}     │
      │                    │    │       │        │                   │
      │                    │    │       ├── VALID│                   │
      │                    │    │       │  Cache │                   │
      │                    │    │       │  token │                   │
      │                    │    │       │  next()│                   │
      │                    │    │       │        │                   │
      │                    │    │       └── INVALID                  │
      │                    │    │           │    │                   │
      │                    │    │           ▼    │                   │
      │                    │    └── NOT EXISTS   │                   │
      │                    │        │            │                   │
      │                    │        ▼            │                   │
      │                    │   Is API request?   │                   │
      │                    │     │               │                   │
      │                    │     ├── YES ──►     │                   │
      │                    │     │  401 JSON     │                   │
      │                    │     │  {error:      │                   │
      │                    │     │   "auth_      │                   │
      │                    │     │   required",  │                   │
      │                    │     │   redirect}   │                   │
      │                    │     │               │                   │
      │                    │     └── NO (browser)│                   │
      │                    │         │           │                   │
      │                    │         ▼           │                   │
      │                    │     302 Redirect    │                   │
      │                    └─────────┬───────────┘                   │
      │                              │                               │
      │◄─────────────────────────────│                               │
      │  302 → SSO_ISSUER/oauth2/                                    │
      │  authorize?client_id=lamino                                  │
      │  &redirect_uri=llm.orcest.ai/auth/callback                  │
      │  &response_type=code                                         │
      │  &scope=openid+profile+email                                 │
      │  &state=base64({returnTo})                                   │
      │                                                              │
      │  GET /oauth2/authorize                                       │
      │─────────────────────────────────────────────────────────────►│
      │                                                              │
      │◄─────────────────────────────────────────────────────────────│
      │  User authenticates (login form / existing session)          │
      │                                                              │
      │  GET /auth/callback?code=XXX&state=YYY                       │
      │──────────────────────────────►│                              │
      │                               │                              │
      │                               │  POST /oauth2/token          │
      │                               │  {grant_type:                │
      │                               │   authorization_code,        │
      │                               │   code, redirect_uri,        │
      │                               │   client_id, client_secret}  │
      │                               │─────────────────────────────►│
      │                               │                              │
      │                               │◄─────────────────────────────│
      │                               │  {access_token, expires_in}  │
      │                               │                              │
      │◄──────────────────────────────│                              │
      │  Set-Cookie: lamino_sso_token │                              │
      │  302 → returnTo (or /)        │                              │
      │                               │                              │
```

---

## 4. Document Processing & RAG Pipeline

```
┌────────────────────────────────────────────────────────────────┐
│                    DOCUMENT INGESTION FLOW                      │
└────────────────────────────────────────────────────────────────┘

    User uploads document (PDF, TXT, DOCX, CSV, etc.)
         │
         ▼
┌────────────────────┐
│  Collector API     │
│  /process-document │
│                    │
│  1. File type      │
│     detection      │
│  2. Extract text   │
│     content        │
│  3. Split into     │
│     chunks         │
│  4. Generate       │
│     metadata       │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐          ┌────────────────────────┐
│  Embedding Engine  │          │  Supported Engines:    │
│                    │          │                        │
│  Text chunks ──►   │          │  - Native (default)    │
│  Vector embeddings │          │  - OpenAI              │
│                    │          │  - Ollama              │
│                    │          │  - Azure OpenAI        │
│                    │          │  - Cohere              │
│                    │          │  - Gemini              │
│                    │          │  - Voyage AI           │
│                    │          │  - LiteLLM             │
│                    │          │  - Mistral             │
│                    │          │  - LM Studio           │
│                    │          │  - Generic OpenAI      │
│                    │          │  - OpenRouter          │
└────────┬───────────┘          └────────────────────────┘
         │
         ▼
┌────────────────────┐          ┌────────────────────────┐
│  Vector Database   │          │  Supported DBs:        │
│                    │          │                        │
│  Store vectors in  │          │  - LanceDB (default)   │
│  workspace         │          │  - Pinecone            │
│  namespace         │          │  - Chroma / ChromaCloud│
│                    │          │  - Weaviate            │
│  namespace =       │          │  - Qdrant              │
│    workspace.slug  │          │  - Milvus / Zilliz     │
│                    │          │  - Astra DB            │
│                    │          │  - PGVector            │
└────────────────────┘          └────────────────────────┘


┌────────────────────────────────────────────────────────────────┐
│                     RAG RETRIEVAL FLOW                          │
│               (during chat, see step 6 above)                  │
└────────────────────────────────────────────────────────────────┘

    User message received
         │
         ▼
    ┌─────────────────┐
    │ Context Sources  │
    │ (collected in    │
    │  parallel)       │
    └─────┬───────────┘
          │
    ┌─────┼──────────────────┬─────────────────────┐
    │     │                  │                     │
    ▼     ▼                  ▼                     ▼
┌──────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐
│Pinned│ │  Parsed  │ │  Vector   │ │    History        │
│ Docs │ │  Files   │ │  Search   │ │    Backfill       │
│      │ │          │ │           │ │                    │
│Admin │ │Per-thread│ │Similarity │ │fillSourceWindow()  │
│pins  │ │per-user  │ │search on  │ │Past citations      │
│docs  │ │uploads   │ │embeddings │ │from chat history   │
│to    │ │          │ │           │ │to maintain         │
│always│ │Temporary │ │topN=4     │ │context continuity  │
│inject│ │context   │ │threshold  │ │                    │
│      │ │          │ │rerank?    │ │                    │
└──┬───┘ └────┬─────┘ └────┬─────┘ └────────┬───────────┘
   │          │            │                 │
   └──────────┴────────────┴─────────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │  contextTexts[] ──► │  Full content for LLM comprehension
          │  sources[] ─────►   │  Truncated citations for user display
          └─────────────────────┘
                     │
                     ▼
          ┌─────────────────────────┐
          │ LLMConnector.compress   │
          │   Messages()            │
          │                         │
          │ If total tokens >       │
          │ 80% of model limit:     │
          │   ──► Compress context  │
          │                         │
          │ Final message array:    │
          │ [system, ...history,    │
          │  context, user_msg]     │
          └─────────────────────────┘
```

---

## 5. Agent Execution Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    AGENT INVOCATION FLOW                          │
│              (triggered by @agent in message)                    │
└──────────────────────────────────────────────────────────────────┘

    Message contains @agent handle
         │
         ▼
    ┌─────────────────────────┐
    │ WorkspaceAgentInvocation│
    │   .new({                │
    │     prompt, workspace,  │
    │     user, thread        │
    │   })                    │
    │                         │
    │ Creates invocation      │
    │ record with UUID        │
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ HTTP Response (SSE):    │
    │                         │
    │ {type: "agentInit       │
    │  WebsocketConnection",  │
    │  websocketUUID: "..."}  │
    │                         │
    │ Frontend receives UUID  │
    │ and opens WebSocket     │
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────────────────────────┐
    │  WebSocket: /agent-invocation/:uuid          │
    │                                              │
    │  1. AgentHandler.init()                      │
    │     └── Load invocation from DB              │
    │     └── Validate UUID                        │
    │                                              │
    │  2. agentHandler.createAIbitat({ socket })   │
    │     └── Initialize AIbitat agent runtime     │
    │     └── Load agent plugins:                  │
    │         - Web browsing                       │
    │         - Web scraping                       │
    │         - SQL connector                      │
    │         - File summarizer                    │
    │         - Code interpreter                   │
    │         - RAG search                         │
    │         - MCP tools                          │
    │         - Custom skills                      │
    │                                              │
    │  3. agentHandler.startAgentCluster()         │
    │     └── Begin agent execution loop:          │
    │                                              │
    │     ┌───────────────────────────────┐        │
    │     │  Agent Loop                    │        │
    │     │                               │        │
    │     │  Agent analyzes prompt ──►     │        │
    │     │  Selects tool/plugin ──►       │        │
    │     │  Executes action ──►           │        │
    │     │  Sends status via WS ──►       │        │
    │     │  Evaluates result ──►          │        │
    │     │                               │        │
    │     │  ┌── More work needed?        │        │
    │     │  │   ├── YES ──► Loop back    │        │
    │     │  │   └── NO ──► Final answer  │        │
    │     │  │                            │        │
    │     │  └── User sends /exit?        │        │
    │     │      └── YES ──► Bail & close │        │
    │     └───────────────────────────────┘        │
    │                                              │
    │  WebSocket messages:                         │
    │  - { type: "statusResponse" }  (progress)    │
    │  - { type: "textResponse" }    (results)     │
    │  - { type: "wssFailure" }      (errors)      │
    │                                              │
    │  Socket close:                               │
    │  - agentHandler.closeAlert()                 │
    │  - WorkspaceAgentInvocation.close(uuid)      │
    └──────────────────────────────────────────────┘
```

---

## 6. Workspace & Thread Management

```
┌──────────────────────────────────────────────────────────────────┐
│                    WORKSPACE HIERARCHY                            │
└──────────────────────────────────────────────────────────────────┘

    User (authenticated via SSO)
     │
     ├── Workspace A (slug: "project-alpha")
     │    │
     │    ├── Settings:
     │    │   ├── chatProvider: "openai" (or workspace override)
     │    │   ├── chatModel: "rainymodel/auto"
     │    │   ├── chatMode: "chat" | "query"
     │    │   ├── openAiTemp: 0.7
     │    │   ├── openAiHistory: 20 (message limit)
     │    │   ├── similarityThreshold: 0.25
     │    │   ├── topN: 4
     │    │   ├── vectorSearchMode: "default" | "rerank"
     │    │   └── queryRefusalResponse: "custom message..."
     │    │
     │    ├── Documents (embedded in vector DB namespace)
     │    │   ├── doc1.pdf (chunked + vectorized)
     │    │   ├── doc2.txt (chunked + vectorized)
     │    │   └── pinned_doc.md (always injected in context)
     │    │
     │    ├── Parsed Files (temporary context per thread/user)
     │    │
     │    ├── Default Thread (chat history)
     │    │   ├── Message 1 (user)
     │    │   ├── Message 2 (assistant + sources + metrics)
     │    │   └── ...
     │    │
     │    └── Named Threads
     │         ├── Thread "Bug Fix" (slug, own history)
     │         └── Thread "Feature Plan" (auto-renamed)
     │
     ├── Workspace B (slug: "research")
     │    └── ...
     │
     └── Workspace C (embedded / public via Embed)
          └── ...

┌──────────────────────────────────────────────────────────────────┐
│                    KEY OPERATIONS                                 │
└──────────────────────────────────────────────────────────────────┘

  POST /workspace/new         ──► Create workspace + namespace
  POST /workspace/:slug/update ──► Update settings
  DELETE /workspace/:slug      ──► Delete workspace + vectors + chats
  POST /workspace/:slug/upload ──► Upload & embed documents
  POST /workspace/:slug/chat   ──► Send message (non-streaming)
  POST /workspace/:slug/stream-chat ──► Send message (SSE streaming)

  POST /workspace/:slug/thread/new  ──► Create thread
  POST /workspace/:slug/thread/:ts/stream-chat ──► Chat in thread
```

---

## 7. MCP Server Integration

```
┌──────────────────────────────────────────────────────────────────┐
│                    MCP (Model Context Protocol)                   │
└──────────────────────────────────────────────────────────────────┘

    Admin configures MCP servers
         │
         ▼
    ┌─────────────────────────┐
    │ MCPCompatibilityLayer   │
    │                         │
    │ GET /mcp-servers/list   │──► List configured servers
    │ POST /mcp-servers/toggle│──► Enable/disable server
    │ POST /mcp-servers/delete│──► Remove server
    │ GET /mcp-servers/       │
    │     force-reload        │──► Reload all MCP connections
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ MCP servers provide     │
    │ tools to agents:        │
    │                         │
    │ - External APIs         │
    │ - Database queries      │
    │ - File operations       │
    │ - Custom integrations   │
    │                         │
    │ Tools are registered    │
    │ as AIbitat plugins      │
    │ and available during    │
    │ agent execution loop    │
    └─────────────────────────┘
```

---

## 8. Embed Mode Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    EMBED MODE (Public Widget)                     │
└──────────────────────────────────────────────────────────────────┘

    External website
     │
     ├── Embeds <script> from Lamino
     │
     └── Widget renders chat interface
          │
          ▼
    ┌─────────────────────────┐
    │ Embed endpoints:        │
    │                         │
    │ No SSO required         │
    │ (uses embed token)      │
    │                         │
    │ POST /embed/:slug/      │
    │   stream-chat           │
    │                         │
    │ Uses same               │
    │ streamChatWithWorkspace │
    │ under the hood          │
    │                         │
    │ Restricted to:          │
    │ - Specific workspace    │
    │ - Chat mode only        │
    │ - Rate limited          │
    └─────────────────────────┘

    Embed Management:
    POST /embed/new           ──► Create embed config
    POST /embed/:slug/update  ──► Update embed settings
    DELETE /embed/:slug       ──► Remove embed
    GET /embed/:slug          ──► Get embed info
```

---

## 9. Component Details

### 9.1 Middleware Stack (execution order)

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | `cookieParser` | Parse cookies from request |
| 2 | `cors` | CORS with credentials support |
| 3 | `bodyParser` | Parse request body (text, JSON, URL-encoded, up to 3GB) |
| 4 | `orcestSSOMiddleware` | Verify SSO token, set `res.locals.ssoUser` |
| 5 | `validatedRequest` | Validate API key or session token |
| 6 | `flexUserRoleValid` | Check user role (admin, manager, default) |
| 7 | `validWorkspaceSlug` | Validate workspace exists and user has access |

### 9.2 LLM Providers (35+)

Lamino supports 35+ LLM providers through its provider router (`getLLMProvider`). Each provider implements a common interface: `streamingEnabled()`, `promptWindowLimit()`, `getChatCompletion()`, `streamGetChatCompletion()`, `handleStream()`, `compressMessages()`.

**In Orcest deployment**: Uses `generic-openai` provider pointed at `rm.orcest.ai/v1` (RainyModel proxy), which then auto-routes across tiers.

### 9.3 Vector Database Providers (10)

LanceDB (default, embedded), Pinecone, Chroma, ChromaCloud, Weaviate, Qdrant, Milvus, Zilliz, Astra DB, PGVector.

### 9.4 Data Storage

| Store | Technology | Purpose |
|-------|-----------|---------|
| Relational | SQLite via Prisma | Users, workspaces, chats, threads, invocations, settings |
| Vector | LanceDB (default) | Document embeddings per workspace namespace |
| File | Local filesystem | Uploaded documents, workspace profile pictures |

### 9.5 Key Endpoint Summary

| Endpoint Group | Count | Auth | Description |
|----------------|-------|------|-------------|
| `/auth/*` | 3 | Public | OAuth2 callback, logout, SSO endpoints |
| `/api/system/*` | ~10 | SSO | System config, health, version |
| `/api/workspace/*` | ~20 | SSO+Role | CRUD, chat, upload, search |
| `/api/workspace/*/thread/*` | ~8 | SSO+Role | Thread management, thread chat |
| `/api/admin/*` | ~10 | Admin | User management, system settings |
| `/api/document/*` | ~4 | Manager+ | Folder/file management |
| `/api/embed/*` | ~6 | Admin | Embed widget config |
| `/api/agent-flows/*` | ~5 | Admin | Agent flow CRUD, toggle |
| `/api/mcp-servers/*` | ~4 | Admin | MCP server management |
| `/agent-invocation/:uuid` | WS | Session | Agent WebSocket execution |
| `/api/extensions/*` | ~5 | Admin | Browser ext, community hub |
| `/api/v1/*` | ~6 | API Key | Developer/external API access |

---

## Data Flow Summary

```
User ──► SSO Auth ──► Workspace Selection ──► Chat Input
                                                  │
                    ┌─────────────────────────────┘
                    │
                    ▼
            ┌── Command? (/reset)
            │       └── YES ──► Execute command ──► Response
            │
            ├── Agent? (@agent)
            │       └── YES ──► WebSocket ──► AIbitat loop ──► Response
            │
            └── Regular Chat
                    │
                    ▼
            Context Assembly:
            [Pinned Docs] + [Parsed Files] + [Vector Search] + [History Backfill]
                    │
                    ▼
            Prompt Compression (fit token limit)
                    │
                    ▼
            LLM Provider ──► RainyModel Proxy ──► LLM Inference
                    │
                    ▼
            Stream Response (SSE) ──► Save to DB ──► Display to User
```
