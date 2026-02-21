const {
  normalizePersianText,
  tokenizePersianText,
  hasPersianScript,
  detectTextDirection,
  getPersianSystemPromptSuffix,
  buildPersianSearchQuery,
} = require("../../../../utils/helpers/chat/language");

describe("Persian language normalization", () => {
  test("normalizes Arabic Yeh to Persian Yeh", () => {
    expect(normalizePersianText("مي خواهم")).toBe("می خواهم");
    expect(normalizePersianText("بررسي")).toBe("بررسی");
  });

  test("normalizes Arabic Kaf to Persian Kaf", () => {
    expect(normalizePersianText("كد")).toBe("کد");
    expect(normalizePersianText("كتاب")).toBe("کتاب");
  });

  test("normalizes Arabic variants used in Persian text", () => {
    const input = "مي خواهم كد را بررسي كنم";
    expect(normalizePersianText(input)).toBe("می خواهم کد را بررسی کنم");
  });

  test("normalizes Alef variants", () => {
    expect(normalizePersianText("أحمد")).toBe("احمد");
    expect(normalizePersianText("إسلام")).toBe("اسلام");
    expect(normalizePersianText("آب")).toBe("اب");
  });

  test("normalizes Teh Marbuta to Heh", () => {
    expect(normalizePersianText("مدرسة")).toBe("مدرسه");
  });

  test("normalizes Hamza on Waw and Yeh", () => {
    expect(normalizePersianText("مسؤول")).toBe("مسوول");
    expect(normalizePersianText("مسائل")).toBe("مسایل");
  });

  test("removes diacritics and trims whitespace", () => {
    const input = "  سَلام   دنیا  ";
    expect(normalizePersianText(input)).toBe("سلام دنیا");
  });

  test("removes Tatweel/Kashida", () => {
    expect(normalizePersianText("سلـام")).toBe("سلام");
    expect(normalizePersianText("خـــداحـافـظ")).toBe("خداحافظ");
  });

  test("normalizes multiple ZWNJ to single", () => {
    expect(normalizePersianText("می\u200c\u200cخواهم")).toBe("می\u200cخواهم");
  });

  test("handles ZWNJ adjacent to space", () => {
    expect(normalizePersianText("می \u200cخواهم")).toBe("می خواهم");
  });

  test("handles empty input", () => {
    expect(normalizePersianText("")).toBe("");
    expect(normalizePersianText(null)).toBe("");
    expect(normalizePersianText(undefined)).toBe("");
  });

  test("handles non-string input", () => {
    expect(normalizePersianText(123)).toBe("");
    expect(normalizePersianText({})).toBe("");
    expect(normalizePersianText([])).toBe("");
  });

  test("preserves English text within Persian", () => {
    const input = "من از JavaScript استفاده می‌کنم";
    const result = normalizePersianText(input);
    expect(result).toContain("JavaScript");
    expect(result).toContain("من");
  });

  test("handles mixed Persian-English-numbers", () => {
    const input = "لطفاً 3 فایل PDF آپلود کنید";
    const result = normalizePersianText(input);
    expect(result).toBe("لطفا 3 فایل PDF اپلود کنید");
  });
});

describe("Persian text tokenization", () => {
  test("tokenizes basic Persian text", () => {
    const tokens = tokenizePersianText("سلام دنیا");
    expect(tokens).toEqual(["سلام", "دنیا"]);
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

  test("removes Persian punctuation during tokenization", () => {
    const input = "آیا؟ بله! نه، شاید...";
    const tokens = tokenizePersianText(input);
    expect(tokens).toEqual(["ایا", "بله", "نه", "شاید"]);
  });

  test("handles empty input", () => {
    expect(tokenizePersianText("")).toEqual([]);
    expect(tokenizePersianText(null)).toEqual([]);
  });

  test("handles pure English input", () => {
    const tokens = tokenizePersianText("hello world test");
    expect(tokens).toEqual(["hello", "world", "test"]);
  });

  test("handles mixed language tokens", () => {
    const tokens = tokenizePersianText("سلام hello دنیا world");
    expect(tokens).toEqual(["سلام", "hello", "دنیا", "world"]);
  });

  test("handles long Persian query about programming", () => {
    const input = "چگونه می‌توانم یک API در Node.js بسازم؟";
    const tokens = tokenizePersianText(input);
    expect(tokens.length).toBeGreaterThan(3);
    expect(tokens).toContain("API");
    expect(tokens).toContain("Node.js");
  });
});

describe("Persian script detection", () => {
  test("detects Persian/Arabic script", () => {
    expect(hasPersianScript("hello world")).toBe(false);
    expect(hasPersianScript("سلام world")).toBe(true);
    expect(hasPersianScript("سلام")).toBe(true);
  });

  test("detects Arabic script", () => {
    expect(hasPersianScript("مرحبا بالعالم")).toBe(true);
  });

  test("returns false for pure English", () => {
    expect(hasPersianScript("Hello, how are you?")).toBe(false);
  });

  test("returns false for numbers only", () => {
    expect(hasPersianScript("12345")).toBe(false);
  });

  test("returns false for empty/invalid input", () => {
    expect(hasPersianScript("")).toBe(false);
    expect(hasPersianScript(null)).toBe(false);
    expect(hasPersianScript(123)).toBe(false);
  });

  test("detects Arabic Extended characters", () => {
    // Arabic Extended-A range
    expect(hasPersianScript("\u08A0")).toBe(true);
  });
});

describe("Text direction detection", () => {
  test("detects RTL for Persian text", () => {
    expect(detectTextDirection("سلام دنیا")).toBe("rtl");
  });

  test("detects LTR for English text", () => {
    expect(detectTextDirection("Hello world")).toBe("ltr");
  });

  test("detects RTL when Persian is first strong char", () => {
    expect(detectTextDirection("  سلام hello")).toBe("rtl");
  });

  test("detects LTR when English is first strong char", () => {
    expect(detectTextDirection("Hello سلام")).toBe("ltr");
  });

  test("defaults to LTR for empty input", () => {
    expect(detectTextDirection("")).toBe("ltr");
    expect(detectTextDirection("   ")).toBe("ltr");
  });

  test("detects RTL for Hebrew text", () => {
    expect(detectTextDirection("שלום עולם")).toBe("rtl");
  });

  test("detects LTR for numbers only", () => {
    expect(detectTextDirection("12345")).toBe("ltr");
  });
});

describe("Persian system prompt suffix", () => {
  test("returns Persian instructions for Persian input", () => {
    const suffix = getPersianSystemPromptSuffix("سلام، کمک لازم دارم");
    expect(suffix).toContain("Persian");
    expect(suffix).toContain("MUST respond in Persian");
    expect(suffix.length).toBeGreaterThan(50);
  });

  test("returns empty string for English input", () => {
    const suffix = getPersianSystemPromptSuffix("Hello, I need help");
    expect(suffix).toBe("");
  });

  test("returns empty string for empty input", () => {
    expect(getPersianSystemPromptSuffix("")).toBe("");
    expect(getPersianSystemPromptSuffix()).toBe("");
  });

  test("returns instructions for mixed but Persian-dominant text", () => {
    const suffix = getPersianSystemPromptSuffix("می‌خواهم JavaScript یاد بگیرم");
    expect(suffix).toContain("Persian");
  });
});

describe("Persian search query building", () => {
  test("builds enhanced query for Persian text", () => {
    const query = buildPersianSearchQuery("چگونه سرعت پاسخ را بهبود دهم؟");
    expect(query.length).toBeGreaterThan(0);
    // Should contain normalized text
    expect(query).toContain("سرعت");
    expect(query).toContain("پاسخ");
  });

  test("handles short Persian query", () => {
    const query = buildPersianSearchQuery("سلام");
    expect(query).toBe("سلام");
  });

  test("handles empty input", () => {
    const query = buildPersianSearchQuery("");
    expect(query).toBe("");
  });

  test("builds query with key terms extracted", () => {
    const query = buildPersianSearchQuery("من می‌خواهم درباره هوش مصنوعی اطلاعات بگیرم");
    expect(query.split("\n").length).toBeGreaterThanOrEqual(1);
  });
});

describe("Regression: typical Persian prompts", () => {
  // These are real-world Persian prompts that should work correctly
  const typicalPrompts = [
    "چگونه می‌توانم Python یاد بگیرم؟",
    "لطفاً یک کد ساده برای مرتب‌سازی بنویس",
    "فرق بین React و Vue چیست؟",
    "می‌خواهم یک وب‌سایت با Next.js بسازم",
    "خطای ۴۰۴ در API چه معنایی دارد؟",
    "آیا می‌توانی کد من را بررسی کنی؟",
    "یک مثال از async/await در JavaScript بنویس",
    "بهترین روش برای امنیت وب‌اپلیکیشن چیست؟",
    "چرا Docker از VM بهتر است؟",
    "راهنمای نصب Node.js روی اوبونتو",
  ];

  typicalPrompts.forEach((prompt, i) => {
    test(`typical Persian prompt #${i + 1} is detected as Persian`, () => {
      expect(hasPersianScript(prompt)).toBe(true);
    });

    test(`typical Persian prompt #${i + 1} normalizes without error`, () => {
      const normalized = normalizePersianText(prompt);
      expect(normalized.length).toBeGreaterThan(0);
    });

    test(`typical Persian prompt #${i + 1} tokenizes without error`, () => {
      const tokens = tokenizePersianText(prompt);
      expect(tokens.length).toBeGreaterThan(0);
    });

    test(`typical Persian prompt #${i + 1} gets system prompt suffix`, () => {
      const suffix = getPersianSystemPromptSuffix(prompt);
      expect(suffix.length).toBeGreaterThan(0);
    });

    test(`typical Persian prompt #${i + 1} builds search query`, () => {
      const query = buildPersianSearchQuery(prompt);
      expect(query.length).toBeGreaterThan(0);
    });
  });
});
