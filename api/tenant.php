<?php
/**
 * Multi-tenant cafe slugs — maps miiziito.ir/{slug} to data/tenants/{cafeId}/.
 */

function lumiere_tenant_reserved_slugs() {
    return array(
        "admin" => true,
        "panel-admin" => true,
        "api" => true,
        "assets" => true,
        "_next" => true,
        "uploads" => true,
        "data" => true,
        "404" => true,
        "favicon.ico" => true,
        "robots.txt" => true,
        "_" => true,
    );
}

function lumiere_tenant_slugify($name) {
    $name = trim((string) $name);
    if ($name === "") return "cafe";
    $slug = strtolower($name);
    $slug = preg_replace('/[^a-z0-9]+/u', "-", $slug);
    $slug = trim($slug, "-");
    if ($slug === "") $slug = "cafe";
    if (strlen($slug) > 48) $slug = substr($slug, 0, 48);
    return $slug;
}

function lumiere_tenant_sanitize_slug($slug) {
    $slug = strtolower(trim((string) $slug));
    if ($slug === "") return "";
    if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/', $slug)) return "";
    if (isset(lumiere_tenant_reserved_slugs()[$slug])) return "";
    return $slug;
}

function lumiere_tenant_load_cafes() {
    if (!function_exists("lumiere_sa_load_collection")) return array();
    lumiere_sa_ensure_platform();
    $cafes = lumiere_sa_load_collection("cafes", array());
    return is_array($cafes) ? $cafes : array();
}

function lumiere_tenant_unique_slug($base, $cafes, $exceptId = "") {
    $base = lumiere_tenant_sanitize_slug(lumiere_tenant_slugify($base));
    if ($base === "") $base = "cafe";
    $slug = $base;
    $n = 2;
    while (true) {
        $taken = false;
        foreach ($cafes as $c) {
            if (!is_array($c)) continue;
            if ($exceptId !== "" && isset($c["id"]) && $c["id"] === $exceptId) continue;
            if (isset($c["slug"]) && strtolower((string) $c["slug"]) === $slug) {
                $taken = true;
                break;
            }
        }
        if (!$taken) return $slug;
        $slug = $base . "-" . $n;
        $n++;
    }
}

function lumiere_tenant_find_by_slug($slug) {
    $slug = lumiere_tenant_sanitize_slug($slug);
    if ($slug === "") return null;
    $matches = array();
    foreach (lumiere_tenant_load_cafes() as $c) {
        if (!is_array($c)) continue;
        if (isset($c["slug"]) && strtolower((string) $c["slug"]) === $slug) {
            $matches[] = $c;
        }
    }
    if (count($matches) === 0) return null;
    if (count($matches) === 1) return $matches[0];
    foreach (array("active", "trial") as $status) {
        foreach ($matches as $c) {
            if (isset($c["status"]) && (string) $c["status"] === $status) return $c;
        }
    }
    return $matches[0];
}

function lumiere_tenant_is_live($cafe) {
    if (!is_array($cafe)) return false;
    $status = isset($cafe["status"]) ? (string) $cafe["status"] : "";
    return in_array($status, array("active", "trial"), true);
}

function lumiere_tenant_assign_slug(&$cafe, $cafes, $preferred = "") {
    $exceptId = isset($cafe["id"]) ? (string) $cafe["id"] : "";
    if ($preferred !== "") {
        $slug = lumiere_tenant_sanitize_slug($preferred);
        if ($slug === "") return false;
        foreach ($cafes as $c) {
            if (!is_array($c)) continue;
            if ($exceptId !== "" && isset($c["id"]) && $c["id"] === $exceptId) continue;
            if (isset($c["slug"]) && strtolower((string) $c["slug"]) === $slug) return false;
        }
        $cafe["slug"] = $slug;
        return true;
    }
    if (!empty($cafe["slug"])) {
        $cafe["slug"] = lumiere_tenant_unique_slug((string) $cafe["slug"], $cafes, $exceptId);
        return true;
    }
    $cafe["slug"] = lumiere_tenant_unique_slug(isset($cafe["name"]) ? $cafe["name"] : "cafe", $cafes, $exceptId);
    return true;
}

function lumiere_tenant_ensure_slugs() {
    static $running = false;
    if ($running) {
        if (!function_exists("lumiere_sa_load_collection")) return array();
        $cafes = lumiere_sa_load_collection("cafes", array());
        return is_array($cafes) ? $cafes : array();
    }
    $running = true;
    if (!function_exists("lumiere_sa_load_collection")) {
        $running = false;
        return array();
    }
    $cafes = lumiere_sa_load_collection("cafes", array());
    if (!is_array($cafes)) $cafes = array();
    $changed = false;
    foreach ($cafes as $i => $c) {
        if (!is_array($c)) continue;
        if (!empty($c["slug"])) continue;
        $cafe = $c;
        lumiere_tenant_assign_slug($cafe, $cafes);
        $cafes[$i] = $cafe;
        $changed = true;
    }
    if ($changed && function_exists("lumiere_sa_save_collection")) {
        lumiere_sa_save_collection("cafes", $cafes);
    }
    $running = false;
    return $cafes;
}

function lumiere_tenant_request_slug($body) {
    foreach (array("HTTP_X_MIIZIITO_TENANT", "HTTP_X_LUMIER_TENANT") as $hdr) {
        if (!empty($_SERVER[$hdr])) {
            return lumiere_tenant_sanitize_slug($_SERVER[$hdr]);
        }
    }
    if (is_array($body) && !empty($body["tenant"])) {
        return lumiere_tenant_sanitize_slug($body["tenant"]);
    }
    if (isset($_GET["tenant"]) && $_GET["tenant"] !== "") {
        return lumiere_tenant_sanitize_slug($_GET["tenant"]);
    }
    return "";
}

function lumiere_tenant_provision($cafe) {
    if (!is_array($cafe) || empty($cafe["id"])) return false;
    $dataDir = dirname(__DIR__) . "/data";
    $tenantId = (string) $cafe["id"];
    $dir = $dataDir . "/tenants/" . $tenantId;
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $live = array(
        "orders.json" => "[]",
        "invoices.json" => "[]",
        "tables.json" => '{"regions":[],"states":{}}',
        "menu-overrides.json" => '{"_standalone": true}',
        "customers.json" => "[]",
        "reservations.json" => "[]",
        "sessions.json" => "{}",
        "costing.json" => '{"settings":{"profitPercent":40,"monthlyPortions":1000},"ingredients":[],"bills":[],"employees":[],"recipes":[]}',
    );
    foreach ($live as $file => $fallback) {
        $path = $dir . "/" . $file;
        if (!is_file($path)) {
            @file_put_contents($path, $fallback, LOCK_EX);
            @chmod($path, 0666);
        }
    }
    $settingsPath = $dir . "/settings.json";
    if (!is_file($settingsPath)) {
        $name = isset($cafe["name"]) ? trim((string) $cafe["name"]) : "کافه";
        if ($name === "") $name = "کافه";
        $base = array(
            "restaurantNameFa" => $name,
            "restaurantNameEn" => $name,
            "tagline" => "",
            "primary" => "#566347",
            "secondary" => "#D8DAD3",
            "logo" => "",
            "backgroundImage" => "",
            "creditName" => "",
            "receiptFooterMessage" => "",
        );
        @file_put_contents(
            $settingsPath,
            json_encode($base, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            LOCK_EX
        );
        @chmod($settingsPath, 0666);
    }
    $uploadsDir = dirname($dataDir) . "/uploads/tenants/" . $tenantId;
    if (!is_dir($uploadsDir)) {
        @mkdir($uploadsDir, 0775, true);
    }
    $brandingDir = $uploadsDir . "/branding";
    if (!is_dir($brandingDir)) {
        @mkdir($brandingDir, 0775, true);
    }
    $itemsDir = $uploadsDir . "/items";
    if (!is_dir($itemsDir)) {
        @mkdir($itemsDir, 0775, true);
    }
    return true;
}

function lumiere_tenant_apply_store(
    $dataDir,
    &$ordersFile,
    &$menuFile,
    &$tablesFile,
    &$invoicesFile,
    &$customersFile,
    &$settingsFile,
    &$reservationsFile,
    &$sessionsFile,
    &$uploadsDir,
    $tenantId
) {
    $tenantId = preg_replace('/[^a-zA-Z0-9_-]/', "", (string) $tenantId);
    if ($tenantId === "") return false;
    $dir = $dataDir . "/tenants/" . $tenantId;
    if (!is_dir($dir)) return false;

    $ordersFile = $dir . "/orders.json";
    $menuFile = $dir . "/menu-overrides.json";
    $tablesFile = $dir . "/tables.json";
    $invoicesFile = $dir . "/invoices.json";
    $customersFile = $dir . "/customers.json";
    $settingsFile = $dir . "/settings.json";
    $reservationsFile = $dir . "/reservations.json";
    $sessionsFile = $dir . "/sessions.json";
    $uploadsDir = dirname($dataDir) . "/uploads/tenants/" . $tenantId;

    foreach (array($ordersFile, $menuFile, $tablesFile, $invoicesFile, $customersFile, $reservationsFile, $sessionsFile) as $f) {
        if (!is_file($f)) {
            $empty = strpos($f, "menu") !== false || strpos($f, "tables") !== false ? "{}" : "[]";
            if (strpos($f, "sessions") !== false) $empty = "{}";
            @file_put_contents($f, $empty, LOCK_EX);
        }
    }
    if (!is_file($settingsFile)) {
        @file_put_contents($settingsFile, "{}", LOCK_EX);
    }
    if (!is_dir($uploadsDir)) {
        @mkdir($uploadsDir, 0775, true);
    }
    return true;
}

function lumiere_tenant_public_cafe($cafe) {
    if (!is_array($cafe)) return null;
    return array(
        "id" => isset($cafe["id"]) ? $cafe["id"] : "",
        "name" => isset($cafe["name"]) ? $cafe["name"] : "",
        "slug" => isset($cafe["slug"]) ? $cafe["slug"] : "",
        "status" => isset($cafe["status"]) ? $cafe["status"] : "",
    );
}

function lumiere_tenant_settings_path($tenantId) {
    $tenantId = preg_replace('/[^a-zA-Z0-9_-]/', "", (string) $tenantId);
    if ($tenantId === "") return "";
    return dirname(__DIR__) . "/data/tenants/" . $tenantId . "/settings.json";
}

function lumiere_tenant_read_settings($tenantId) {
    $path = lumiere_tenant_settings_path($tenantId);
    if ($path === "" || !is_file($path)) return array();
    $raw = @file_get_contents($path);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : array();
}

function lumiere_tenant_save_settings($tenantId, $settings) {
    $path = lumiere_tenant_settings_path($tenantId);
    if ($path === "") return false;
    if (!is_array($settings)) $settings = array();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (!isset($settings["updatedAt"])) {
        $settings["updatedAt"] = function_exists("now_ms") ? now_ms() : (int) round(microtime(true) * 1000);
    }
    $tmp = $path . ".tmp";
    $ok = @file_put_contents(
        $tmp,
        json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
    if ($ok === false) return false;
    @rename($tmp, $path);
    @chmod($path, 0666);
    return true;
}

function lumiere_tenant_generate_password() {
    return rtrim(strtr(base64_encode(random_bytes(10)), "+/", "-_"), "=");
}

function lumiere_tenant_has_cashier_password($tenantId) {
    $settings = lumiere_tenant_read_settings($tenantId);
    return !empty($settings["cashierPasswordHash"]);
}

function lumiere_tenant_set_cashier_password($tenantId, $plainPassword) {
    if (!function_exists("lumiere_sa_hash_password")) return false;
    $plainPassword = (string) $plainPassword;
    if ($plainPassword === "") return false;
    $settings = lumiere_tenant_read_settings($tenantId);
    $settings["cashierPasswordHash"] = lumiere_sa_hash_password($plainPassword);
    return lumiere_tenant_save_settings($tenantId, $settings);
}

function lumiere_tenant_verify_cashier_password($tenantId, $entered) {
    $settings = lumiere_tenant_read_settings($tenantId);
    if (empty($settings["cashierPasswordHash"])) return null;
    if (!function_exists("lumiere_sa_verify_password")) return false;
    return lumiere_sa_verify_password($entered, (string) $settings["cashierPasswordHash"]);
}

function lumiere_tenant_cashier_auth_meta($tenantId) {
    return array(
        "hasPassword" => lumiere_tenant_has_cashier_password($tenantId),
    );
}

function lumiere_entitlement_flag_keys() {
    return array(
        "invoices",
        "reservations",
        "coupons",
        "advancedAnalytics",
        "paymentTerminal",
        "crm",
        "hardware",
        "kitchenPrint",
        "tableOps",
        "menuCosting",
    );
}

function lumiere_entitlement_label($feature) {
    $labels = array(
        "invoices" => "فاکتور",
        "reservations" => "رزرو میز",
        "coupons" => "کوپن",
        "advancedAnalytics" => "آمار فروش",
        "paymentTerminal" => "پایانه پرداخت",
        "crm" => "باشگاه مشتریان",
        "hardware" => "سخت‌افزار و پرینتر",
        "kitchenPrint" => "چاپ تیکت آشپزخانه و بار",
        "tableOps" => "وضعیت میز و سفارش از نقشه میزها",
        "menuCosting" => "هزینه‌یابی منو",
    );
    $feature = (string) $feature;
    return isset($labels[$feature]) ? $labels[$feature] : $feature;
}

function lumiere_normalize_entitlements($raw, $defaultTrue = false) {
    $src = is_array($raw) ? $raw : array();
    $out = array();
    foreach (lumiere_entitlement_flag_keys() as $key) {
        if (array_key_exists($key, $src)) {
            $out[$key] = !empty($src[$key]);
        } else {
            $out[$key] = !!$defaultTrue;
        }
    }
    return $out;
}

function lumiere_default_plan_entitlements($tier) {
    $ent = lumiere_normalize_entitlements(array(), false);
    if ($tier === "professional" || $tier === "business") {
        foreach (array("invoices", "reservations", "coupons", "advancedAnalytics", "paymentTerminal", "tableOps") as $key) {
            $ent[$key] = true;
        }
    }
    if ($tier === "business") {
        foreach (array("crm", "hardware", "kitchenPrint", "menuCosting") as $key) {
            $ent[$key] = true;
        }
    }
    return $ent;
}

function lumiere_tenant_plan_access($cafe) {
    if (!is_array($cafe) || empty($cafe["id"])) {
        return array(
            "planId" => "",
            "planName" => "",
            "entitlements" => lumiere_normalize_entitlements(array(), true),
        );
    }
    $plans = array();
    $subs = array();
    if (function_exists("lumiere_sa_ensure_platform")) {
        lumiere_sa_ensure_platform();
    }
    if (function_exists("lumiere_sa_load_collection")) {
        $plans = lumiere_sa_load_collection("plans", array());
        if (!is_array($plans)) $plans = array();
        $subs = lumiere_sa_load_collection("subscriptions", array());
        if (!is_array($subs)) $subs = array();
    }
    $planMap = array();
    foreach ($plans as $p) {
        if (is_array($p) && !empty($p["id"])) {
            $planMap[(string) $p["id"]] = $p;
        }
    }
    $tenantId = (string) $cafe["id"];
    $tenantSubs = array();
    foreach ($subs as $s) {
        if (!is_array($s)) continue;
        if ((string) (isset($s["tenantId"]) ? $s["tenantId"] : "") !== $tenantId) continue;
        $tenantSubs[] = $s;
    }
    usort($tenantSubs, function ($a, $b) {
        $av = isset($a["createdAt"]) ? (string) $a["createdAt"] : "";
        $bv = isset($b["createdAt"]) ? (string) $b["createdAt"] : "";
        return strcmp($bv, $av);
    });
    $current = null;
    foreach ($tenantSubs as $s) {
        $st = isset($s["status"]) ? (string) $s["status"] : "";
        if (in_array($st, array("trial", "active", "past_due", "grace_period"), true)) {
            $current = $s;
            break;
        }
    }
    $planId = "";
    if ($current && !empty($current["planId"])) {
        $planId = (string) $current["planId"];
    } elseif (!empty($cafe["planId"])) {
        $planId = (string) $cafe["planId"];
    }
    $plan = ($planId !== "" && isset($planMap[$planId])) ? $planMap[$planId] : null;
    $entRaw = ($plan && isset($plan["entitlements"]) && is_array($plan["entitlements"]))
        ? $plan["entitlements"]
        : array();
    return array(
        "planId" => $planId,
        "planName" => ($plan && isset($plan["name"])) ? (string) $plan["name"] : "",
        "entitlements" => lumiere_normalize_entitlements($entRaw, false),
    );
}
