# راهنمای تنظیمات Lamino در اکوسیستم Orcest AI

## کارهای انجام‌شده (خودکار)

- ✅ برندینگ Lamino جایگزین AnythingLLM
- ✅ لوگوی Lamino (SVG)
- ✅ endpoint `/api/auth/me` برای نمایش نام کاربر SSO
- ✅ نمایش نام کاربر در سایدبار
- ✅ حذف bypass غیرضروری برای SSO
- ✅ پوشش کامل SSO روی تمام APIها

---

## اقدامات لازم توسط شما

### ۱. متغیرهای محیطی در Render (سرویس Lamino)

در Dashboard Render برای سرویس Lamino، این متغیرها را تنظیم کنید:

| متغیر | مقدار | توضیح |
|-------|------|-------|
| `ORCEST_SSO_ENABLED` | `true` | فعال‌سازی اجبار ورود SSO |
| `SSO_CLIENT_SECRET` | همان مقدار `OIDC_LAMINO_SECRET` در سرویس login | رمز مشترک با Login |
| `SSO_ISSUER` | `https://login.orcest.ai` | آدرس سرویس SSO |
| `SSO_CLIENT_ID` | `lamino` | شناسه کلاینت |
| `SSO_CALLBACK_URL` | `https://llm.orcest.ai/auth/callback` | مسیر callback بعد از لاگین |

### ۲. متغیر سرویس Login

مطمئن شوید در سرویس **login** متغیر `OIDC_LAMINO_SECRET` تنظیم شده و مقدار آن با `SSO_CLIENT_SECRET` Lamino یکسان است.

### ۳. رفع خطای async_generator (در صورت بروز)

اگر هنوز با خطای زیر مواجه می‌شوید:
```
OpenrouterException - 'async_generator' object has no attribute '__next__'
```

این متغیر را به Lamino در Render اضافه کنید:

| متغیر | مقدار |
|-------|------|
| `GENERIC_OPENAI_STREAMING_DISABLED` | `true` |

### ۴. Manual Deploy

بعد از تنظیم متغیرها، در Render روی **Manual Deploy** کلیک کنید تا build جدید با تغییرات اخیر اجرا شود.

---

## جریان ورود SSO

1. کاربر بدون لاگین به `llm.orcest.ai` می‌رود
2. به `login.orcest.ai/oauth2/authorize?...` هدایت می‌شود
3. بعد از لاگین موفق، به `llm.orcest.ai/auth/callback` برگردانده و توکن در کوکی ذخیره می‌شود
4. کاربر به صفحه قبلی (مثلاً workspace) برمی‌گردد
5. نام کاربر در سایدبار نمایش داده می‌شود
