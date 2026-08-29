# Miiziito frontend (Next.js)

Static-exported App Router app. Talks to the PHP API in `../api`.

## Develop

```bash
cd frontend
npm install
npm run dev
```

This starts Next.js and the local API (`../tools/local_api.py`) together so admin login works with passwords from `../data/secret.php`.

- Menu: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Cashier: [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin)

Set `lib/config.ts` `apiUrl` if the API is not same-origin (leave `""` when deployed next to PHP).

## Build

```bash
cd frontend
npm run build
```

Output: `frontend/out/` (`index.html`, `admin/index.html`, `_next/`, `assets/`).

## Deploy (cPanel)

1. Build as above.
2. Copy `frontend/out/*` into `public_html`.
3. Keep `api/`, `data/`, and `uploads/` on the server.
4. Root `.htaccess` routes `/api/*` to PHP and `/admin` to the static admin page.

## Stack

- Next.js 15 App Router + TypeScript
- `output: "export"` (no Node server in production)
- PHP JSON API unchanged
