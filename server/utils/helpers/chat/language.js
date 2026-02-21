/**
 * Enhanced Persian/Arabic/RTL language support for Lamino.
 *
 * Provides normalization, tokenization, language detection, and
 * system prompt augmentation for Persian (Farsi) and Arabic text.
 *
 * Normalizations applied:
 * - Arabic Yeh (ي) => Persian Yeh (ی)
 * - Arabic Kaf (ك) => Persian Kaf (ک)
 * - Arabic Alef variants => standard Alef (ا)
 * - Remove Tatweel/Kashida
 * - Remove Arabic diacritics (tashkeel)
 * - Normalize zero-width non-joiners and spaces
 * - Normalize Hamza variants
 * - Handle half-space normalization
 */

/**
 * Map of Arabic character variants to their Persian/normalized equivalents.
 * Extended to cover more edge cases for better retrieval quality.
 */
const CHAR_NORMALIZATION_MAP = [
  [/ي/g, "ی"],    // Arabic Yeh -> Persian Yeh
  [/ك/g, "ک"],    // Arabic Kaf -> Persian Kaf
  [/[ٱأإآ]/g, "ا"],  // Alef variants -> plain Alef
  [/ؤ/g, "و"],    // Waw with Hamza -> plain Waw
  [/ئ/g, "ی"],    // Yeh with Hamza -> Persian Yeh
  [/ة/g, "ه"],    // Teh Marbuta -> Heh
  [/[ـ]/g, ""],    // Tatweel/Kashida removal
];

/**
 * Unicode ranges for diacritics (tashkeel) removal.
 * Covers: Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra,
 * Shadda, Sukun, and Superscript Alef.
 */
const DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/**
 * Persian/Arabic punctuation characters to strip during tokenization.
 */
const PUNCTUATION_REGEX = /[!?؟،,.:;()\[\]{}"'`«»\-—٫٪…•·]/g;

/**
 * Normalize Persian/Arabic orthographic variants that often hurt retrieval quality.
 * @param {string} input - Raw text that may contain Persian/Arabic script
 * @returns {string} Normalized text
 */
function normalizePersianText(input = "") {
  if (typeof input !== "string" || !input.length) return "";

  let result = input;

  // Apply character normalizations
  for (const [pattern, replacement] of CHAR_NORMALIZATION_MAP) {
    result = result.replace(pattern, replacement);
  }

  return result
    .replace(DIACRITICS_REGEX, "")         // Remove diacritics
    .replace(/\u200c+/g, "\u200c")         // Normalize multiple ZWNJ to single
    .replace(/\u200c\s|\s\u200c/g, " ")    // ZWNJ adjacent to space -> space
    .replace(/\s+/g, " ")                   // Collapse whitespace
    .trim();
}

/**
 * Tokenize Persian/Arabic text into search-friendly tokens.
 * Strips punctuation and splits on whitespace after normalization.
 * @param {string} input - Raw text to tokenize
 * @returns {string[]} Array of normalized tokens
 */
function tokenizePersianText(input = "") {
  const normalized = normalizePersianText(input);
  if (!normalized.length) return [];

  return normalized
    .replace(PUNCTUATION_REGEX, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Detect if text contains Persian/Arabic script characters.
 * Uses the Arabic Unicode block range (U+0600–U+06FF) plus
 * Arabic Supplement (U+0750–U+077F) and Arabic Extended-A (U+08A0–U+08FF).
 * @param {string} input - Text to check
 * @returns {boolean} True if text contains Arabic/Persian script
 */
function hasPersianScript(input = "") {
  if (typeof input !== "string") return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(input);
}

/**
 * Detect the primary language direction of the text.
 * Returns "rtl" if the first strong character is RTL, otherwise "ltr".
 * @param {string} input - Text to analyze
 * @returns {"rtl"|"ltr"} Text direction
 */
function detectTextDirection(input = "") {
  if (typeof input !== "string" || !input.length) return "ltr";

  // Check for RTL characters (Arabic, Hebrew, Syriac, Thaana)
  const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const ltrRegex = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

  for (const char of input) {
    if (rtlRegex.test(char)) return "rtl";
    if (ltrRegex.test(char)) return "ltr";
  }
  return "ltr";
}

/**
 * Generate a Persian-aware system prompt suffix.
 * When the user writes in Persian, this instructs the LLM to:
 * 1. Respond in Persian by default
 * 2. Preserve technical terms in English where appropriate
 * 3. Use correct Persian grammar and formal register
 * @param {string} userMessage - The user's message to check
 * @returns {string} System prompt suffix (empty if not Persian)
 */
function getPersianSystemPromptSuffix(userMessage = "") {
  if (!hasPersianScript(userMessage)) return "";

  return `

IMPORTANT LANGUAGE INSTRUCTIONS:
- The user is writing in Persian (Farsi). You MUST respond in Persian unless explicitly asked to use another language.
- Use formal Persian register (سطح رسمی) appropriate for professional communication.
- Keep technical terms, code snippets, URLs, and proper nouns in English/Latin script.
- Ensure correct right-to-left text flow for Persian content.
- Use Persian numerals (۰۱۲۳۴۵۶۷۸۹) for numbers within Persian sentences, but keep numbers in code or technical contexts in Western Arabic numerals.
- When mixing Persian and English, ensure each segment maintains its correct directionality.`;
}

/**
 * Build enhanced search queries for Persian text.
 * Generates multiple query variants to improve vector search recall:
 * 1. Original normalized text
 * 2. Tokens joined with spaces (punctuation stripped)
 * 3. Key terms extracted (tokens > 2 chars)
 * @param {string} input - User query in Persian
 * @returns {string} Enhanced search query
 */
function buildPersianSearchQuery(input = "") {
  const normalized = normalizePersianText(input);
  const tokens = tokenizePersianText(input);

  if (!tokens.length) return normalized;

  // Extract key terms (longer tokens more likely to be meaningful)
  const keyTerms = tokens.filter((t) => t.length > 2);

  // Build composite query
  const parts = [normalized];
  if (keyTerms.length > 0 && keyTerms.length < tokens.length) {
    parts.push(keyTerms.join(" "));
  }

  return parts.join("\n");
}

module.exports = {
  normalizePersianText,
  tokenizePersianText,
  hasPersianScript,
  detectTextDirection,
  getPersianSystemPromptSuffix,
  buildPersianSearchQuery,
  CHAR_NORMALIZATION_MAP,
  DIACRITICS_REGEX,
  PUNCTUATION_REGEX,
};
