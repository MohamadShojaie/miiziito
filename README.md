# میزییتو (Miiziito)

پلتفرم SaaS کافه و رستوران — فرانت **Next.js** + API **PHP** (هاست) / Python یا PHP (لوکال).

```
lumiere/
├── frontend/          # Next.js
├── api/               # PHP API (production)
├── tools/local_api.py # Python API (dev سریع)
├── data/              # JSON + secret.php
├── scripts/           # dev + deploy
└── dist/              # خروجی deploy (بعد از npm run deploy)
```

---

## ۱. کار لوکال

### نصب (یک بار)

```bash
cd frontend
npm install
```

### روش A — سریع (Python API + JSON)

```bash
# از ریشه پروژه:
npm run dev
```

یا:

```bash
cd frontend && npm run dev
```

- **Platform:** http://127.0.0.1:3000/ (یا `/panel-admin/` برای پنل ادمین)
- **صندوق (تک کافه):** http://127.0.0.1:3000/admin/
- **منوی مشتری (UI):** http://127.0.0.1:3000/buzz/

رمزها در `data/secret.php`:

| نقش | رمز |
|-----|-----|
| صندوقدار | `125689#` |
| Super Admin | `owner@miiziito.local` / `MiiziitoOwner#2026` |
| Dev sandbox | `lumiere-dev#` |

> Python API چند-مستاجری (slug) را کامل شبیه production پیاده نکرده. برای تست `/buzz/admin/` از روش B استفاده کن.

### روش B — شبیه production (PHP API)

```bash
npm run dev:php
```

نیاز: PHP 8.1+ روی Mac (`brew install php`).

- **منوی Buzz:** http://127.0.0.1:3000/buzz/
- **پنل Buzz:** http://127.0.0.1:3000/buzz/admin/
- **Super Admin:** http://127.0.0.1:3000/panel-admin/

لوکال از **JSON** استفاده می‌کند. فایل `data/db.local.php` را **حذف یا rename** کن تا با Neon قاطی نشود.

### توقف سرور

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill
lsof -tiTCP:8787 -sTCP:LISTEN | xargs kill
```

---

## ۲. Deploy روی ParsPack (miiziito.ir)

### بیلد

```bash
npm run deploy
```

خروجی:

| فایل | مسیر |
|------|------|
| ZIP | `dist/miiziito-parspack.zip` |
| پوشه | `dist/parspack-deploy/` |

این بیلد خودکار:

- `data/db.local.php` را **حذف** می‌کند (JSON mode)
- خط `SetEnv MIIZIITO_DATABASE_URL` را از `.htaccess` **برمی‌دارد**

### آپلود cPanel

1. `miiziito-parspack.zip` → `public_html` → Extract
2. اگر سفارش زنده دارید، **`data/` را overwrite نکن**
3. روی سرور مطمئن شو:
   - `data/db.local.php` وجود **ندارد**
   - `.htaccess` خط Neon **ندارد**

### تست بعد از deploy

```
https://miiziito.ir/api/index.php?route=health   → "database":"json_files"
https://miiziito.ir/
https://miiziito.ir/panel-admin/login/
https://miiziito.ir/buzz/
https://miiziito.ir/buzz/admin/
```

---

## ۳. چرخهٔ کار پیشنهادی

```
1. npm run dev:php          ← توسعه لوکال
2. تست در مرورگر
3. npm run deploy           ← ساخت zip
4. آپلود روی ParsPack
5. تست health + login روی miiziito.ir
```

---

## نکات

- **Git:** `data/secret.php` و `data/db.local.php` در gitignore هستند — روی سرور دستی بمانند.
- **Neon PostgreSQL** روی ParsPack معمولاً وصل نمی‌شود → همان JSON کافی است (~۱۰ کافه).
- **Render** (`miiziito-api.onrender.com`) برای API جداگانه + Neon مناسب است؛ ParsPack = frontend + PHP یکجا.
