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
