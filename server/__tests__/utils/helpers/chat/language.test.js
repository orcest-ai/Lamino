const {
  normalizePersianText,
  tokenizePersianText,
  hasPersianScript,
} = require("../../../../utils/helpers/chat/language");

describe("Persian language normalization", () => {
  test("normalizes Arabic variants used in Persian text", () => {
    const input = "مي خواهم كد را بررسي كنم";
    expect(normalizePersianText(input)).toBe("می خواهم کد را بررسی کنم");
  });

  test("removes diacritics and trims whitespace", () => {
    const input = "  سَلام   دنیا  ";
    expect(normalizePersianText(input)).toBe("سلام دنیا");
  });

  test("tokenizes Persian text for retrieval enrichment", () => {
    const input = "سلام، می‌خواهم درباره‌ی سرعتِ پاسخ توضیح بدهی؟";
    expect(tokenizePersianText(input)).toEqual([
      "سلام",
      "می‌خواهم",
      "درباره‌ی",
      "سرعت",
      "پاسخ",
      "توضیح",
      "بدهی",
    ]);
  });

  test("detects Persian/Arabic script", () => {
    expect(hasPersianScript("hello world")).toBe(false);
    expect(hasPersianScript("سلام world")).toBe(true);
  });
});
