Miiziito — ParsPack deploy package
================================

1. Upload ALL files in this folder to public_html (merge/replace).
   If you already have live orders, do NOT overwrite data/ — upload api/, .htaccess, _next/, _/, panel-admin/ only.
2. ParsPack uses JSON files (no Neon). Do NOT add data/db.local.php or SetEnv in .htaccess.
3. cPanel → PHP 8.1+.
4. data/ permissions: 755 (secret.php must exist).
5. uploads/ permissions: 755 (writable for images).

Test:
  https://YOUR-DOMAIN/api/index.php?route=health  → {"database":"json_files"}
  https://YOUR-DOMAIN/
  https://YOUR-DOMAIN/{cafe-slug}/admin/
  https://YOUR-DOMAIN/panel-admin/login/
