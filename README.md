# میزییتو (Miiziito)

پلتفرم اشتراک نرم‌افزار کافه و رستوران — فرانت‌اند **Next.js** در [`frontend/`](frontend/) و بک‌اند **PHP/Python** در [`api/`](api/) و [`tools/`](tools/).

```
lumiere/
├── frontend/     # Next.js (منو + پنل)
├── api/          # PHP JSON API
├── data/         # secret.php + دادهٔ زمان اجرا
├── uploads/      # تصاویر آیتم‌ها
├── .htaccess
└── robots.txt
```

## توسعه محلی

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd frontend
npm install
npm run dev
```

این دستور هم‌زمان Next.js و API محلی (`tools/local_api.py`) را بالا می‌آورد تا ورود پنل با همان رمزهای `data/secret.php` کار کند.

- منوی مشتری: `http://127.0.0.1:3000`
- صندوق: `http://127.0.0.1:3000/admin`

روی هاست واقعی همان `api/index.php` استفاده می‌شود. اگر فرانت و API هم‌دامنه نیستند، در `frontend/lib/config.ts` مقدار `apiUrl` را تنظیم کنید.

## بیلد و آپلود روی هاست (cPanel)

```bash
cd frontend && npm run build
```

محتوای `frontend/out/` را در `public_html` کپی کنید، و این‌ها را **نگه دارید**:

- پوشهٔ `api` (`index.php`)
- پوشهٔ `data` شامل `secret.php` و `.htaccess`
- پوشهٔ `uploads`
- `.htaccess` ریشه و `robots.txt`

رمز صندوقدار در `data/secret.php` است. ورود پنل: `https://lumiere-cafe.ir/admin/`

پوشهٔ `data` را روی دسترسی `755` بگذارید.

## امکانات پنل

- ورود با رمز سمت سرور
- صدای سفارش جدید
- وضعیت: جدید → آماده‌سازی → آماده → تحویل
- سفارش جدید / ویرایش از صندوق
- مدیریت قیمت و تمام‌شدن آیتم
- آمار فروش و فاکتورها (حالت آزمایشی)
- صدازدن گارسون
- صف آفلاین اگر وای‌فای قطع شود
