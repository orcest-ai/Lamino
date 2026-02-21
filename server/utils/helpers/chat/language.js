/**
 * Normalize Persian/Arabic orthographic variants that often hurt retrieval quality.
 * - Arabic Yeh (ي) => Persian Yeh (ی)
 * - Arabic Kaf (ك) => Persian Kaf (ک)
 * - Remove Tatweel/Kashida
 * - Remove Arabic diacritics
 * - Normalize zero-width non-joiners and spaces
 * @param {string} input
 * @returns {string}
 */
function normalizePersianText(input = "") {
  if (typeof input !== "string" || !input.length) return "";

  return input
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ـ]/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200c+/g, "\u200c")
    .replace(/\s+/g, " ")
    .trim();
}


function tokenizePersianText(input = "") {
  const normalized = normalizePersianText(input);
  if (!normalized.length) return [];

  return normalized
    .replace(/[!?؟،,:;()\[\]{}"'`«»]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hasPersianScript(input = "") {
  if (typeof input !== "string") return false;
  return /[\u0600-\u06FF]/.test(input);
}

module.exports = {
  normalizePersianText,
  tokenizePersianText,
  hasPersianScript,
};
