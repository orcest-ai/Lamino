<a name="readme-top"></a>

<p align="center">
  <h1 align="center">Lamino</h1>
  <p align="center" dir="rtl"><b>فضای کاری هوشمند LLM</b> — بخشی از اکوسیستم Orcest AI</p>
</p>

<p align="center">
  <a href="https://llm.orcest.ai">نمونه زنده</a> |
  <a href="https://orcest.ai">Orcest AI</a> |
  <a href="../LICENSE">مجوز (MIT)</a>
</p>

<p align="center">
  <a href='../README.md'>English</a> | <a href='./README.tr-TR.md'>Turkish</a> | <a href='./README.zh-CN.md'>Chinese</a> | <a href='./README.ja-JP.md'>Japanese</a> | <b>فارسی</b>
</p>

<div dir="rtl">

یک اپلیکیشن کامل که به شما امکان می‌دهد هر سند، منبع یا محتوایی را به زمینه‌ای تبدیل کنید که هر LLM می‌تواند در حین گفتگو به عنوان مرجع از آن استفاده کند. Lamino با **RainyModel** (rm.orcest.ai) برای مسیریابی هوشمند LLM با بازگشت خودکار بین ارائه‌دهندگان رایگان، داخلی و حرفه‌ای یکپارچه است.

### اکوسیستم Orcest AI

| سرویس | دامنه | نقش |
|---------|--------|------|
| **Lamino** | llm.orcest.ai | فضای کاری LLM |
| **RainyModel** | rm.orcest.ai | پروکسی مسیریابی LLM |
| **Maestrist** | agent.orcest.ai | پلتفرم عامل هوش مصنوعی |
| **Orcide** | ide.orcest.ai | IDE ابری |
| **Login** | login.orcest.ai | احراز هویت SSO |

## ویژگی‌ها

- سازگاری کامل با MCP
- سازنده عامل هوش مصنوعی بدون کد
- پشتیبانی چندحالته (هم LLM‌های متن‌باز و هم تجاری)
- عامل‌های هوش مصنوعی سفارشی
- پشتیبانی از چند کاربر و مجوزها (نسخه Docker)
- رابط کاربری ساده چت با قابلیت کشیدن و رها کردن
- ۱۰۰٪ آماده استقرار در فضای ابری
- سازگار با تمام ارائه‌دهندگان محبوب LLM
- پشتیبانی از **RainyModel** برای مسیریابی هوشمند LLM

## میزبانی شخصی

Lamino قابل استقرار از طریق Docker یا bare metal است. برای راه‌اندازی بدون Docker، به [BARE_METAL.md](../BARE_METAL.md) مراجعه کنید.

## راه‌اندازی برای توسعه

- `yarn setup` برای پر کردن فایل‌های `.env` مورد نیاز
- `yarn dev:server` برای راه‌اندازی سرور
- `yarn dev:frontend` برای راه‌اندازی فرانت‌اند
- `yarn dev:collector` برای اجرای جمع‌کننده اسناد

## مشارکت

برای راهنمای مشارکت به [CONTRIBUTING.md](../CONTRIBUTING.md) مراجعه کنید.

</div>

---

این پروژه تحت مجوز [MIT](../LICENSE) است.

بخشی از اکوسیستم [Orcest AI](https://orcest.ai).
