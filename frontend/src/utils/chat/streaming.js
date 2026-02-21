import { fetchEventSource } from "@microsoft/fetch-event-source";
import { safeJsonParse } from "@/utils/request";

export function retryBackoff(attempt = 0, baseMs = 450) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, baseMs * (attempt + 1)))
  );
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}

export function recoverableStreamErrorMessage(lastError = null) {
  return `Connection dropped while streaming${lastError?.message ? ` (${lastError.message})` : ""}. You can continue from the partial response.`;
}

/**
 * Shared client SSE streaming helper for workspace + thread chat.
 * Reduces drift/conflicts between mirrored stream handlers.
 */
export async function streamWithRetry({
  url,
  body,
  headers,
  signal,
  handleChat,
  buildAbortPayload,
  maxRetries = 2,
}) {
  let finalized = false;
  let receivedChunks = false;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await fetchEventSource(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers,
        signal,
        openWhenHidden: true,
        async onopen(response) {
          if (response.ok) return;

          if (
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429
          ) {
            handleChat(buildAbortPayload(response.status));
            throw new Error("Invalid Status code response.");
          }

          throw new Error("Transient stream open error");
        },
        async onmessage(msg) {
          const chatResult = safeJsonParse(msg.data, null);
          if (!chatResult) return;

          receivedChunks = true;
          if (chatResult?.type === "finalizeResponseStream") finalized = true;
          handleChat(chatResult);
        },
        onerror(err) {
          lastError = err;
          if (finalized) return;
          throw err;
        },
      });

      return;
    } catch (error) {
      const shouldRetry =
        !signal.aborted && !finalized && !receivedChunks && attempt < maxRetries;
      if (shouldRetry) {
        await retryBackoff(attempt);
        continue;
      }

      if (isAbortError(error)) return;
      handleChat({
        id: String(Date.now()),
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error: recoverableStreamErrorMessage(lastError),
      });
      return;
    }
  }
}
