export const API_BASE = import.meta.env.VITE_API_BASE || "/api";
export const ONBOARDING_SURVEY_URL = "https://onboarding.lamino.orcest.ai";

export const AUTH_USER = "lamino_user";
export const AUTH_TOKEN = "lamino_authToken";
export const AUTH_TIMESTAMP = "lamino_authTimestamp";
export const COMPLETE_QUESTIONNAIRE = "lamino_completed_questionnaire";
export const SEEN_DOC_PIN_ALERT = "lamino_pinned_document_alert";
export const SEEN_WATCH_ALERT = "lamino_watched_document_alert";
export const LAST_VISITED_WORKSPACE = "lamino_last_visited_workspace";
export const USER_PROMPT_INPUT_MAP = "lamino_user_prompt_input_map";

export const APPEARANCE_SETTINGS = "lamino_appearance_settings";

/**
 * Migrate localStorage keys from legacy AnythingLLM to Lamino.
 * Runs once on first load to preserve user sessions during rebrand.
 */
(function migrateLocalStorageKeys() {
  const migrations = [
    ["anythingllm_user", AUTH_USER],
    ["anythingllm_authToken", AUTH_TOKEN],
    ["anythingllm_authTimestamp", AUTH_TIMESTAMP],
    ["anythingllm_completed_questionnaire", COMPLETE_QUESTIONNAIRE],
    ["anythingllm_pinned_document_alert", SEEN_DOC_PIN_ALERT],
    ["anythingllm_watched_document_alert", SEEN_WATCH_ALERT],
    ["anythingllm_last_visited_workspace", LAST_VISITED_WORKSPACE],
    ["anythingllm_user_prompt_input_map", USER_PROMPT_INPUT_MAP],
    ["anythingllm_appearance_settings", APPEARANCE_SETTINGS],
    ["anythingllm_sidebar_toggle", "lamino_sidebar_toggle"],
    ["anythingllm_text_size", "lamino_text_size"],
    ["anythingllm-chat-message-alignment", "lamino-chat-message-alignment"],
  ];
  try {
    for (const [oldKey, newKey] of migrations) {
      if (
        localStorage.getItem(oldKey) !== null &&
        localStorage.getItem(newKey) === null
      ) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
    }
  } catch {
    // localStorage may not be available
  }
})();

export const OLLAMA_COMMON_URLS = [
  "http://127.0.0.1:11434",
  "http://host.docker.internal:11434",
  "http://172.17.0.1:11434",
];

export const LMSTUDIO_COMMON_URLS = [
  "http://localhost:1234/v1",
  "http://127.0.0.1:1234/v1",
  "http://host.docker.internal:1234/v1",
  "http://172.17.0.1:1234/v1",
];

export const KOBOLDCPP_COMMON_URLS = [
  "http://127.0.0.1:5000/v1",
  "http://localhost:5000/v1",
  "http://host.docker.internal:5000/v1",
  "http://172.17.0.1:5000/v1",
];

export const LOCALAI_COMMON_URLS = [
  "http://127.0.0.1:8080/v1",
  "http://localhost:8080/v1",
  "http://host.docker.internal:8080/v1",
  "http://172.17.0.1:8080/v1",
];

export const DPAIS_COMMON_URLS = [
  "http://127.0.0.1:8553/v1/openai",
  "http://0.0.0.0:8553/v1/openai",
  "http://localhost:8553/v1/openai",
  "http://host.docker.internal:8553/v1/openai",
];

export const NVIDIA_NIM_COMMON_URLS = [
  "http://127.0.0.1:8000/v1/version",
  "http://localhost:8000/v1/version",
  "http://host.docker.internal:8000/v1/version",
  "http://172.17.0.1:8000/v1/version",
];

export const DOCKER_MODEL_RUNNER_COMMON_URLS = [
  "http://localhost:12434/engines/llama.cpp/v1",
  "http://127.0.0.1:12434/engines/llama.cpp/v1",
  "http://model-runner.docker.internal/engines/llama.cpp/v1",
  "http://host.docker.internal:12434/engines/llama.cpp/v1",
  "http://172.17.0.1:12434/engines/llama.cpp/v1",
];

export function fullApiUrl() {
  if (API_BASE !== "/api") return API_BASE;
  return `${window.location.origin}/api`;
}

export const POPUP_BROWSER_EXTENSION_EVENT = "NEW_BROWSER_EXTENSION_CONNECTION";
