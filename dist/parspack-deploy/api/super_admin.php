<?php
/**
 * Super Admin / SaaS platform API — JSON store under data/platform/.
 * Mirrors tools/super_admin.py request/response shapes.
 */

require_once __DIR__ . "/tenant.php";

define("LUMIERE_SA_SESSION_TTL", 60 * 60 * 12);
define("LUMIERE_SA_SESSION_TTL_REMEMBER", 60 * 60 * 24 * 30);
define("LUMIERE_SA_LOGIN_WINDOW", 15 * 60);
define("LUMIERE_SA_LOGIN_MAX_ATTEMPTS", 8);

function lumiere_sa_platform_dir() {
    return dirname(__DIR__) . "/data/platform";
}

function lumiere_sa_permissions() {
    return array(
        "cafes.read",
        "cafes.write",
        "subscriptions.read",
        "subscriptions.write",
        "payments.read",
        "payments.refund",
        "plans.read",
        "plans.write",
        "analytics.read",
        "support.read",
        "support.write",
        "system.read",
        "audit.read",
        "notifications.write",
        "admin_users.read",
        "admin_users.write",
        "roles.write",
    );
}

function lumiere_sa_default_roles() {
    return array(
        array(
            "id" => "role_owner",
            "name" => "Owner",
            "description" => "Full platform access",
            "permissions" => array("*"),
            "isSystem" => true,
        ),
        array(
            "id" => "role_super_admin",
            "name" => "Super Admin",
            "description" => "Broad operational access",
            "permissions" => array(
                "cafes.read",
                "cafes.write",
                "subscriptions.read",
                "subscriptions.write",
                "payments.read",
                "payments.refund",
                "plans.read",
                "plans.write",
                "analytics.read",
                "support.read",
                "support.write",
                "system.read",
                "audit.read",
                "notifications.write",
                "admin_users.read",
            ),
            "isSystem" => true,
        ),
        array(
            "id" => "role_support",
            "name" => "Support",
            "description" => "Customer support",
            "permissions" => array(
                "cafes.read",
                "subscriptions.read",
                "support.read",
                "support.write",
                "notifications.write",
            ),
            "isSystem" => true,
        ),
        array(
            "id" => "role_finance",
            "name" => "Finance",
            "description" => "Billing and payments",
            "permissions" => array(
                "cafes.read",
                "subscriptions.read",
                "subscriptions.write",
                "payments.read",
                "payments.refund",
                "plans.read",
                "analytics.read",
                "audit.read",
            ),
            "isSystem" => true,
        ),
        array(
            "id" => "role_manager",
            "name" => "Manager",
            "description" => "Read-heavy operations",
            "permissions" => array(
                "cafes.read",
                "subscriptions.read",
                "payments.read",
                "plans.read",
                "analytics.read",
                "support.read",
                "audit.read",
            ),
            "isSystem" => true,
        ),
    );
}

function lumiere_sa_default_plans() {
    return array(
        array(
            "id" => "plan_basic",
            "name" => "پایه",
            "description" => "منوی دیجیتال و امکانات ضروری",
            "status" => "active",
            "displayOrder" => 1,
            "entitlements" => array(
                "maxUsers" => 3,
                "maxBranches" => 1,
                "maxMenuItems" => 100,
                "maxCategories" => 20,
                "maxOrdersPerMonth" => 1000,
                "maxCustomers" => 500,
                "storageMb" => 500,
                "digitalMenu" => true,
                "qrMenu" => true,
                "orderManagement" => true,
                "cashier" => true,
                "crm" => false,
                "paymentTerminal" => false,
                "advancedAnalytics" => false,
                "multipleUsers" => true,
                "multipleBranches" => false,
                "customBranding" => false,
                "customDomain" => false,
                "prioritySupport" => false,
            ),
            "prices" => array(
                "monthly" => 990000,
                "6months" => 5400000,
                "yearly" => 9900000,
            ),
        ),
        array(
            "id" => "plan_professional",
            "name" => "حرفه‌ای",
            "description" => "صندوق، باشگاه مشتریان و ابزار رشد",
            "status" => "active",
            "displayOrder" => 2,
            "entitlements" => array(
                "maxUsers" => 10,
                "maxBranches" => 3,
                "maxMenuItems" => 500,
                "maxCategories" => 50,
                "maxOrdersPerMonth" => 10000,
                "maxCustomers" => 5000,
                "storageMb" => 5000,
                "digitalMenu" => true,
                "qrMenu" => true,
                "orderManagement" => true,
                "cashier" => true,
                "crm" => true,
                "paymentTerminal" => true,
                "advancedAnalytics" => true,
                "multipleUsers" => true,
                "multipleBranches" => true,
                "customBranding" => true,
                "customDomain" => false,
                "prioritySupport" => false,
            ),
            "prices" => array(
                "monthly" => 2490000,
                "6months" => 13500000,
                "yearly" => 24900000,
            ),
        ),
        array(
            "id" => "plan_business",
            "name" => "کسب‌وکار",
            "description" => "چندشعبه‌ای و پشتیبانی اولویت‌دار",
            "status" => "active",
            "displayOrder" => 3,
            "entitlements" => array(
                "maxUsers" => 50,
                "maxBranches" => 20,
                "maxMenuItems" => 5000,
                "maxCategories" => 200,
                "maxOrdersPerMonth" => 100000,
                "maxCustomers" => 50000,
                "storageMb" => 50000,
                "digitalMenu" => true,
                "qrMenu" => true,
                "orderManagement" => true,
                "cashier" => true,
                "crm" => true,
                "paymentTerminal" => true,
                "advancedAnalytics" => true,
                "multipleUsers" => true,
                "multipleBranches" => true,
                "customBranding" => true,
                "customDomain" => true,
                "prioritySupport" => true,
            ),
            "prices" => array(
                "monthly" => 4990000,
                "6months" => 27000000,
                "yearly" => 49900000,
            ),
        ),
    );
}

function lumiere_sa_now() {
    return time();
}

function lumiere_sa_iso($ts = null) {
    if ($ts === null) $ts = lumiere_sa_now();
    return gmdate("Y-m-d\TH:i:s\Z", (int) $ts);
}

function lumiere_sa_new_id($prefix) {
    return $prefix . "_" . bin2hex(random_bytes(6));
}

function lumiere_sa_collection_path($name) {
    return lumiere_sa_platform_dir() . "/" . $name . ".json";
}

function lumiere_sa_read_json($path, $default) {
    if (!file_exists($path)) return $default;
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === "") return $default;
    $data = json_decode($raw, true);
    return $data !== null ? $data : $default;
}

function lumiere_sa_write_json($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $tmp = $path . ".tmp";
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $ok = @file_put_contents($tmp, $json, LOCK_EX);
    if ($ok === false) return false;
    return @rename($tmp, $path);
}

function lumiere_sa_load_collection($name, $default) {
    return lumiere_sa_read_json(lumiere_sa_collection_path($name), $default);
}

function lumiere_sa_save_collection($name, $data) {
    lumiere_sa_write_json(lumiere_sa_collection_path($name), $data);
}

function lumiere_sa_hash_password($password, $salt = null) {
    if ($salt === null || $salt === "") {
        $salt = bin2hex(random_bytes(16));
    }
    $digest = hash_pbkdf2("sha256", (string) $password, (string) $salt, 120000, 0, false);
    return "pbkdf2$" . $salt . "$" . $digest;
}

function lumiere_sa_verify_password($password, $stored) {
    $parts = explode("$", (string) $stored, 3);
    if (count($parts) !== 3) return false;
    list($algo, $salt, $hexdigest) = $parts;
    if ($algo !== "pbkdf2") return false;
    $digest = hash_pbkdf2("sha256", (string) $password, (string) $salt, 120000, 0, false);
    return hash_equals($hexdigest, $digest);
}

function lumiere_sa_generate_password() {
    return function_exists("lumiere_tenant_generate_password")
        ? lumiere_tenant_generate_password()
        : rtrim(strtr(base64_encode(random_bytes(10)), "+/", "-_"), "=");
}

function lumiere_sa_cafe_cashier_password_plain($cafe) {
    if (!is_array($cafe) || !isset($cafe["settings"]) || !is_array($cafe["settings"])) return "";
    return (string) (isset($cafe["settings"]["cashierPassword"]) ? $cafe["settings"]["cashierPassword"] : "");
}

function lumiere_sa_cafe_set_cashier_password(&$cafe, $password) {
    if (!isset($cafe["settings"]) || !is_array($cafe["settings"])) $cafe["settings"] = array();
    $cafe["settings"]["cashierPassword"] = (string) $password;
    if (!empty($cafe["id"])) {
        if (function_exists("lumiere_tenant_provision")) {
            lumiere_tenant_provision($cafe);
        }
        if (function_exists("lumiere_tenant_set_cashier_password")) {
            lumiere_tenant_set_cashier_password($cafe["id"], $password);
        }
    }
}

function lumiere_sa_cafe_for_admin($cafe) {
    if (!is_array($cafe)) return $cafe;
    $out = $cafe;
    if (isset($out["settings"]) && is_array($out["settings"])) {
        unset($out["settings"]["cashierPasswordHash"]);
    }
    if (!empty($out["id"]) && function_exists("lumiere_tenant_has_cashier_password")) {
        if (!isset($out["settings"]) || !is_array($out["settings"])) $out["settings"] = array();
        $out["settings"]["hasCashierPassword"] = lumiere_tenant_has_cashier_password($out["id"]);
        $out["cashierAuth"] = lumiere_tenant_cashier_auth_meta($out["id"]);
    }
    return $out;
}

function lumiere_sa_cafe_strip_secrets($cafe) {
    if (!is_array($cafe)) return $cafe;
    $out = $cafe;
    if (isset($out["settings"]) && is_array($out["settings"])) {
        unset($out["settings"]["cashierPasswordHash"], $out["settings"]["cashierPassword"]);
    }
    return $out;
}

function lumiere_sa_secret_vars() {
    $out = array();
    $secretFile = dirname(__DIR__) . "/data/secret.php";
    if (is_file($secretFile)) {
        $SUPER_ADMIN_EMAIL = null;
        $SUPER_ADMIN_PASSWORD = null;
        $SUPER_ADMIN_NAME = null;
        include $secretFile;
        if (isset($SUPER_ADMIN_EMAIL) && (string) $SUPER_ADMIN_EMAIL !== "") {
            $out["SUPER_ADMIN_EMAIL"] = (string) $SUPER_ADMIN_EMAIL;
        }
        if (isset($SUPER_ADMIN_PASSWORD) && (string) $SUPER_ADMIN_PASSWORD !== "") {
            $out["SUPER_ADMIN_PASSWORD"] = (string) $SUPER_ADMIN_PASSWORD;
        }
        if (isset($SUPER_ADMIN_NAME) && (string) $SUPER_ADMIN_NAME !== "") {
            $out["SUPER_ADMIN_NAME"] = (string) $SUPER_ADMIN_NAME;
        }
    }
    return $out;
}

function lumiere_sa_ensure_platform() {
    $dir = lumiere_sa_platform_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $roles = lumiere_sa_load_collection("roles", null);
    if (!is_array($roles) || !$roles) {
        lumiere_sa_save_collection("roles", lumiere_sa_default_roles());
    }

    $admins = lumiere_sa_load_collection("admins", null);
    if (!is_array($admins) || !$admins) {
        $secrets = lumiere_sa_secret_vars();
        $email = isset($secrets["SUPER_ADMIN_EMAIL"]) ? $secrets["SUPER_ADMIN_EMAIL"] : getenv("SUPER_ADMIN_EMAIL");
        if ($email === false || $email === "") $email = "owner@miiziito.local";
        $email = strtolower(trim((string) $email));
        $password = isset($secrets["SUPER_ADMIN_PASSWORD"]) ? $secrets["SUPER_ADMIN_PASSWORD"] : getenv("SUPER_ADMIN_PASSWORD");
        if ($password === false || $password === "") $password = "MiiziitoOwner#2026";
        $name = isset($secrets["SUPER_ADMIN_NAME"]) ? $secrets["SUPER_ADMIN_NAME"] : "Platform Owner";
        $admins = array(
            array(
                "id" => "admin_owner",
                "email" => $email,
                "username" => "owner",
                "passwordHash" => lumiere_sa_hash_password($password),
                "name" => $name,
                "roleId" => "role_owner",
                "status" => "active",
                "createdAt" => lumiere_sa_iso(),
                "updatedAt" => lumiere_sa_iso(),
                "lastLoginAt" => null,
            ),
        );
        lumiere_sa_save_collection("admins", $admins);
    }

    $defaults = array(
        "sessions" => new stdClass(),
        "cafes" => array(),
        "cafe_owners" => array(),
        "recharge_requests" => array(),
        "plans" => array(),
        "subscriptions" => array(),
        "saas_payments" => array(),
        "coupons" => array(),
        "notifications" => array(),
        "support_tickets" => array(),
        "audit_logs" => array(),
        "login_attempts" => array(),
        "impersonations" => array(),
        "settings" => array(
            "trialDays" => 14,
            "reminderDays" => array(30, 7, 3, 1),
            "gracePeriodDays" => 3,
            "currency" => "IRT",
            "supportPhone" => "",
            "supportNote" => "پس از ثبت درخواست، شماره کارت برای واریز ارسال می‌شود. پس از پرداخت، دکمه «پرداخت کردم» را بزنید.",
            "paymentCardNumber" => "",
            "paymentCardHolder" => "",
            "paymentInstructions" => "مبلغ را کارت‌به‌کارت کنید و در مرحله بعد اطلاعات واریز را ثبت کنید.",
        ),
    );
    foreach ($defaults as $name => $default) {
        $path = lumiere_sa_collection_path($name);
        if (!file_exists($path)) {
            if ($name === "sessions") {
                lumiere_sa_save_collection($name, array());
            } else {
                lumiere_sa_save_collection($name, $default);
            }
        }
    }

    $plans = lumiere_sa_load_collection("plans", array());
    if (is_array($plans) && !$plans) {
        $seeded = array();
        foreach (lumiere_sa_default_plans() as $p) {
            $plan = $p;
            $plan["createdAt"] = lumiere_sa_iso();
            $plan["updatedAt"] = lumiere_sa_iso();
            $seeded[] = $plan;
        }
        lumiere_sa_save_collection("plans", $seeded);
    } elseif (is_array($plans)) {
        // One-time Farsi labels for seeded English plan names
        $rename = array(
            "Basic" => array("پایه", "منوی دیجیتال و امکانات ضروری"),
            "Professional" => array("حرفه‌ای", "صندوق، باشگاه مشتریان و ابزار رشد"),
            "Business" => array("کسب‌وکار", "چندشعبه‌ای و پشتیبانی اولویت‌دار"),
        );
        $changed = false;
        foreach ($plans as $i => $p) {
            if (!is_array($p)) continue;
            $key = (string) (isset($p["name"]) ? $p["name"] : "");
            if (isset($rename[$key])) {
                $plans[$i]["name"] = $rename[$key][0];
                $plans[$i]["description"] = $rename[$key][1];
                $plans[$i]["updatedAt"] = lumiere_sa_iso();
                $changed = true;
            }
        }
        if ($changed) {
            lumiere_sa_save_collection("plans", $plans);
        }
    }
}

function lumiere_sa_header_get($headers, $name) {
    if (!is_array($headers)) $headers = array();
    if (isset($headers[$name]) && $headers[$name] !== "") return (string) $headers[$name];
    $lower = strtolower($name);
    foreach ($headers as $k => $v) {
        if (strtolower((string) $k) === $lower && $v !== "") return (string) $v;
    }
    $serverKey = "HTTP_" . strtoupper(str_replace("-", "_", $name));
    if (!empty($_SERVER[$serverKey])) return (string) $_SERVER[$serverKey];
    if ($name === "Remote-Addr" && !empty($_SERVER["REMOTE_ADDR"])) {
        return (string) $_SERVER["REMOTE_ADDR"];
    }
    return "";
}

function lumiere_sa_client_ip($headers) {
    foreach (array("X-Forwarded-For", "X-Real-IP", "Remote-Addr") as $key) {
        $val = lumiere_sa_header_get($headers, $key);
        if ($val !== "") {
            $parts = explode(",", $val);
            return substr(trim($parts[0]), 0, 120);
        }
    }
    return "";
}

function lumiere_sa_audit($admin, $action, $targetType = "", $targetId = "", $ip = "", $metadata = null) {
    $logs = lumiere_sa_load_collection("audit_logs", array());
    if (!is_array($logs)) $logs = array();
    $logs[] = array(
        "id" => lumiere_sa_new_id("aud"),
        "adminId" => is_array($admin) && isset($admin["id"]) ? $admin["id"] : null,
        "adminEmail" => is_array($admin) && isset($admin["email"]) ? $admin["email"] : null,
        "action" => $action,
        "targetType" => $targetType,
        "targetId" => $targetId,
        "ip" => $ip,
        "metadata" => is_array($metadata) ? $metadata : array(),
        "createdAt" => lumiere_sa_iso(),
    );
    if (count($logs) > 20000) {
        $logs = array_slice($logs, -20000);
    }
    lumiere_sa_save_collection("audit_logs", $logs);
}

function lumiere_sa_role_for($admin) {
    $roles = lumiere_sa_load_collection("roles", array());
    if (!is_array($roles) || !is_array($admin)) return null;
    $roleId = isset($admin["roleId"]) ? $admin["roleId"] : "";
    foreach ($roles as $r) {
        if (is_array($r) && isset($r["id"]) && $r["id"] === $roleId) return $r;
    }
    return null;
}

function lumiere_sa_has_permission($admin, $permission) {
    $role = lumiere_sa_role_for($admin);
    if (!$role) return false;
    $perms = isset($role["permissions"]) && is_array($role["permissions"]) ? $role["permissions"] : array();
    if (in_array("*", $perms, true)) return true;
    return in_array($permission, $perms, true);
}

function lumiere_sa_get_token($headers, $body = null) {
    if (!is_array($body)) $body = array();
    $token = lumiere_sa_header_get($headers, "X-Super-Admin-Token");
    if ($token === "") {
        $auth = lumiere_sa_header_get($headers, "Authorization");
        if (stripos($auth, "Bearer ") === 0) {
            $token = trim(substr($auth, 7));
        }
    }
    if ($token === "" && !empty($body["token"])) {
        $token = (string) $body["token"];
    }
    return $token;
}

function lumiere_sa_session_record($token) {
    if ($token === "") return null;
    $sessions = lumiere_sa_load_collection("sessions", array());
    if (!is_array($sessions)) return null;
    if (!isset($sessions[$token]) || !is_array($sessions[$token])) return null;
    $rec = $sessions[$token];
    if (intval(isset($rec["expiresAt"]) ? $rec["expiresAt"] : 0) < lumiere_sa_now()) {
        unset($sessions[$token]);
        lumiere_sa_save_collection("sessions", $sessions);
        return null;
    }
    return $rec;
}

function lumiere_sa_session_admin($token) {
    $rec = lumiere_sa_session_record($token);
    if (!$rec || empty($rec["adminId"])) return null;
    if (isset($rec["kind"]) && $rec["kind"] === "cafe") return null;
    $admins = lumiere_sa_load_collection("admins", array());
    $adminId = $rec["adminId"];
    if (!is_array($admins)) return null;
    foreach ($admins as $a) {
        if (is_array($a) && isset($a["id"]) && $a["id"] === $adminId && isset($a["status"]) && $a["status"] === "active") {
            return $a;
        }
    }
    return null;
}

function lumiere_sa_session_cafe_owner($token) {
    $rec = lumiere_sa_session_record($token);
    if (!$rec || !isset($rec["kind"]) || $rec["kind"] !== "cafe") return null;
    $owners = lumiere_sa_load_collection("cafe_owners", array());
    $ownerId = isset($rec["cafeOwnerId"]) ? $rec["cafeOwnerId"] : "";
    if (!is_array($owners)) return null;
    foreach ($owners as $o) {
        if (is_array($o) && isset($o["id"]) && $o["id"] === $ownerId && isset($o["status"]) && $o["status"] === "active") {
            return $o;
        }
    }
    return null;
}

function lumiere_sa_require_admin($headers, $body = null, $permission = null) {
    lumiere_sa_ensure_platform();
    $token = lumiere_sa_get_token($headers, $body);
    $admin = lumiere_sa_session_admin($token);
    if (!$admin) {
        return array(null, array("status" => 401, "body" => array("error" => "auth_required")));
    }
    if ($permission !== null && $permission !== "" && !lumiere_sa_has_permission($admin, $permission)) {
        return array(null, array("status" => 403, "body" => array("error" => "forbidden")));
    }
    return array($admin, null);
}

function lumiere_sa_require_cafe($headers, $body = null) {
    lumiere_sa_ensure_platform();
    $token = lumiere_sa_get_token($headers, $body);
    $owner = lumiere_sa_session_cafe_owner($token);
    if (!$owner) {
        return array(null, array("status" => 401, "body" => array("error" => "auth_required")));
    }
    return array($owner, null);
}

function lumiere_sa_public_cafe_owner($owner) {
    if (!is_array($owner)) $owner = array();
    return array(
        "id" => isset($owner["id"]) ? $owner["id"] : null,
        "email" => isset($owner["email"]) ? $owner["email"] : null,
        "name" => isset($owner["name"]) ? $owner["name"] : null,
        "phone" => isset($owner["phone"]) ? $owner["phone"] : null,
        "tenantId" => isset($owner["tenantId"]) ? $owner["tenantId"] : null,
        "status" => isset($owner["status"]) ? $owner["status"] : null,
        "lastLoginAt" => isset($owner["lastLoginAt"]) ? $owner["lastLoginAt"] : null,
    );
}

function lumiere_sa_find_cafe($tenantId) {
    $cafes = lumiere_sa_load_collection("cafes", array());
    if (!is_array($cafes)) return null;
    foreach ($cafes as $c) {
        if (is_array($c) && isset($c["id"]) && $c["id"] === $tenantId) return $c;
    }
    return null;
}

function lumiere_sa_cafe_tickets_for_owner($owner) {
    $tickets = lumiere_sa_load_collection("support_tickets", array());
    if (!is_array($tickets)) $tickets = array();
    $ownerTenant = isset($owner["tenantId"]) ? $owner["tenantId"] : null;
    $mine = array();
    foreach ($tickets as $t) {
        if (!is_array($t)) continue;
        if (isset($t["tenantId"]) && $t["tenantId"] === $ownerTenant) {
            $mine[] = $t;
        }
    }
    usort($mine, function ($a, $b) {
        $av = isset($a["createdAt"]) ? $a["createdAt"] : "";
        $bv = isset($b["createdAt"]) ? $b["createdAt"] : "";
        return strcmp((string) $bv, (string) $av);
    });
    return $mine;
}

function lumiere_sa_cafe_ticket_owned($ticket, $owner) {
    if (!is_array($ticket)) return false;
    $ownerTenant = isset($owner["tenantId"]) ? $owner["tenantId"] : null;
    return isset($ticket["tenantId"]) && $ticket["tenantId"] === $ownerTenant;
}

function lumiere_sa_cafe_portal_payload($owner) {
    $tenantId = (string) (isset($owner["tenantId"]) ? $owner["tenantId"] : "");
    $cafe = lumiere_sa_find_cafe($tenantId);
    $plans = lumiere_sa_load_collection("plans", array());
    if (!is_array($plans)) $plans = array();
    $planMap = array();
    foreach ($plans as $p) {
        if (is_array($p) && isset($p["id"])) $planMap[$p["id"]] = $p;
    }
    $subs = lumiere_sa_load_collection("subscriptions", array());
    if (!is_array($subs)) $subs = array();
    $tenantSubs = array();
    foreach ($subs as $s) {
        if (is_array($s) && isset($s["tenantId"]) && $s["tenantId"] === (isset($owner["tenantId"]) ? $owner["tenantId"] : null)) {
            $tenantSubs[] = $s;
        }
    }
    usort($tenantSubs, function ($a, $b) {
        $av = isset($a["createdAt"]) ? $a["createdAt"] : "";
        $bv = isset($b["createdAt"]) ? $b["createdAt"] : "";
        return strcmp((string) $bv, (string) $av);
    });
    $current = null;
    foreach ($tenantSubs as $s) {
        $st = isset($s["status"]) ? $s["status"] : "";
        if (in_array($st, array("trial", "active", "past_due", "grace_period"), true)) {
            $current = $s;
            break;
        }
    }
    if (!$current && $tenantSubs) $current = $tenantSubs[0];

    $requests = lumiere_sa_load_collection("recharge_requests", array());
    if (!is_array($requests)) $requests = array();
    $myReqs = array();
    $ownerId = isset($owner["id"]) ? $owner["id"] : null;
    $ownerTenant = isset($owner["tenantId"]) ? $owner["tenantId"] : null;
    foreach ($requests as $r) {
        if (!is_array($r)) continue;
        if (
            (isset($r["tenantId"]) && $r["tenantId"] === $ownerTenant)
            || (isset($r["cafeOwnerId"]) && $r["cafeOwnerId"] === $ownerId)
        ) {
            $myReqs[] = $r;
        }
    }
    usort($myReqs, function ($a, $b) {
        $av = isset($a["createdAt"]) ? $a["createdAt"] : "";
        $bv = isset($b["createdAt"]) ? $b["createdAt"] : "";
        return strcmp((string) $bv, (string) $av);
    });

    $currentPlan = null;
    if ($current && isset($current["planId"]) && isset($planMap[$current["planId"]])) {
        $currentPlan = $planMap[$current["planId"]];
    }
    if (!$currentPlan && $cafe && isset($cafe["planId"]) && isset($planMap[$cafe["planId"]])) {
        $currentPlan = $planMap[$cafe["planId"]];
    }

    $activePlans = array();
    foreach ($plans as $p) {
        if (is_array($p) && isset($p["status"]) && $p["status"] === "active") $activePlans[] = $p;
    }

    $settings = lumiere_sa_load_collection("settings", array());
    if (!is_array($settings)) $settings = array();

    $myTickets = lumiere_sa_cafe_tickets_for_owner($owner);
    $ticketSummaries = array();
    foreach (array_slice($myTickets, 0, 20) as $t) {
        $ticketSummaries[] = array(
            "id" => isset($t["id"]) ? $t["id"] : "",
            "subject" => isset($t["subject"]) ? $t["subject"] : "",
            "status" => isset($t["status"]) ? $t["status"] : "open",
            "priority" => isset($t["priority"]) ? $t["priority"] : "normal",
            "createdAt" => isset($t["createdAt"]) ? $t["createdAt"] : "",
            "lastReplyAt" => isset($t["lastReplyAt"]) ? $t["lastReplyAt"] : null,
        );
    }

    return array(
        "owner" => lumiere_sa_public_cafe_owner($owner),
        "cafe" => $cafe,
        "subscription" => $current,
        "plan" => $currentPlan,
        "history" => array_slice($tenantSubs, 0, 20),
        "requests" => array_slice($myReqs, 0, 20),
        "plans" => $activePlans,
        "paymentInstructions" => isset($settings["paymentInstructions"]) ? (string) $settings["paymentInstructions"] : "",
        "supportPhone" => isset($settings["supportPhone"]) ? (string) $settings["supportPhone"] : "",
        "tickets" => $ticketSummaries,
    );
}

function lumiere_sa_subscription_for_cafe($cafe, $subs) {
    if (!is_array($cafe) || !is_array($subs)) return null;
    $subId = isset($cafe["subscriptionId"]) ? (string) $cafe["subscriptionId"] : "";
    $tenantId = isset($cafe["id"]) ? (string) $cafe["id"] : "";
    $fallback = null;
    foreach ($subs as $s) {
        if (!is_array($s)) continue;
        if ($subId !== "" && isset($s["id"]) && (string) $s["id"] === $subId) {
            return $s;
        }
        if ($tenantId !== "" && isset($s["tenantId"]) && (string) $s["tenantId"] === $tenantId) {
            $st = isset($s["status"]) ? (string) $s["status"] : "";
            if ($st !== "cancelled" && $st !== "expired") {
                return $s;
            }
            if ($fallback === null) $fallback = $s;
        }
    }
    return $fallback;
}

function lumiere_sa_subscription_index($subs, $subId) {
    if (!is_array($subs)) return -1;
    foreach ($subs as $i => $s) {
        if (is_array($s) && isset($s["id"]) && (string) $s["id"] === (string) $subId) {
            return $i;
        }
    }
    return -1;
}

function lumiere_sa_sync_cafe_subscription_status($sub, $cafeStatus) {
    if (!is_array($sub)) return;
    $subs = lumiere_sa_load_collection("subscriptions", array());
    $idx = lumiere_sa_subscription_index(is_array($subs) ? $subs : array(), isset($sub["id"]) ? $sub["id"] : "");
    if ($idx < 0) return;
    $cafes = lumiere_sa_load_collection("cafes", array());
    if (!is_array($cafes)) return;
    $tenantId = isset($sub["tenantId"]) ? (string) $sub["tenantId"] : "";
    $subId = isset($sub["id"]) ? (string) $sub["id"] : "";
    foreach ($cafes as $i => $c) {
        if (!is_array($c)) continue;
        $match = ($tenantId !== "" && isset($c["id"]) && (string) $c["id"] === $tenantId)
            || ($subId !== "" && isset($c["subscriptionId"]) && (string) $c["subscriptionId"] === $subId);
        if (!$match) continue;
        $cafes[$i]["status"] = $cafeStatus;
        $cafes[$i]["updatedAt"] = lumiere_sa_iso();
        lumiere_sa_save_collection("cafes", $cafes);
        break;
    }
}

function lumiere_sa_rate_limited($email, $ip) {
    $attempts = lumiere_sa_load_collection("login_attempts", array());
    if (!is_array($attempts)) return false;
    $cutoff = lumiere_sa_now() - LUMIERE_SA_LOGIN_WINDOW;
    $recent = 0;
    foreach ($attempts as $a) {
        if (!is_array($a)) continue;
        $match = (isset($a["email"]) && $a["email"] === $email) || (isset($a["ip"]) && $a["ip"] === $ip);
        if (!$match) continue;
        if (intval(isset($a["createdAtTs"]) ? $a["createdAtTs"] : 0) < $cutoff) continue;
        if (!empty($a["success"])) continue;
        $recent++;
    }
    return $recent >= LUMIERE_SA_LOGIN_MAX_ATTEMPTS;
}

function lumiere_sa_record_attempt($email, $ip, $success) {
    $attempts = lumiere_sa_load_collection("login_attempts", array());
    if (!is_array($attempts)) $attempts = array();
    $attempts[] = array(
        "email" => $email,
        "ip" => $ip,
        "success" => !!$success,
        "createdAt" => lumiere_sa_iso(),
        "createdAtTs" => lumiere_sa_now(),
    );
    if (count($attempts) > 5000) {
        $attempts = array_slice($attempts, -5000);
    }
    lumiere_sa_save_collection("login_attempts", $attempts);
}

function lumiere_sa_public_admin($admin) {
    $role = lumiere_sa_role_for($admin);
    if (!is_array($role)) $role = array();
    return array(
        "id" => isset($admin["id"]) ? $admin["id"] : null,
        "email" => isset($admin["email"]) ? $admin["email"] : null,
        "username" => isset($admin["username"]) ? $admin["username"] : null,
        "name" => isset($admin["name"]) ? $admin["name"] : null,
        "roleId" => isset($admin["roleId"]) ? $admin["roleId"] : null,
        "roleName" => isset($role["name"]) ? $role["name"] : null,
        "permissions" => isset($role["permissions"]) && is_array($role["permissions"]) ? $role["permissions"] : array(),
        "status" => isset($admin["status"]) ? $admin["status"] : null,
        "lastLoginAt" => isset($admin["lastLoginAt"]) ? $admin["lastLoginAt"] : null,
    );
}

function lumiere_sa_pct_change($current, $previous) {
    $current = floatval($current);
    $previous = floatval($previous);
    if ($previous == 0.0) {
        if ($current > 0) return 100.0;
        if ($current == 0.0) return 0.0;
        return null;
    }
    return round((($current - $previous) / abs($previous)) * 100, 1);
}

function lumiere_sa_support_ticket_meta($ticket) {
    if (!is_array($ticket)) {
        return array(
            "needsAdminReply" => false,
            "isNew" => false,
            "lastMessageFrom" => null,
            "attentionRank" => 0,
        );
    }
    $messages = isset($ticket["messages"]) && is_array($ticket["messages"]) ? $ticket["messages"] : array();
    $lastFrom = null;
    $lastCafeMsgAt = null;
    $hasAdminMsg = false;
    foreach ($messages as $m) {
        if (!is_array($m)) continue;
        if (isset($m["from"]) && $m["from"] === "admin") $hasAdminMsg = true;
        if (isset($m["from"]) && $m["from"] === "cafe") {
            $lastCafeMsgAt = isset($m["createdAt"]) ? (string) $m["createdAt"] : $lastCafeMsgAt;
        }
    }
    if (count($messages) > 0) {
        $last = $messages[count($messages) - 1];
        $lastFrom = is_array($last) && isset($last["from"]) ? $last["from"] : null;
    }
    $status = isset($ticket["status"]) ? (string) $ticket["status"] : "open";
    $active = in_array($status, array("open", "in_progress"), true);
    $needsAdminReply = $active && ($lastFrom === "cafe" || ($lastFrom === null && !$hasAdminMsg));

    // "New" until an admin opens the ticket; becomes new again if cafe sends after that.
    $adminReadAt = isset($ticket["adminReadAt"]) ? (string) $ticket["adminReadAt"] : "";
    $unreadSinceOpen = $adminReadAt === "";
    if (!$unreadSinceOpen && $lastCafeMsgAt) {
        $readTs = strtotime($adminReadAt);
        $cafeTs = strtotime($lastCafeMsgAt);
        if ($readTs && $cafeTs && $cafeTs > $readTs) $unreadSinceOpen = true;
    }
    $isNew = $needsAdminReply && $unreadSinceOpen;
    $attentionRank = $isNew ? 2 : ($needsAdminReply ? 1 : 0);
    return array(
        "needsAdminReply" => $needsAdminReply,
        "isNew" => $isNew,
        "lastMessageFrom" => $lastFrom,
        "attentionRank" => $attentionRank,
    );
}

function lumiere_sa_enrich_support_tickets($tickets) {
    if (!is_array($tickets)) return array();
    $out = array();
    foreach ($tickets as $t) {
        if (!is_array($t)) continue;
        $out[] = array_merge($t, lumiere_sa_support_ticket_meta($t));
    }
    usort($out, function ($a, $b) {
        $ar = intval(isset($a["attentionRank"]) ? $a["attentionRank"] : 0);
        $br = intval(isset($b["attentionRank"]) ? $b["attentionRank"] : 0);
        if ($ar !== $br) return $br - $ar;
        $av = isset($a["createdAt"]) ? $a["createdAt"] : "";
        $bv = isset($b["createdAt"]) ? $b["createdAt"] : "";
        return strcmp((string) $bv, (string) $av);
    });
    return $out;
}

function lumiere_sa_qs_get($key, $default = "") {
    if (!isset($_GET[$key])) return $default;
    $v = $_GET[$key];
    if (is_array($v)) return isset($v[0]) ? (string) $v[0] : $default;
    return (string) $v;
}

function lumiere_sa_filter_page($items, $searchFields) {
    $q = strtolower(trim(lumiere_sa_qs_get("q", "")));
    $status = strtolower(trim(lumiere_sa_qs_get("status", "")));
    $sort = trim(lumiere_sa_qs_get("sort", "createdAt"));
    if ($sort === "") $sort = "createdAt";
    $order = strtolower(trim(lumiere_sa_qs_get("order", "desc")));
    $page = intval(lumiere_sa_qs_get("page", "1"));
    if ($page < 1) $page = 1;
    $pageSize = intval(lumiere_sa_qs_get("pageSize", "20"));
    if ($pageSize < 1) $pageSize = 20;
    if ($pageSize > 100) $pageSize = 100;

    $filtered = array();
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        if ($status !== "") {
            if ($status === "needs_reply") {
                if (empty($item["needsAdminReply"])) continue;
            } elseif (strtolower((string) (isset($item["status"]) ? $item["status"] : "")) !== $status) {
                continue;
            }
        }
        if ($q !== "") {
            $match = false;
            foreach ($searchFields as $f) {
                if (strpos(strtolower((string) (isset($item[$f]) ? $item[$f] : "")), $q) !== false) {
                    $match = true;
                    break;
                }
            }
            if (!$match) continue;
        }
        $filtered[] = $item;
    }

    usort($filtered, function ($a, $b) use ($sort, $order) {
        $av = isset($a[$sort]) ? $a[$sort] : "";
        $bv = isset($b[$sort]) ? $b[$sort] : "";
        if ($av == $bv) return 0;
        $cmp = ($av < $bv) ? -1 : 1;
        return ($order === "asc") ? $cmp : -$cmp;
    });

    $total = count($filtered);
    $start = ($page - 1) * $pageSize;
    $slice = array_slice($filtered, $start, $pageSize);
    return array(
        "items" => array_values($slice),
        "page" => $page,
        "pageSize" => $pageSize,
        "total" => $total,
        "totalPages" => max(1, (int) ceil($total / $pageSize)),
    );
}

function lumiere_sa_created_ts($item) {
    if (!is_array($item)) return 0;
    $raw = isset($item["createdAt"]) ? (string) $item["createdAt"] : "";
    $raw = substr($raw, 0, 19);
    if ($raw === "") return 0;
    $ts = strtotime($raw . " UTC");
    return $ts === false ? 0 : (int) $ts;
}

function lumiere_sa_parse_ts($value) {
    $raw = substr((string) $value, 0, 19);
    if ($raw === "") return false;
    $ts = strtotime($raw . " UTC");
    return $ts === false ? false : (int) $ts;
}

function lumiere_sa_dashboard_kpis() {
    $cafes = lumiere_sa_load_collection("cafes", array());
    $subs = lumiere_sa_load_collection("subscriptions", array());
    $payments = lumiere_sa_load_collection("saas_payments", array());
    if (!is_array($cafes)) $cafes = array();
    if (!is_array($subs)) $subs = array();
    if (!is_array($payments)) $payments = array();

    $countStatus = function ($status) use ($cafes) {
        $n = 0;
        foreach ($cafes as $c) {
            if (is_array($c) && isset($c["status"]) && $c["status"] === $status) $n++;
        }
        return $n;
    };

    $now = lumiere_sa_now();
    $monthAgo = $now - 30 * 86400;
    $prevMonthStart = $now - 60 * 86400;

    $newCustomers = 0;
    $prevNew = 0;
    foreach ($cafes as $c) {
        $ts = lumiere_sa_created_ts($c);
        if ($ts >= $monthAgo) $newCustomers++;
        if ($ts >= $prevMonthStart && $ts < $monthAgo) $prevNew++;
    }

    $activeSubs = array();
    foreach ($subs as $s) {
        if (is_array($s) && isset($s["status"]) && $s["status"] === "active") $activeSubs[] = $s;
    }

    $mrr = 0;
    foreach ($activeSubs as $s) {
        $price = intval(isset($s["price"]) ? $s["price"] : 0);
        $cycle = isset($s["billingCycle"]) ? $s["billingCycle"] : "monthly";
        if ($cycle === "yearly") $mrr += intdiv($price, 12);
        elseif ($cycle === "6months") $mrr += intdiv($price, 6);
        else $mrr += $price;
    }

    $cancelledRecent = 0;
    foreach ($subs as $s) {
        if (!is_array($s)) continue;
        if (isset($s["status"]) && $s["status"] === "cancelled" && lumiere_sa_created_ts($s) >= $monthAgo) {
            $cancelledRecent++;
        }
    }
    $churnDenom = max(count($activeSubs) + $cancelledRecent, 1);
    $churnRate = round(($cancelledRecent / $churnDenom) * 100, 1);

    $rev = 0;
    $prevRev = 0;
    foreach ($payments as $p) {
        if (!is_array($p) || !isset($p["status"]) || $p["status"] !== "successful") continue;
        $ts = lumiere_sa_created_ts($p);
        $amount = intval(isset($p["amount"]) ? $p["amount"] : 0);
        if ($ts >= $monthAgo) $rev += $amount;
        if ($ts >= $prevMonthStart && $ts < $monthAgo) $prevRev += $amount;
    }

    $expired = 0;
    foreach ($subs as $s) {
        if (!is_array($s)) continue;
        $st = isset($s["status"]) ? $s["status"] : "";
        if ($st === "expired" || $st === "past_due") $expired++;
    }

    $expiring = array();
    foreach ($activeSubs as $s) {
        if (!isset($s["endDate"]) || !$s["endDate"]) continue;
        $endTs = lumiere_sa_parse_ts($s["endDate"]);
        if ($endTs === false) continue;
        $delta = $endTs - $now;
        if ($delta >= 0 && $delta <= 14 * 86400) $expiring[] = $s;
    }

    $planCounts = array();
    foreach ($activeSubs as $s) {
        $pid = (string) (isset($s["planId"]) ? $s["planId"] : "");
        if (!isset($planCounts[$pid])) $planCounts[$pid] = 0;
        $planCounts[$pid]++;
    }
    $popularPlans = array();
    foreach ($planCounts as $k => $v) {
        $popularPlans[] = array("planId" => $k, "count" => $v);
    }
    usort($popularPlans, function ($a, $b) {
        return $b["count"] - $a["count"];
    });
    $popularPlans = array_slice($popularPlans, 0, 5);

    $recentPayments = $payments;
    usort($recentPayments, function ($a, $b) {
        $av = is_array($a) && isset($a["createdAt"]) ? $a["createdAt"] : "";
        $bv = is_array($b) && isset($b["createdAt"]) ? $b["createdAt"] : "";
        return strcmp((string) $bv, (string) $av);
    });
    $recentPayments = array_slice($recentPayments, 0, 8);

    return array(
        "kpis" => array(
            "totalCafes" => array(
                "value" => count($cafes),
                "change" => lumiere_sa_pct_change(count($cafes), max(count($cafes) - $newCustomers, 0)),
            ),
            "activeCafes" => array("value" => $countStatus("active"), "change" => null),
            "trialCafes" => array("value" => $countStatus("trial"), "change" => null),
            "suspendedCafes" => array("value" => $countStatus("suspended"), "change" => null),
            "expiredSubscriptions" => array("value" => $expired, "change" => null),
            "mrr" => array(
                "value" => $mrr,
                "change" => lumiere_sa_pct_change($mrr, max($mrr - ($rev ? intdiv($rev, 30) : 0), 0)),
            ),
            "arr" => array("value" => $mrr * 12, "change" => null),
            "newCustomers" => array(
                "value" => $newCustomers,
                "change" => lumiere_sa_pct_change($newCustomers, $prevNew),
            ),
            "churnRate" => array("value" => $churnRate, "change" => null),
            "revenue30d" => array(
                "value" => $rev,
                "change" => lumiere_sa_pct_change($rev, $prevRev),
            ),
        ),
        "expiringSoon" => array_slice($expiring, 0, 10),
        "popularPlans" => $popularPlans,
        "recentPayments" => array_values($recentPayments),
    );
}

/**
 * Main entry: returns array('status'=>int, 'body'=>array) or null if not an sa- route.
 */
function lumiere_super_admin_handle($method, $route, $id, $body, $headers) {
    $route = (string) $route;
    if (strpos($route, "sa-") !== 0) return null;

    if (!is_array($body)) $body = array();
    if (!is_array($headers)) $headers = array();
    $method = strtoupper((string) $method);
    $itemId = (string) $id;

    lumiere_sa_ensure_platform();
    $ip = lumiere_sa_client_ip($headers);

    // ── Auth (admin + cafe owner) ─────────────────────────
    if ($route === "sa-login" && $method === "POST") {
        $email = strtolower(trim((string) (isset($body["email"]) ? $body["email"] : (isset($body["username"]) ? $body["username"] : ""))));
        $password = (string) (isset($body["password"]) ? $body["password"] : "");
        $remember = !empty($body["remember"]);
        if ($email === "" || $password === "") {
            return array("status" => 400, "body" => array("error" => "missing_credentials"));
        }
        if (lumiere_sa_rate_limited($email, $ip)) {
            return array("status" => 429, "body" => array("error" => "too_many_attempts"));
        }

        // Try super admin first
        $admins = lumiere_sa_load_collection("admins", array());
        $admin = null;
        if (is_array($admins)) {
            foreach ($admins as $a) {
                if (!is_array($a)) continue;
                $aEmail = strtolower((string) (isset($a["email"]) ? $a["email"] : ""));
                $aUser = strtolower((string) (isset($a["username"]) ? $a["username"] : ""));
                if ($aEmail === $email || $aUser === $email) {
                    $admin = $a;
                    break;
                }
            }
        }
        if (
            $admin
            && isset($admin["status"])
            && $admin["status"] === "active"
            && lumiere_sa_verify_password($password, (string) (isset($admin["passwordHash"]) ? $admin["passwordHash"] : ""))
        ) {
            lumiere_sa_record_attempt($email, $ip, true);
            $token = bin2hex(random_bytes(32));
            $ttl = $remember ? LUMIERE_SA_SESSION_TTL_REMEMBER : LUMIERE_SA_SESSION_TTL;
            $sessions = lumiere_sa_load_collection("sessions", array());
            if (!is_array($sessions)) $sessions = array();
            $sessions[$token] = array(
                "kind" => "admin",
                "adminId" => $admin["id"],
                "createdAt" => lumiere_sa_now(),
                "expiresAt" => lumiere_sa_now() + $ttl,
                "remember" => $remember,
                "ip" => $ip,
            );
            lumiere_sa_save_collection("sessions", $sessions);
            $admin["lastLoginAt"] = lumiere_sa_iso();
            $admin["updatedAt"] = lumiere_sa_iso();
            if (is_array($admins)) {
                foreach ($admins as $i => $a) {
                    if (is_array($a) && isset($a["id"]) && $a["id"] === $admin["id"]) {
                        $admins[$i] = $admin;
                        break;
                    }
                }
                lumiere_sa_save_collection("admins", $admins);
            }
            lumiere_sa_audit($admin, "login", "admin", $admin["id"], $ip);
            return array(
                "status" => 200,
                "body" => array(
                    "token" => $token,
                    "expiresIn" => $ttl,
                    "kind" => "admin",
                    "admin" => lumiere_sa_public_admin($admin),
                ),
            );
        }

        // Then cafe owner
        $owners = lumiere_sa_load_collection("cafe_owners", array());
        $owner = null;
        if (is_array($owners)) {
            foreach ($owners as $o) {
                if (!is_array($o)) continue;
                if (strtolower((string) (isset($o["email"]) ? $o["email"] : "")) === $email) {
                    $owner = $o;
                    break;
                }
            }
        }
        if (
            $owner
            && isset($owner["status"])
            && $owner["status"] === "active"
            && lumiere_sa_verify_password($password, (string) (isset($owner["passwordHash"]) ? $owner["passwordHash"] : ""))
        ) {
            lumiere_sa_record_attempt($email, $ip, true);
            $token = bin2hex(random_bytes(32));
            $ttl = $remember ? LUMIERE_SA_SESSION_TTL_REMEMBER : LUMIERE_SA_SESSION_TTL;
            $sessions = lumiere_sa_load_collection("sessions", array());
            if (!is_array($sessions)) $sessions = array();
            $sessions[$token] = array(
                "kind" => "cafe",
                "cafeOwnerId" => $owner["id"],
                "tenantId" => isset($owner["tenantId"]) ? $owner["tenantId"] : null,
                "createdAt" => lumiere_sa_now(),
                "expiresAt" => lumiere_sa_now() + $ttl,
                "remember" => $remember,
                "ip" => $ip,
            );
            lumiere_sa_save_collection("sessions", $sessions);
            $owner["lastLoginAt"] = lumiere_sa_iso();
            $owner["updatedAt"] = lumiere_sa_iso();
            if (is_array($owners)) {
                foreach ($owners as $i => $o) {
                    if (is_array($o) && isset($o["id"]) && $o["id"] === $owner["id"]) {
                        $owners[$i] = $owner;
                        break;
                    }
                }
                lumiere_sa_save_collection("cafe_owners", $owners);
            }
            return array(
                "status" => 200,
                "body" => array(
                    "token" => $token,
                    "expiresIn" => $ttl,
                    "kind" => "cafe",
                    "owner" => lumiere_sa_public_cafe_owner($owner),
                ),
            );
        }

        lumiere_sa_record_attempt($email, $ip, false);
        return array("status" => 401, "body" => array("error" => "bad_credentials"));
    }

    if ($route === "sa-register" && $method === "POST") {
        $email = strtolower(trim((string) (isset($body["email"]) ? $body["email"] : "")));
        $password = (string) (isset($body["password"]) ? $body["password"] : "");
        $cafeName = trim((string) (isset($body["cafeName"]) ? $body["cafeName"] : (isset($body["name"]) ? $body["name"] : "")));
        $ownerName = trim((string) (isset($body["ownerName"]) ? $body["ownerName"] : (isset($body["name"]) ? $body["name"] : "")));
        $phone = trim((string) (isset($body["phone"]) ? $body["phone"] : ""));
        if ($email === "" || $password === "" || $cafeName === "") {
            return array("status" => 400, "body" => array("error" => "missing_fields"));
        }
        if (strlen($password) < 6) {
            return array("status" => 400, "body" => array("error" => "weak_password"));
        }
        if (lumiere_sa_rate_limited($email, $ip)) {
            return array("status" => 429, "body" => array("error" => "too_many_attempts"));
        }
        $owners = lumiere_sa_load_collection("cafe_owners", array());
        if (!is_array($owners)) $owners = array();
        foreach ($owners as $o) {
            if (is_array($o) && strtolower((string) (isset($o["email"]) ? $o["email"] : "")) === $email) {
                return array("status" => 409, "body" => array("error" => "email_exists"));
            }
        }
        $cafes = lumiere_sa_load_collection("cafes", array());
        if (!is_array($cafes)) $cafes = array();
        $cafe = array(
            "id" => lumiere_sa_new_id("cafe"),
            "name" => $cafeName,
            "ownerName" => $ownerName !== "" ? $ownerName : $cafeName,
            "email" => $email,
            "phone" => $phone,
            "status" => "pending",
            "planId" => null,
            "subscriptionId" => null,
            "settings" => array(),
            "usage" => array(
                "menuItems" => 0,
                "categories" => 0,
                "orders" => 0,
                "invoices" => 0,
                "customers" => 0,
                "users" => 1,
                "storageMb" => 0,
                "mau" => 0,
            ),
            "lastActivityAt" => null,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
        );
        $preferredSlug = trim((string) (isset($body["slug"]) ? $body["slug"] : ""));
        lumiere_tenant_assign_slug($cafe, $cafes, $preferredSlug);
        $cashierPassword = lumiere_sa_generate_password();
        lumiere_sa_cafe_set_cashier_password($cafe, $cashierPassword);
        $owner = array(
            "id" => lumiere_sa_new_id("cown"),
            "email" => $email,
            "passwordHash" => lumiere_sa_hash_password($password),
            "name" => $ownerName !== "" ? $ownerName : $cafeName,
            "phone" => $phone,
            "tenantId" => $cafe["id"],
            "status" => "active",
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
            "lastLoginAt" => null,
        );
        $cafes[] = $cafe;
        $owners[] = $owner;
        lumiere_sa_save_collection("cafes", $cafes);
        lumiere_sa_save_collection("cafe_owners", $owners);
        lumiere_sa_audit(null, "cafe_register", "cafe", $cafe["id"], $ip, array("email" => $email));
        $token = bin2hex(random_bytes(32));
        $sessions = lumiere_sa_load_collection("sessions", array());
        if (!is_array($sessions)) $sessions = array();
        $sessions[$token] = array(
            "kind" => "cafe",
            "cafeOwnerId" => $owner["id"],
            "tenantId" => $cafe["id"],
            "createdAt" => lumiere_sa_now(),
            "expiresAt" => lumiere_sa_now() + LUMIERE_SA_SESSION_TTL,
            "remember" => false,
            "ip" => $ip,
        );
        lumiere_sa_save_collection("sessions", $sessions);
        return array(
            "status" => 200,
            "body" => array(
                "token" => $token,
                "expiresIn" => LUMIERE_SA_SESSION_TTL,
                "kind" => "cafe",
                "owner" => lumiere_sa_public_cafe_owner($owner),
                "cafe" => lumiere_sa_cafe_for_admin($cafe),
                "cashierPassword" => $cashierPassword,
            ),
        );
    }

    if ($route === "sa-public-cafe" && $method === "GET") {
        lumiere_sa_ensure_platform();
        $slug = lumiere_tenant_sanitize_slug(isset($_GET["slug"]) ? $_GET["slug"] : "");
        if ($slug === "") {
            return array("status" => 400, "body" => array("error" => "missing_slug"));
        }
        $cafe = lumiere_tenant_find_by_slug($slug);
        if (!$cafe) {
            return array("status" => 404, "body" => array("error" => "not_found"));
        }
        if (!lumiere_tenant_is_live($cafe)) {
            return array("status" => 403, "body" => array("error" => "not_active"));
        }
        return array("status" => 200, "body" => array("cafe" => lumiere_tenant_public_cafe($cafe)));
    }

    if ($route === "sa-public-plans" && $method === "GET") {
        lumiere_sa_ensure_platform();
        $plans = lumiere_sa_load_collection("plans", array());
        if (!is_array($plans)) $plans = array();
        $active = array();
        foreach ($plans as $p) {
            if (is_array($p) && isset($p["status"]) && $p["status"] === "active") $active[] = $p;
        }
        usort($active, function ($a, $b) {
            $ao = intval(isset($a["displayOrder"]) ? $a["displayOrder"] : 0);
            $bo = intval(isset($b["displayOrder"]) ? $b["displayOrder"] : 0);
            return $ao - $bo;
        });
        $settings = lumiere_sa_load_collection("settings", array());
        if (!is_array($settings)) $settings = array();
        return array(
            "status" => 200,
            "body" => array(
                "plans" => array_values($active),
                "supportNote" => isset($settings["supportNote"])
                    ? $settings["supportNote"]
                    : "پس از ثبت درخواست، شماره کارت برای واریز ارسال می‌شود.",
                "supportPhone" => isset($settings["supportPhone"]) ? $settings["supportPhone"] : "",
                "paymentInstructions" => isset($settings["paymentInstructions"]) ? $settings["paymentInstructions"] : "",
            ),
        );
    }

    if ($route === "sa-logout" && $method === "POST") {
        $token = lumiere_sa_get_token($headers, $body);
        $admin = lumiere_sa_session_admin($token);
        $owner = lumiere_sa_session_cafe_owner($token);
        $sessions = lumiere_sa_load_collection("sessions", array());
        if (is_array($sessions) && isset($sessions[$token])) {
            unset($sessions[$token]);
            lumiere_sa_save_collection("sessions", $sessions);
        }
        if ($admin) {
            lumiere_sa_audit($admin, "logout", "admin", isset($admin["id"]) ? $admin["id"] : "", $ip);
        }
        return array("status" => 200, "body" => array("ok" => true));
    }

    if ($route === "sa-me" && $method === "GET") {
        $admin = lumiere_sa_session_admin(lumiere_sa_get_token($headers, $body));
        if ($admin) {
            return array("status" => 200, "body" => array("kind" => "admin", "admin" => lumiere_sa_public_admin($admin)));
        }
        $owner = lumiere_sa_session_cafe_owner(lumiere_sa_get_token($headers, $body));
        if ($owner) {
            return array("status" => 200, "body" => array("kind" => "cafe", "owner" => lumiere_sa_public_cafe_owner($owner)));
        }
        return array("status" => 401, "body" => array("error" => "auth_required"));
    }

    if ($route === "sa-cafe-portal" && $method === "GET") {
        list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
        if ($err) return $err;
        return array("status" => 200, "body" => lumiere_sa_cafe_portal_payload($owner));
    }

    if ($route === "sa-cafe-support" && $method === "GET") {
        list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
        if ($err) return $err;
        $tickets = lumiere_sa_cafe_tickets_for_owner($owner);
        return array(
            "status" => 200,
            "body" => array("items" => $tickets, "total" => count($tickets)),
        );
    }

    if ($route === "sa-cafe-support" && $method === "POST") {
        list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
        if ($err) return $err;
        $subject = trim((string) (isset($body["subject"]) ? $body["subject"] : ""));
        $msgBody = trim((string) (isset($body["body"]) ? $body["body"] : ""));
        if ($subject === "") {
            return array("status" => 400, "body" => array("error" => "missing_subject"));
        }
        $cafe = lumiere_sa_find_cafe((string) (isset($owner["tenantId"]) ? $owner["tenantId"] : ""));
        $tickets = lumiere_sa_load_collection("support_tickets", array());
        if (!is_array($tickets)) $tickets = array();
        $messages = array();
        if ($msgBody !== "") {
            $messages[] = array(
                "id" => lumiere_sa_new_id("msg"),
                "from" => "cafe",
                "body" => $msgBody,
                "createdAt" => lumiere_sa_iso(),
            );
        }
        $ticket = array(
            "id" => lumiere_sa_new_id("tkt"),
            "tenantId" => isset($owner["tenantId"]) ? $owner["tenantId"] : null,
            "cafeName" => is_array($cafe) && isset($cafe["name"]) ? $cafe["name"] : "",
            "cafeOwnerEmail" => isset($owner["email"]) ? $owner["email"] : "",
            "subject" => $subject,
            "priority" => "normal",
            "status" => "open",
            "assignedAdminId" => null,
            "messages" => $messages,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
            "lastReplyAt" => $msgBody !== "" ? lumiere_sa_iso() : null,
        );
        array_unshift($tickets, $ticket);
        lumiere_sa_save_collection("support_tickets", $tickets);
        return array("status" => 200, "body" => array("ticket" => $ticket));
    }

    if ($route === "sa-cafe-support-item" && $itemId !== "") {
        list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
        if ($err) return $err;
        $tickets = lumiere_sa_load_collection("support_tickets", array());
        if (!is_array($tickets)) $tickets = array();
        $idx = -1;
        foreach ($tickets as $i => $t) {
            if (is_array($t) && isset($t["id"]) && $t["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));
        $ticket = $tickets[$idx];
        if (!lumiere_sa_cafe_ticket_owned($ticket, $owner)) {
            return array("status" => 403, "body" => array("error" => "forbidden"));
        }
        if ($method === "GET") {
            return array("status" => 200, "body" => array("ticket" => $ticket));
        }
        if ($method === "POST") {
            $action = (string) (isset($body["action"]) ? $body["action"] : "reply");
            if ($action === "reply") {
                $msgBody = trim((string) (isset($body["body"]) ? $body["body"] : ""));
                if ($msgBody === "") {
                    return array("status" => 400, "body" => array("error" => "missing_body"));
                }
                $msgs = isset($ticket["messages"]) && is_array($ticket["messages"]) ? $ticket["messages"] : array();
                $msgs[] = array(
                    "id" => lumiere_sa_new_id("msg"),
                    "from" => "cafe",
                    "body" => $msgBody,
                    "createdAt" => lumiere_sa_iso(),
                );
                $ticket["messages"] = $msgs;
                $ticket["lastReplyAt"] = lumiere_sa_iso();
                if (isset($ticket["status"]) && $ticket["status"] === "waiting_customer") {
                    $ticket["status"] = "open";
                }
            }
            $ticket["updatedAt"] = lumiere_sa_iso();
            $tickets[$idx] = $ticket;
            lumiere_sa_save_collection("support_tickets", $tickets);
            return array("status" => 200, "body" => array("ticket" => $ticket));
        }
    }

    if ($route === "sa-recharge-requests" && $method === "GET") {
        $admin = lumiere_sa_session_admin(lumiere_sa_get_token($headers, $body));
        if ($admin) {
            if (
                !lumiere_sa_has_permission($admin, "support.read")
                && !lumiere_sa_has_permission($admin, "*")
                && !lumiere_sa_has_permission($admin, "subscriptions.read")
            ) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $reqs = lumiere_sa_load_collection("recharge_requests", array());
            if (!is_array($reqs)) $reqs = array();
            usort($reqs, function ($a, $b) {
                $av = is_array($a) && isset($a["createdAt"]) ? $a["createdAt"] : "";
                $bv = is_array($b) && isset($b["createdAt"]) ? $b["createdAt"] : "";
                return strcmp((string) $bv, (string) $av);
            });
            return array(
                "status" => 200,
                "body" => lumiere_sa_filter_page($reqs, array("id", "cafeName", "ownerName", "phone", "email", "planId", "status")),
            );
        }
        list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
        if ($err) return $err;
        $payload = lumiere_sa_cafe_portal_payload($owner);
        return array(
            "status" => 200,
            "body" => array(
                "items" => $payload["requests"],
                "total" => count($payload["requests"]),
            ),
        );
    }

    if ($route === "sa-recharge-requests" && $method === "POST") {
        list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
        if ($err) return $err;
        $cafe = lumiere_sa_find_cafe((string) (isset($owner["tenantId"]) ? $owner["tenantId"] : ""));
        $plans = lumiere_sa_load_collection("plans", array());
        $planId = (string) (isset($body["planId"]) ? $body["planId"] : "");
        $plan = null;
        if (is_array($plans)) {
            foreach ($plans as $p) {
                if (is_array($p) && isset($p["id"]) && $p["id"] === $planId) {
                    $plan = $p;
                    break;
                }
            }
        }
        if (!$plan) {
            return array("status" => 400, "body" => array("error" => "invalid_plan"));
        }
        $cycle = (string) (isset($body["billingCycle"]) ? $body["billingCycle"] : "monthly");
        if (!in_array($cycle, array("monthly", "6months", "yearly"), true)) $cycle = "monthly";
        $reqType = (string) (isset($body["type"]) ? $body["type"] : "purchase");
        $note = trim((string) (isset($body["note"]) ? $body["note"] : ""));
        $prices = (isset($plan["prices"]) && is_array($plan["prices"])) ? $plan["prices"] : array();
        $price = intval(isset($prices[$cycle]) ? $prices[$cycle] : 0);
        $reqs = lumiere_sa_load_collection("recharge_requests", array());
        if (!is_array($reqs)) $reqs = array();
        $req = array(
            "id" => lumiere_sa_new_id("req"),
            "type" => $reqType,
            "status" => "pending",
            "tenantId" => isset($owner["tenantId"]) ? $owner["tenantId"] : null,
            "cafeOwnerId" => isset($owner["id"]) ? $owner["id"] : null,
            "cafeName" => is_array($cafe) && isset($cafe["name"]) ? $cafe["name"] : "",
            "ownerName" => isset($owner["name"]) ? $owner["name"] : "",
            "email" => isset($owner["email"]) ? $owner["email"] : "",
            "phone" => isset($owner["phone"]) && $owner["phone"]
                ? $owner["phone"]
                : (is_array($cafe) && isset($cafe["phone"]) ? $cafe["phone"] : ""),
            "planId" => $planId,
            "planName" => isset($plan["name"]) ? $plan["name"] : null,
            "billingCycle" => $cycle,
            "price" => $price,
            "currency" => "IRT",
            "note" => $note,
            "adminNote" => "",
            "paymentCardNumber" => "",
            "paymentCardHolder" => "",
            "paymentInstructions" => "",
            "userPaymentReference" => "",
            "userPaymentNote" => "",
            "paymentSentAt" => null,
            "paymentSubmittedAt" => null,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
            "contactedAt" => null,
            "fulfilledAt" => null,
        );
        array_unshift($reqs, $req);
        lumiere_sa_save_collection("recharge_requests", $reqs);
        $tickets = lumiere_sa_load_collection("support_tickets", array());
        if (!is_array($tickets)) $tickets = array();
        $ticket = array(
            "id" => lumiere_sa_new_id("tkt"),
            "tenantId" => isset($owner["tenantId"]) ? $owner["tenantId"] : null,
            "subject" => "درخواست " . $reqType . " — " . (isset($plan["name"]) ? $plan["name"] : "") . " (" . $cycle . ")",
            "priority" => "normal",
            "status" => "open",
            "assignedAdminId" => null,
            "relatedRequestId" => $req["id"],
            "messages" => array(
                array(
                    "id" => lumiere_sa_new_id("msg"),
                    "from" => "cafe",
                    "body" => $note !== "" ? $note : ("درخواست " . $reqType . " برای پلن " . (isset($plan["name"]) ? $plan["name"] : "")),
                    "createdAt" => lumiere_sa_iso(),
                ),
            ),
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
            "lastReplyAt" => lumiere_sa_iso(),
        );
        array_unshift($tickets, $ticket);
        lumiere_sa_save_collection("support_tickets", $tickets);
        $req["ticketId"] = $ticket["id"];
        $reqs[0] = $req;
        lumiere_sa_save_collection("recharge_requests", $reqs);
        return array("status" => 200, "body" => array("request" => $req, "ticket" => $ticket));
    }

    if ($route === "sa-recharge-request" && $itemId !== "" && $method === "POST") {
        $reqs = lumiere_sa_load_collection("recharge_requests", array());
        if (!is_array($reqs)) $reqs = array();
        $idx = -1;
        foreach ($reqs as $i => $r) {
            if (is_array($r) && isset($r["id"]) && $r["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));
        $req = $reqs[$idx];
        $action = (string) (isset($body["action"]) ? $body["action"] : "");

        $admin = lumiere_sa_session_admin(lumiere_sa_get_token($headers, $body));
        if (!$admin) {
            list($owner, $err) = lumiere_sa_require_cafe($headers, $body);
            if ($err) return $err;
            if ($action !== "confirm_payment") {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $ownerTenant = isset($owner["tenantId"]) ? $owner["tenantId"] : null;
            $ownerId = isset($owner["id"]) ? $owner["id"] : null;
            $owns = (isset($req["tenantId"]) && $req["tenantId"] === $ownerTenant)
                || (isset($req["cafeOwnerId"]) && $req["cafeOwnerId"] === $ownerId);
            if (!$owns) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $st = isset($req["status"]) ? (string) $req["status"] : "";
            if ($st !== "awaiting_payment" && $st !== "contacted") {
                return array("status" => 400, "body" => array("error" => "invalid_status"));
            }
            $req["status"] = "payment_submitted";
            $req["userPaymentReference"] = trim((string) (isset($body["paymentReference"]) ? $body["paymentReference"] : (isset($body["reference"]) ? $body["reference"] : "")));
            $req["userPaymentNote"] = trim((string) (isset($body["note"]) ? $body["note"] : (isset($body["userPaymentNote"]) ? $body["userPaymentNote"] : "")));
            $req["paymentSubmittedAt"] = lumiere_sa_iso();
            $req["updatedAt"] = lumiere_sa_iso();
            $reqs[$idx] = $req;
            lumiere_sa_save_collection("recharge_requests", $reqs);
            return array("status" => 200, "body" => array("request" => $req));
        }

        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "subscriptions.write");
        if ($err) {
            list($admin, $err2) = lumiere_sa_require_admin($headers, $body);
            if ($err2) return $err2;
            if (!lumiere_sa_has_permission($admin, "*") && !lumiere_sa_has_permission($admin, "support.write")) {
                return $err;
            }
        }
        if ($action === "contact" || $action === "send_payment_info") {
            $settings = lumiere_sa_load_collection("settings", array());
            if (!is_array($settings)) $settings = array();
            $card = trim((string) (isset($body["paymentCardNumber"]) ? $body["paymentCardNumber"] : (isset($settings["paymentCardNumber"]) ? $settings["paymentCardNumber"] : "")));
            if ($card === "") {
                return array("status" => 400, "body" => array("error" => "payment_card_missing"));
            }
            $req["status"] = "awaiting_payment";
            $req["paymentCardNumber"] = $card;
            $req["paymentCardHolder"] = trim((string) (isset($body["paymentCardHolder"]) ? $body["paymentCardHolder"] : (isset($settings["paymentCardHolder"]) ? $settings["paymentCardHolder"] : "")));
            $req["paymentInstructions"] = trim((string) (isset($body["paymentInstructions"]) ? $body["paymentInstructions"] : (isset($settings["paymentInstructions"]) ? $settings["paymentInstructions"] : "")));
            $req["paymentSentAt"] = lumiere_sa_iso();
            $req["contactedAt"] = $req["paymentSentAt"];
            $req["adminNote"] = (string) (isset($body["adminNote"]) ? $body["adminNote"] : (isset($req["adminNote"]) ? $req["adminNote"] : ""));
            $req["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit($admin, "send_payment_info", "recharge_request", $req["id"], $ip);
        } elseif ($action === "reject") {
            $req["status"] = "rejected";
            $req["adminNote"] = (string) (isset($body["adminNote"]) ? $body["adminNote"] : "");
            $req["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit($admin, "reject_recharge_request", "recharge_request", $req["id"], $ip);
        } elseif ($action === "fulfill") {
            $cycleDays = array("monthly" => 30, "6months" => 182, "yearly" => 365);
            $reqCycle = isset($req["billingCycle"]) ? $req["billingCycle"] : "monthly";
            $defaultDays = isset($cycleDays[$reqCycle]) ? $cycleDays[$reqCycle] : 30;
            $days = intval(isset($body["days"]) ? $body["days"] : $defaultDays);
            $planId = (string) (isset($body["planId"]) ? $body["planId"] : (isset($req["planId"]) ? $req["planId"] : ""));
            $tenantId = (string) (isset($req["tenantId"]) ? $req["tenantId"] : "");
            $subs = lumiere_sa_load_collection("subscriptions", array());
            if (!is_array($subs)) $subs = array();
            $existing = null;
            $ei = -1;
            foreach ($subs as $i => $s) {
                if (!is_array($s)) continue;
                $st = isset($s["status"]) ? $s["status"] : "";
                if (
                    isset($s["tenantId"]) && $s["tenantId"] === $tenantId
                    && in_array($st, array("trial", "active", "past_due", "grace_period", "expired"), true)
                ) {
                    $existing = $s;
                    $ei = $i;
                    break;
                }
            }
            $start = lumiere_sa_now();
            if ($existing) {
                $endTs = lumiere_sa_parse_ts(isset($existing["endDate"]) ? $existing["endDate"] : "");
                if ($endTs === false) $endTs = $start;
                $base = max($endTs, $start);
                $existing["planId"] = $planId !== "" ? $planId : (isset($existing["planId"]) ? $existing["planId"] : "");
                $existing["billingCycle"] = isset($req["billingCycle"]) ? $req["billingCycle"] : (isset($existing["billingCycle"]) ? $existing["billingCycle"] : "monthly");
                $existing["price"] = intval(isset($req["price"]) ? $req["price"] : (isset($existing["price"]) ? $existing["price"] : 0));
                $existing["status"] = "active";
                $existing["endDate"] = lumiere_sa_iso($base + $days * 86400);
                $existing["paymentStatus"] = "manual";
                $existing["updatedAt"] = lumiere_sa_iso();
                $subs[$ei] = $existing;
                $sub = $existing;
            } else {
                $sub = array(
                    "id" => lumiere_sa_new_id("sub"),
                    "tenantId" => $tenantId,
                    "planId" => $planId,
                    "billingCycle" => isset($req["billingCycle"]) ? $req["billingCycle"] : "monthly",
                    "status" => "active",
                    "price" => intval(isset($req["price"]) ? $req["price"] : 0),
                    "currency" => "IRT",
                    "startDate" => lumiere_sa_iso($start),
                    "endDate" => lumiere_sa_iso($start + $days * 86400),
                    "trialEndDate" => null,
                    "autoRenew" => false,
                    "paymentStatus" => "manual",
                    "cancelledAt" => null,
                    "createdAt" => lumiere_sa_iso(),
                    "updatedAt" => lumiere_sa_iso(),
                );
                $subs[] = $sub;
            }
            lumiere_sa_save_collection("subscriptions", $subs);
            $cafes = lumiere_sa_load_collection("cafes", array());
            if (is_array($cafes)) {
                foreach ($cafes as $i => $c) {
                    if (is_array($c) && isset($c["id"]) && $c["id"] === $tenantId) {
                        $c["status"] = "active";
                        $c["planId"] = $planId;
                        $c["subscriptionId"] = $sub["id"];
                        $c["updatedAt"] = lumiere_sa_iso();
                        $cafes[$i] = $c;
                        break;
                    }
                }
                lumiere_sa_save_collection("cafes", $cafes);
                foreach ($cafes as $c) {
                    if (is_array($c) && isset($c["id"]) && $c["id"] === $tenantId && lumiere_tenant_is_live($c)) {
                        lumiere_tenant_provision($c);
                        break;
                    }
                }
            }
            $req["status"] = "fulfilled";
            $req["fulfilledAt"] = lumiere_sa_iso();
            $req["adminNote"] = (string) (isset($body["adminNote"]) ? $body["adminNote"] : (isset($req["adminNote"]) ? $req["adminNote"] : ""));
            $req["subscriptionId"] = $sub["id"];
            $req["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit(
                $admin,
                "fulfill_recharge_request",
                "recharge_request",
                $req["id"],
                $ip,
                array("days" => $days, "planId" => $planId, "tenantId" => $tenantId)
            );
        } else {
            return array("status" => 400, "body" => array("error" => "invalid_action"));
        }
        $reqs[$idx] = $req;
        lumiere_sa_save_collection("recharge_requests", $reqs);
        return array("status" => 200, "body" => array("request" => $req));
    }

    // ── Dashboard ─────────────────────────────────────────
    if ($route === "sa-dashboard" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "analytics.read");
        if ($err) {
            list($admin, $err2) = lumiere_sa_require_admin($headers, $body);
            if ($err2) return $err2;
            if (!lumiere_sa_has_permission($admin, "analytics.read") && !lumiere_sa_has_permission($admin, "*")) {
                if (!lumiere_sa_has_permission($admin, "cafes.read")) return $err;
            }
        }
        return array("status" => 200, "body" => lumiere_sa_dashboard_kpis());
    }

    // ── Cafes ─────────────────────────────────────────────
    if ($route === "sa-cafes" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "cafes.read");
        if ($err) return $err;
        $cafes = function_exists("lumiere_tenant_ensure_slugs")
            ? lumiere_tenant_ensure_slugs()
            : lumiere_sa_load_collection("cafes", array());
        if (!is_array($cafes)) $cafes = array();
        return array(
            "status" => 200,
            "body" => lumiere_sa_filter_page($cafes, array("name", "ownerName", "email", "phone", "id", "subscriptionId", "slug")),
        );
    }

    if ($route === "sa-cafes" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "cafes.write");
        if ($err) return $err;
        $cafes = lumiere_sa_load_collection("cafes", array());
        if (!is_array($cafes)) $cafes = array();
        $name = trim((string) (isset($body["name"]) ? $body["name"] : ""));
        if ($name === "") $name = "Untitled Cafe";
        $cafe = array(
            "id" => lumiere_sa_new_id("cafe"),
            "name" => $name,
            "ownerName" => trim((string) (isset($body["ownerName"]) ? $body["ownerName"] : "")),
            "email" => strtolower(trim((string) (isset($body["email"]) ? $body["email"] : ""))),
            "phone" => trim((string) (isset($body["phone"]) ? $body["phone"] : "")),
            "status" => (string) (isset($body["status"]) ? $body["status"] : "pending"),
            "planId" => isset($body["planId"]) ? $body["planId"] : null,
            "subscriptionId" => null,
            "settings" => (isset($body["settings"]) && is_array($body["settings"])) ? $body["settings"] : array(),
            "usage" => array(
                "menuItems" => 0,
                "categories" => 0,
                "orders" => 0,
                "invoices" => 0,
                "customers" => 0,
                "users" => 1,
                "storageMb" => 0,
                "mau" => 0,
            ),
            "lastActivityAt" => null,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
        );
        $preferredSlug = trim((string) (isset($body["slug"]) ? $body["slug"] : ""));
        lumiere_tenant_assign_slug($cafe, $cafes, $preferredSlug);
        lumiere_tenant_provision($cafe);
        $cashierPassword = lumiere_sa_generate_password();
        lumiere_sa_cafe_set_cashier_password($cafe, $cashierPassword);
        $cafes[] = $cafe;
        lumiere_sa_save_collection("cafes", $cafes);
        lumiere_sa_audit($admin, "create_cafe", "cafe", $cafe["id"], $ip, array("name" => $cafe["name"]));
        return array("status" => 200, "body" => array(
            "cafe" => lumiere_sa_cafe_for_admin($cafe),
            "cashierPassword" => $cashierPassword,
            "temporaryPassword" => $cashierPassword,
        ));
    }

    if ($route === "sa-cafe" && $itemId !== "") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body);
        if ($err) return $err;
        $cafes = function_exists("lumiere_tenant_ensure_slugs")
            ? lumiere_tenant_ensure_slugs()
            : lumiere_sa_load_collection("cafes", array());
        if (!is_array($cafes)) $cafes = array();
        $idx = -1;
        foreach ($cafes as $i => $c) {
            if (is_array($c) && isset($c["id"]) && $c["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));

        if ($method === "GET") {
            if (!lumiere_sa_has_permission($admin, "cafes.read")) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $cafe = $cafes[$idx];
            $subs = lumiere_sa_load_collection("subscriptions", array());
            $sub = null;
            if (is_array($subs)) {
                foreach ($subs as $s) {
                    if (!is_array($s)) continue;
                    $match = (isset($s["id"]) && $s["id"] === (isset($cafe["subscriptionId"]) ? $cafe["subscriptionId"] : null))
                        || (isset($s["tenantId"]) && $s["tenantId"] === $cafe["id"]);
                    if ($match && (!isset($s["status"]) || $s["status"] !== "cancelled")) {
                        $sub = $s;
                        break;
                    }
                }
            }
            return array(
                "status" => 200,
                "body" => array(
                    "cafe" => lumiere_sa_cafe_for_admin($cafe),
                    "subscription" => $sub,
                    "cashierAuth" => function_exists("lumiere_tenant_cashier_auth_meta")
                        ? lumiere_tenant_cashier_auth_meta($cafe["id"])
                        : array("hasPassword" => false),
                ),
            );
        }

        if ($method === "POST") {
            if (!lumiere_sa_has_permission($admin, "cafes.write")) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $action = (string) (isset($body["action"]) ? $body["action"] : "update");
            $cafe = $cafes[$idx];
            if ($action === "reset_cashier_password" || $action === "set_cashier_password") {
                $providedPassword = isset($body["password"]) && trim((string) $body["password"]) !== "";
                $newPassword = $providedPassword
                    ? trim((string) $body["password"])
                    : lumiere_sa_generate_password();
                if (strlen($newPassword) < 4) {
                    return array("status" => 400, "body" => array("error" => "weak_password"));
                }
                lumiere_tenant_provision($cafe);
                lumiere_sa_cafe_set_cashier_password($cafe, $newPassword);
                $cafe["updatedAt"] = lumiere_sa_iso();
                $cafes[$idx] = $cafe;
                lumiere_sa_save_collection("cafes", $cafes);
                lumiere_sa_audit($admin, "reset_cashier_password", "cafe", $cafe["id"], $ip);
                return array(
                    "status" => 200,
                    "body" => array(
                        "cafe" => lumiere_sa_cafe_for_admin($cafe),
                        "cashierPassword" => $newPassword,
                        "temporaryPassword" => $newPassword,
                        "cashierAuth" => function_exists("lumiere_tenant_cashier_auth_meta")
                            ? lumiere_tenant_cashier_auth_meta($cafe["id"])
                            : array("hasPassword" => true),
                    ),
                );
            }
            if ($action === "update") {
                foreach (array("name", "ownerName", "email", "phone", "status", "planId") as $key) {
                    if (array_key_exists($key, $body)) $cafe[$key] = $body[$key];
                }
                if (array_key_exists("slug", $body)) {
                    if (!lumiere_tenant_assign_slug($cafe, $cafes, trim((string) $body["slug"]))) {
                        return array("status" => 409, "body" => array("error" => "slug_taken"));
                    }
                }
                $cafe["updatedAt"] = lumiere_sa_iso();
                $cafes[$idx] = $cafe;
                lumiere_sa_save_collection("cafes", $cafes);
                if (lumiere_tenant_is_live($cafe)) {
                    lumiere_tenant_provision($cafe);
                }
                lumiere_sa_audit($admin, "edit_cafe", "cafe", $cafe["id"], $ip);
                return array("status" => 200, "body" => array("cafe" => $cafe));
            }
            if ($action === "suspend") {
                $cafe["status"] = "suspended";
                $cafe["updatedAt"] = lumiere_sa_iso();
                $cafes[$idx] = $cafe;
                lumiere_sa_save_collection("cafes", $cafes);
                lumiere_sa_audit($admin, "suspend_cafe", "cafe", $cafe["id"], $ip, array("reason" => isset($body["reason"]) ? $body["reason"] : null));
                return array("status" => 200, "body" => array("cafe" => $cafe));
            }
            if ($action === "reactivate") {
                $cafe["status"] = "active";
                $cafe["updatedAt"] = lumiere_sa_iso();
                lumiere_tenant_provision($cafe);
                $cafes[$idx] = $cafe;
                lumiere_sa_save_collection("cafes", $cafes);
                lumiere_sa_audit($admin, "activate_cafe", "cafe", $cafe["id"], $ip);
                return array("status" => 200, "body" => array("cafe" => $cafe));
            }
            if ($action === "end_subscription") {
                if (!lumiere_sa_has_permission($admin, "subscriptions.write")) {
                    return array("status" => 403, "body" => array("error" => "forbidden"));
                }
                $subs = lumiere_sa_load_collection("subscriptions", array());
                if (!is_array($subs)) $subs = array();
                $sub = lumiere_sa_subscription_for_cafe($cafe, $subs);
                if (!$sub) {
                    return array("status" => 404, "body" => array("error" => "no_subscription"));
                }
                $subIdx = lumiere_sa_subscription_index($subs, $sub["id"]);
                if ($subIdx < 0) {
                    return array("status" => 404, "body" => array("error" => "no_subscription"));
                }
                $sub = $subs[$subIdx];
                $sub["status"] = "cancelled";
                $sub["cancelledAt"] = lumiere_sa_iso();
                $sub["autoRenew"] = false;
                $sub["updatedAt"] = lumiere_sa_iso();
                $subs[$subIdx] = $sub;
                lumiere_sa_save_collection("subscriptions", $subs);
                $cafe["status"] = "cancelled";
                $cafe["updatedAt"] = lumiere_sa_iso();
                $cafes[$idx] = $cafe;
                lumiere_sa_save_collection("cafes", $cafes);
                lumiere_sa_audit($admin, "cancel_subscription", "subscription", $sub["id"], $ip, array("cafeId" => $cafe["id"]));
                lumiere_sa_audit($admin, "cancel_cafe", "cafe", $cafe["id"], $ip);
                return array("status" => 200, "body" => array("cafe" => $cafe, "subscription" => $sub));
            }
            if ($action === "delete") {
                array_splice($cafes, $idx, 1);
                lumiere_sa_save_collection("cafes", $cafes);
                lumiere_sa_audit($admin, "delete_cafe", "cafe", $itemId, $ip);
                return array("status" => 200, "body" => array("ok" => true));
            }
            if ($action === "impersonate") {
                if (!lumiere_sa_has_permission($admin, "cafes.write")) {
                    return array("status" => 403, "body" => array("error" => "forbidden"));
                }
                $impToken = bin2hex(random_bytes(24));
                $imps = lumiere_sa_load_collection("impersonations", array());
                if (!is_array($imps)) $imps = array();
                $rec = array(
                    "id" => lumiere_sa_new_id("imp"),
                    "token" => $impToken,
                    "adminId" => $admin["id"],
                    "adminEmail" => isset($admin["email"]) ? $admin["email"] : null,
                    "tenantId" => $cafe["id"],
                    "startedAt" => lumiere_sa_iso(),
                    "endedAt" => null,
                    "ip" => $ip,
                    "actions" => array(),
                );
                $imps[] = $rec;
                lumiere_sa_save_collection("impersonations", $imps);
                lumiere_sa_audit($admin, "impersonation_start", "cafe", $cafe["id"], $ip);
                return array(
                    "status" => 200,
                    "body" => array(
                        "impersonationToken" => $impToken,
                        "cafe" => $cafe,
                        "banner" => "You are viewing this account as Super Admin.",
                    ),
                );
            }
            return array("status" => 400, "body" => array("error" => "invalid_action"));
        }
    }

    // ── Plans ─────────────────────────────────────────────
    if ($route === "sa-plans" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "plans.read");
        if ($err) return $err;
        $plans = lumiere_sa_load_collection("plans", array());
        if (!is_array($plans)) $plans = array();
        usort($plans, function ($a, $b) {
            $ao = is_array($a) ? intval(isset($a["displayOrder"]) ? $a["displayOrder"] : 0) : 0;
            $bo = is_array($b) ? intval(isset($b["displayOrder"]) ? $b["displayOrder"] : 0) : 0;
            return $ao - $bo;
        });
        return array("status" => 200, "body" => array("items" => array_values($plans), "total" => count($plans)));
    }

    if ($route === "sa-plans" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "plans.write");
        if ($err) return $err;
        $plans = lumiere_sa_load_collection("plans", array());
        if (!is_array($plans)) $plans = array();
        $plan = array(
            "id" => lumiere_sa_new_id("plan"),
            "name" => trim((string) (isset($body["name"]) ? $body["name"] : "New Plan")),
            "description" => (string) (isset($body["description"]) ? $body["description"] : ""),
            "status" => (string) (isset($body["status"]) ? $body["status"] : "active"),
            "displayOrder" => intval(isset($body["displayOrder"]) ? $body["displayOrder"] : count($plans) + 1),
            "entitlements" => (isset($body["entitlements"]) && is_array($body["entitlements"])) ? $body["entitlements"] : array(),
            "prices" => (isset($body["prices"]) && is_array($body["prices"]))
                ? $body["prices"]
                : array("monthly" => 0, "6months" => 0, "yearly" => 0),
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
        );
        $plans[] = $plan;
        lumiere_sa_save_collection("plans", $plans);
        lumiere_sa_audit($admin, "create_plan", "plan", $plan["id"], $ip);
        return array("status" => 200, "body" => array("plan" => $plan));
    }

    if ($route === "sa-plan" && $itemId !== "") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body);
        if ($err) return $err;
        $plans = lumiere_sa_load_collection("plans", array());
        if (!is_array($plans)) $plans = array();
        $idx = -1;
        foreach ($plans as $i => $p) {
            if (is_array($p) && isset($p["id"]) && $p["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));
        if ($method === "GET") {
            if (!lumiere_sa_has_permission($admin, "plans.read")) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            return array("status" => 200, "body" => array("plan" => $plans[$idx]));
        }
        if ($method === "POST") {
            if (!lumiere_sa_has_permission($admin, "plans.write")) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $plan = $plans[$idx];
            foreach (array("name", "description", "status", "displayOrder", "entitlements", "prices") as $key) {
                if (array_key_exists($key, $body)) $plan[$key] = $body[$key];
            }
            $plan["updatedAt"] = lumiere_sa_iso();
            $plans[$idx] = $plan;
            lumiere_sa_save_collection("plans", $plans);
            lumiere_sa_audit($admin, "edit_plan", "plan", $plan["id"], $ip);
            return array("status" => 200, "body" => array("plan" => $plan));
        }
    }

    // ── Subscriptions ─────────────────────────────────────
    if ($route === "sa-subscriptions" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "subscriptions.read");
        if ($err) return $err;
        $subs = lumiere_sa_load_collection("subscriptions", array());
        if (!is_array($subs)) $subs = array();
        return array(
            "status" => 200,
            "body" => lumiere_sa_filter_page($subs, array("id", "tenantId", "planId", "status")),
        );
    }

    if ($route === "sa-subscriptions" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "subscriptions.write");
        if ($err) return $err;
        $subs = lumiere_sa_load_collection("subscriptions", array());
        if (!is_array($subs)) $subs = array();
        $settings = lumiere_sa_load_collection("settings", array());
        $trialDays = intval(is_array($settings) && isset($settings["trialDays"]) ? $settings["trialDays"] : 14);
        $status = (string) (isset($body["status"]) ? $body["status"] : "trial");
        $start = lumiere_sa_now();
        $trialEnd = ($status === "trial") ? ($start + $trialDays * 86400) : null;
        $cycle = (string) (isset($body["billingCycle"]) ? $body["billingCycle"] : "monthly");
        $daysMap = array("monthly" => 30, "6months" => 182, "yearly" => 365);
        $days = isset($daysMap[$cycle]) ? $daysMap[$cycle] : 30;
        $end = $start + $days * 86400;
        $autoRenew = array_key_exists("autoRenew", $body) ? !!$body["autoRenew"] : true;
        $sub = array(
            "id" => lumiere_sa_new_id("sub"),
            "tenantId" => (string) (isset($body["tenantId"]) ? $body["tenantId"] : ""),
            "planId" => (string) (isset($body["planId"]) ? $body["planId"] : ""),
            "billingCycle" => $cycle,
            "status" => $status,
            "price" => intval(isset($body["price"]) ? $body["price"] : 0),
            "currency" => (string) (isset($body["currency"]) ? $body["currency"] : "IRT"),
            "startDate" => lumiere_sa_iso($start),
            "endDate" => lumiere_sa_iso($end),
            "trialEndDate" => $trialEnd ? lumiere_sa_iso($trialEnd) : null,
            "autoRenew" => $autoRenew,
            "paymentStatus" => (string) (isset($body["paymentStatus"]) ? $body["paymentStatus"] : "pending"),
            "cancelledAt" => null,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
        );
        $subs[] = $sub;
        lumiere_sa_save_collection("subscriptions", $subs);
        $cafes = lumiere_sa_load_collection("cafes", array());
        if (is_array($cafes) && $sub["tenantId"] !== "") {
            foreach ($cafes as $i => $c) {
                if (is_array($c) && isset($c["id"]) && $c["id"] === $sub["tenantId"]) {
                    $c["subscriptionId"] = $sub["id"];
                    $c["planId"] = $sub["planId"];
                    $c["status"] = ($status === "trial") ? "trial" : "active";
                    $c["updatedAt"] = lumiere_sa_iso();
                    if (empty($c["slug"])) {
                        lumiere_tenant_assign_slug($c, $cafes);
                    }
                    lumiere_tenant_provision($c);
                    $cafes[$i] = $c;
                    break;
                }
            }
            lumiere_sa_save_collection("cafes", $cafes);
        }
        lumiere_sa_audit($admin, "create_subscription", "subscription", $sub["id"], $ip);
        return array("status" => 200, "body" => array("subscription" => $sub));
    }

    if ($route === "sa-subscription" && $itemId !== "" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "subscriptions.write");
        if ($err) return $err;
        $subs = lumiere_sa_load_collection("subscriptions", array());
        if (!is_array($subs)) $subs = array();
        $idx = -1;
        foreach ($subs as $i => $s) {
            if (is_array($s) && isset($s["id"]) && $s["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));
        $sub = $subs[$idx];
        $action = (string) (isset($body["action"]) ? $body["action"] : "update");
        if ($action === "extend") {
            $days = intval(isset($body["days"]) ? $body["days"] : 30);
            $endTs = lumiere_sa_parse_ts(isset($sub["endDate"]) ? $sub["endDate"] : "");
            if ($endTs === false) $endTs = lumiere_sa_now();
            $base = max($endTs, lumiere_sa_now());
            $sub["endDate"] = lumiere_sa_iso($base + $days * 86400);
            $st = isset($sub["status"]) ? $sub["status"] : "";
            if ($st === "expired" || $st === "past_due" || $st === "grace_period") {
                $sub["status"] = "active";
            }
            $sub["updatedAt"] = lumiere_sa_iso();
            $reason = (string) (isset($body["reason"]) ? $body["reason"] : "");
            lumiere_sa_audit($admin, "extend_subscription", "subscription", $sub["id"], $ip, array("days" => $days, "reason" => $reason));
        } elseif ($action === "cancel") {
            $sub["status"] = "cancelled";
            $sub["cancelledAt"] = lumiere_sa_iso();
            $sub["autoRenew"] = false;
            $sub["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit($admin, "cancel_subscription", "subscription", $sub["id"], $ip);
            lumiere_sa_sync_cafe_subscription_status($sub, "cancelled");
        } elseif ($action === "reactivate") {
            $sub["status"] = "active";
            $sub["cancelledAt"] = null;
            $sub["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit($admin, "reactivate_subscription", "subscription", $sub["id"], $ip);
            lumiere_sa_sync_cafe_subscription_status($sub, "active");
        } elseif ($action === "change_plan") {
            $sub["planId"] = (string) (isset($body["planId"]) ? $body["planId"] : (isset($sub["planId"]) ? $sub["planId"] : ""));
            if (array_key_exists("price", $body)) $sub["price"] = intval($body["price"]);
            if (array_key_exists("billingCycle", $body)) $sub["billingCycle"] = $body["billingCycle"];
            $sub["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit($admin, "change_plan", "subscription", $sub["id"], $ip, array("planId" => $sub["planId"]));
        } else {
            foreach (array("status", "autoRenew", "paymentStatus", "price", "billingCycle", "planId") as $key) {
                if (array_key_exists($key, $body)) $sub[$key] = $body[$key];
            }
            $sub["updatedAt"] = lumiere_sa_iso();
            lumiere_sa_audit($admin, "edit_subscription", "subscription", $sub["id"], $ip);
        }
        $subs[$idx] = $sub;
        lumiere_sa_save_collection("subscriptions", $subs);
        return array("status" => 200, "body" => array("subscription" => $sub));
    }

    if ($route === "sa-subscription" && $itemId !== "" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "subscriptions.read");
        if ($err) return $err;
        $subs = lumiere_sa_load_collection("subscriptions", array());
        if (is_array($subs)) {
            foreach ($subs as $s) {
                if (is_array($s) && isset($s["id"]) && $s["id"] === $itemId) {
                    return array("status" => 200, "body" => array("subscription" => $s));
                }
            }
        }
        return array("status" => 404, "body" => array("error" => "not_found"));
    }

    // ── Payments ──────────────────────────────────────────
    if ($route === "sa-payments" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "payments.read");
        if ($err) return $err;
        $payments = lumiere_sa_load_collection("saas_payments", array());
        if (!is_array($payments)) $payments = array();
        return array(
            "status" => 200,
            "body" => lumiere_sa_filter_page($payments, array("id", "tenantId", "referenceNumber", "provider", "status")),
        );
    }

    if ($route === "sa-payments" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "payments.read");
        if ($err) return $err;
        if (
            !lumiere_sa_has_permission($admin, "subscriptions.write")
            && !lumiere_sa_has_permission($admin, "payments.refund")
            && !lumiere_sa_has_permission($admin, "*")
        ) {
            return array("status" => 403, "body" => array("error" => "forbidden"));
        }
        $payments = lumiere_sa_load_collection("saas_payments", array());
        if (!is_array($payments)) $payments = array();
        $payment = array(
            "id" => lumiere_sa_new_id("pay"),
            "tenantId" => (string) (isset($body["tenantId"]) ? $body["tenantId"] : ""),
            "subscriptionId" => isset($body["subscriptionId"]) ? $body["subscriptionId"] : null,
            "amount" => intval(isset($body["amount"]) ? $body["amount"] : 0),
            "currency" => (string) (isset($body["currency"]) ? $body["currency"] : "IRT"),
            "status" => (string) (isset($body["status"]) ? $body["status"] : "successful"),
            "provider" => (string) (isset($body["provider"]) ? $body["provider"] : "manual"),
            "providerTransactionId" => isset($body["providerTransactionId"]) ? $body["providerTransactionId"] : null,
            "referenceNumber" => (string) (isset($body["referenceNumber"]) ? $body["referenceNumber"] : lumiere_sa_new_id("ref")),
            "paymentMethod" => (string) (isset($body["paymentMethod"]) ? $body["paymentMethod"] : "manual"),
            "planId" => isset($body["planId"]) ? $body["planId"] : null,
            "billingCycle" => isset($body["billingCycle"]) ? $body["billingCycle"] : null,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
        );
        $payments[] = $payment;
        lumiere_sa_save_collection("saas_payments", $payments);
        lumiere_sa_audit($admin, "create_payment", "payment", $payment["id"], $ip);
        return array("status" => 200, "body" => array("payment" => $payment));
    }

    if ($route === "sa-payment" && $itemId !== "" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "payments.refund");
        if ($err) return $err;
        $payments = lumiere_sa_load_collection("saas_payments", array());
        if (!is_array($payments)) $payments = array();
        $idx = -1;
        foreach ($payments as $i => $p) {
            if (is_array($p) && isset($p["id"]) && $p["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));
        $payment = $payments[$idx];
        $action = (string) (isset($body["action"]) ? $body["action"] : "");
        if ($action === "refund") {
            $payment["status"] = "refunded";
            $payment["updatedAt"] = lumiere_sa_iso();
            $payments[$idx] = $payment;
            lumiere_sa_save_collection("saas_payments", $payments);
            lumiere_sa_audit($admin, "refund", "payment", $payment["id"], $ip, array("reason" => isset($body["reason"]) ? $body["reason"] : null));
            return array("status" => 200, "body" => array("payment" => $payment));
        }
        return array("status" => 400, "body" => array("error" => "invalid_action"));
    }

    if ($route === "sa-payment" && $itemId !== "" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "payments.read");
        if ($err) return $err;
        $payments = lumiere_sa_load_collection("saas_payments", array());
        if (is_array($payments)) {
            foreach ($payments as $p) {
                if (is_array($p) && isset($p["id"]) && $p["id"] === $itemId) {
                    return array("status" => 200, "body" => array("payment" => $p));
                }
            }
        }
        return array("status" => 404, "body" => array("error" => "not_found"));
    }

    // ── Coupons ───────────────────────────────────────────
    if ($route === "sa-coupons" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "plans.read");
        if ($err) return $err;
        $coupons = lumiere_sa_load_collection("coupons", array());
        return array("status" => 200, "body" => array("items" => is_array($coupons) ? $coupons : array()));
    }

    if ($route === "sa-coupons" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "plans.write");
        if ($err) return $err;
        $coupons = lumiere_sa_load_collection("coupons", array());
        if (!is_array($coupons)) $coupons = array();
        $action = (string) (isset($body["action"]) ? $body["action"] : "create");
        if ($action === "delete") {
            $cid = (string) (isset($body["id"]) ? $body["id"] : "");
            $coupons = array_values(array_filter($coupons, function ($c) use ($cid) {
                return !(is_array($c) && isset($c["id"]) && $c["id"] === $cid);
            }));
            lumiere_sa_save_collection("coupons", $coupons);
            lumiere_sa_audit($admin, "delete_coupon", "coupon", $cid, $ip);
            return array("status" => 200, "body" => array("ok" => true));
        }
        $coupon = array(
            "id" => isset($body["id"]) && $body["id"] ? $body["id"] : lumiere_sa_new_id("cpn"),
            "code" => strtoupper(trim((string) (isset($body["code"]) ? $body["code"] : ""))),
            "discountType" => (string) (isset($body["discountType"]) ? $body["discountType"] : "percentage"),
            "discountValue" => intval(isset($body["discountValue"]) ? $body["discountValue"] : 0),
            "startDate" => isset($body["startDate"]) ? $body["startDate"] : null,
            "endDate" => isset($body["endDate"]) ? $body["endDate"] : null,
            "usageLimit" => isset($body["usageLimit"]) ? $body["usageLimit"] : null,
            "perUserLimit" => isset($body["perUserLimit"]) ? $body["perUserLimit"] : null,
            "usedCount" => intval(isset($body["usedCount"]) ? $body["usedCount"] : 0),
            "applicablePlans" => (isset($body["applicablePlans"]) && is_array($body["applicablePlans"])) ? $body["applicablePlans"] : array(),
            "minimumPayment" => intval(isset($body["minimumPayment"]) ? $body["minimumPayment"] : 0),
            "status" => (string) (isset($body["status"]) ? $body["status"] : "active"),
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
        );
        $existing = -1;
        foreach ($coupons as $i => $c) {
            if (is_array($c) && isset($c["id"]) && $c["id"] === $coupon["id"]) {
                $existing = $i;
                break;
            }
        }
        if ($existing >= 0) {
            $coupon["createdAt"] = isset($coupons[$existing]["createdAt"]) ? $coupons[$existing]["createdAt"] : $coupon["createdAt"];
            $coupons[$existing] = $coupon;
        } else {
            $coupons[] = $coupon;
        }
        lumiere_sa_save_collection("coupons", $coupons);
        lumiere_sa_audit($admin, "save_coupon", "coupon", $coupon["id"], $ip);
        return array("status" => 200, "body" => array("coupon" => $coupon));
    }

    // ── Analytics ─────────────────────────────────────────
    if ($route === "sa-analytics" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "analytics.read");
        if ($err) return $err;
        $kind = strtolower(lumiere_sa_qs_get("kind", "revenue"));
        if ($kind === "") $kind = "revenue";
        $dash = lumiere_sa_dashboard_kpis();
        $payments = lumiere_sa_load_collection("saas_payments", array());
        if (!is_array($payments)) $payments = array();
        $months = array();
        foreach ($payments as $p) {
            if (!is_array($p) || !isset($p["status"]) || $p["status"] !== "successful") continue;
            $key = substr((string) (isset($p["createdAt"]) ? $p["createdAt"] : ""), 0, 7);
            if ($key === "") continue;
            if (!isset($months[$key])) $months[$key] = 0;
            $months[$key] += intval(isset($p["amount"]) ? $p["amount"] : 0);
        }
        ksort($months);
        $series = array();
        foreach ($months as $k => $v) {
            $series[] = array("month" => $k, "revenue" => $v);
        }
        $series = array_slice($series, -12);
        $byPlan = array();
        foreach ($payments as $p) {
            if (!is_array($p) || !isset($p["status"]) || $p["status"] !== "successful") continue;
            $pid = (string) (isset($p["planId"]) ? $p["planId"] : "unknown");
            if (!isset($byPlan[$pid])) $byPlan[$pid] = 0;
            $byPlan[$pid] += intval(isset($p["amount"]) ? $p["amount"] : 0);
        }
        $revenueByPlan = array();
        foreach ($byPlan as $k => $v) {
            $revenueByPlan[] = array("planId" => $k, "revenue" => $v);
        }
        return array(
            "status" => 200,
            "body" => array(
                "kind" => $kind,
                "kpis" => $dash["kpis"],
                "revenueByMonth" => $series,
                "revenueByPlan" => $revenueByPlan,
                "popularPlans" => $dash["popularPlans"],
            ),
        );
    }

    // ── Notifications ─────────────────────────────────────
    if ($route === "sa-notifications" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body);
        if ($err) return $err;
        $items = lumiere_sa_load_collection("notifications", array());
        return array("status" => 200, "body" => array("items" => is_array($items) ? $items : array()));
    }

    if ($route === "sa-notifications" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "notifications.write");
        if ($err) return $err;
        $items = lumiere_sa_load_collection("notifications", array());
        if (!is_array($items)) $items = array();
        $note = array(
            "id" => lumiere_sa_new_id("ntf"),
            "title" => trim((string) (isset($body["title"]) ? $body["title"] : "")),
            "body" => (string) (isset($body["body"]) ? $body["body"] : ""),
            "type" => (string) (isset($body["type"]) ? $body["type"] : "system"),
            "channels" => (isset($body["channels"]) && is_array($body["channels"])) ? $body["channels"] : array("in_app"),
            "target" => (isset($body["target"]) && is_array($body["target"])) ? $body["target"] : array("scope" => "all"),
            "status" => "sent",
            "sentAt" => lumiere_sa_iso(),
            "createdBy" => isset($admin["id"]) ? $admin["id"] : null,
            "createdAt" => lumiere_sa_iso(),
        );
        array_unshift($items, $note);
        lumiere_sa_save_collection("notifications", $items);
        lumiere_sa_audit($admin, "send_notification", "notification", $note["id"], $ip);
        return array("status" => 200, "body" => array("notification" => $note));
    }

    // ── Support ───────────────────────────────────────────
    if ($route === "sa-support" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "support.read");
        if ($err) return $err;
        $tickets = lumiere_sa_load_collection("support_tickets", array());
        if (!is_array($tickets)) $tickets = array();
        $tickets = lumiere_sa_enrich_support_tickets($tickets);
        return array(
            "status" => 200,
            "body" => lumiere_sa_filter_page($tickets, array("id", "subject", "tenantId", "status", "priority", "cafeName", "cafeOwnerEmail")),
        );
    }

    if ($route === "sa-support" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "support.write");
        if ($err) return $err;
        $tickets = lumiere_sa_load_collection("support_tickets", array());
        if (!is_array($tickets)) $tickets = array();
        $messages = array();
        if (!empty($body["body"])) {
            $messages[] = array(
                "id" => lumiere_sa_new_id("msg"),
                "from" => "admin",
                "adminId" => isset($admin["id"]) ? $admin["id"] : null,
                "body" => (string) $body["body"],
                "createdAt" => lumiere_sa_iso(),
            );
        }
        $ticket = array(
            "id" => lumiere_sa_new_id("tkt"),
            "tenantId" => isset($body["tenantId"]) ? $body["tenantId"] : null,
            "cafeName" => "",
            "cafeOwnerEmail" => "",
            "subject" => (string) (isset($body["subject"]) ? $body["subject"] : "Support request"),
            "priority" => (string) (isset($body["priority"]) ? $body["priority"] : "normal"),
            "status" => !empty($body["body"]) ? "waiting_customer" : "open",
            "assignedAdminId" => isset($body["assignedAdminId"]) ? $body["assignedAdminId"] : null,
            "messages" => $messages,
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
            "lastReplyAt" => !empty($body["body"]) ? lumiere_sa_iso() : null,
        );
        if (!empty($body["tenantId"])) {
            $cafeForTicket = lumiere_sa_find_cafe((string) $body["tenantId"]);
            if (is_array($cafeForTicket)) {
                $ticket["cafeName"] = isset($cafeForTicket["name"]) ? $cafeForTicket["name"] : "";
            }
        }
        array_unshift($tickets, $ticket);
        lumiere_sa_save_collection("support_tickets", $tickets);
        return array("status" => 200, "body" => array("ticket" => $ticket));
    }

    if ($route === "sa-support-item" && $itemId !== "") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "support.read");
        if ($err) return $err;
        $tickets = lumiere_sa_load_collection("support_tickets", array());
        if (!is_array($tickets)) $tickets = array();
        $idx = -1;
        foreach ($tickets as $i => $t) {
            if (is_array($t) && isset($t["id"]) && $t["id"] === $itemId) {
                $idx = $i;
                break;
            }
        }
        if ($idx < 0) return array("status" => 404, "body" => array("error" => "not_found"));
        if ($method === "GET") {
            $ticket = $tickets[$idx];
            $ticket["adminReadAt"] = lumiere_sa_iso();
            $ticket["updatedAt"] = lumiere_sa_iso();
            $tickets[$idx] = $ticket;
            lumiere_sa_save_collection("support_tickets", $tickets);
            return array("status" => 200, "body" => array("ticket" => array_merge($ticket, lumiere_sa_support_ticket_meta($ticket))));
        }
        if ($method === "POST") {
            if (!lumiere_sa_has_permission($admin, "support.write")) {
                return array("status" => 403, "body" => array("error" => "forbidden"));
            }
            $ticket = $tickets[$idx];
            $action = (string) (isset($body["action"]) ? $body["action"] : "update");
            if ($action === "reply") {
                $msgs = isset($ticket["messages"]) && is_array($ticket["messages"]) ? $ticket["messages"] : array();
                $msgs[] = array(
                    "id" => lumiere_sa_new_id("msg"),
                    "from" => "admin",
                    "adminId" => isset($admin["id"]) ? $admin["id"] : null,
                    "body" => (string) (isset($body["body"]) ? $body["body"] : ""),
                    "createdAt" => lumiere_sa_iso(),
                );
                $ticket["messages"] = $msgs;
                $ticket["lastReplyAt"] = lumiere_sa_iso();
                $ticket["adminReadAt"] = lumiere_sa_iso();
                $ticket["status"] = (string) (isset($body["status"]) ? $body["status"] : "waiting_customer");
            } else {
                foreach (array("status", "priority", "assignedAdminId", "subject") as $key) {
                    if (array_key_exists($key, $body)) $ticket[$key] = $body[$key];
                }
            }
            $ticket["updatedAt"] = lumiere_sa_iso();
            $tickets[$idx] = $ticket;
            lumiere_sa_save_collection("support_tickets", $tickets);
            return array("status" => 200, "body" => array("ticket" => array_merge($ticket, lumiere_sa_support_ticket_meta($ticket))));
        }
    }

    // ── System ────────────────────────────────────────────
    if ($route === "sa-system-health" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "system.read");
        if ($err) return $err;
        $dbStatus = "healthy";
        $dbDetail = "json_files";
        try {
            if (function_exists("lumiere_storage_health")) {
                $health = lumiere_storage_health();
                $dbDetail = isset($health["database"]) ? (string) $health["database"] : "unknown";
                if ($dbDetail === "error") {
                    $dbStatus = "critical";
                    $dbDetail = isset($health["detail"]) ? (string) $health["detail"] : "error";
                } elseif ($dbDetail === "postgresql") {
                    $dbDetail = "postgresql";
                } else {
                    $dbDetail = "json_files";
                }
            }
        } catch (Exception $e) {
            $dbStatus = "critical";
            $dbDetail = "error";
        }
        return array(
            "status" => 200,
            "body" => array(
                "services" => array(
                    array("name" => "API", "status" => "healthy", "detail" => "ok"),
                    array("name" => "Database", "status" => $dbStatus, "detail" => $dbDetail),
                    array("name" => "Payment Gateway", "status" => "warning", "detail" => "abstraction ready; no live provider"),
                    array("name" => "Background Jobs", "status" => "warning", "detail" => "not configured"),
                    array("name" => "Email Service", "status" => "warning", "detail" => "not configured"),
                    array("name" => "SMS Service", "status" => "warning", "detail" => "not configured"),
                    array("name" => "Storage", "status" => "healthy", "detail" => lumiere_sa_platform_dir()),
                ),
                "overall" => ($dbStatus !== "critical") ? "warning" : "critical",
            ),
        );
    }

    if ($route === "sa-system-settings" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "system.read");
        if ($err) return $err;
        return array("status" => 200, "body" => array("settings" => lumiere_sa_load_collection("settings", array())));
    }

    if ($route === "sa-system-settings" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "system.read");
        if ($err) return $err;
        if (!lumiere_sa_has_permission($admin, "*") && !lumiere_sa_has_permission($admin, "plans.write")) {
            return array("status" => 403, "body" => array("error" => "forbidden"));
        }
        $settings = lumiere_sa_load_collection("settings", array());
        if (!is_array($settings)) $settings = array();
        $patch = (isset($body["settings"]) && is_array($body["settings"])) ? $body["settings"] : $body;
        if (is_array($patch)) {
            foreach ($patch as $k => $v) {
                if ($k === "token") continue;
                $settings[$k] = $v;
            }
        }
        lumiere_sa_save_collection("settings", $settings);
        lumiere_sa_audit($admin, "change_settings", "settings", "platform", $ip);
        return array("status" => 200, "body" => array("settings" => $settings));
    }

    // ── Audit ─────────────────────────────────────────────
    if ($route === "sa-audit-logs" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "audit.read");
        if ($err) return $err;
        $logs = lumiere_sa_load_collection("audit_logs", array());
        if (!is_array($logs)) $logs = array();
        $logs = array_reverse($logs);
        return array(
            "status" => 200,
            "body" => lumiere_sa_filter_page($logs, array("action", "adminEmail", "targetId", "targetType")),
        );
    }

    // ── Admin users & roles ───────────────────────────────
    if ($route === "sa-admin-users" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "admin_users.read");
        if ($err) return $err;
        $admins = lumiere_sa_load_collection("admins", array());
        $items = array();
        if (is_array($admins)) {
            foreach ($admins as $a) {
                if (is_array($a)) $items[] = lumiere_sa_public_admin($a);
            }
        }
        return array("status" => 200, "body" => array("items" => $items));
    }

    if ($route === "sa-admin-users" && $method === "POST") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body, "admin_users.write");
        if ($err) {
            list($admin, $err2) = lumiere_sa_require_admin($headers, $body);
            if ($err2) return $err2;
            if (!lumiere_sa_has_permission($admin, "*")) return $err;
        }
        $admins = lumiere_sa_load_collection("admins", array());
        if (!is_array($admins)) $admins = array();
        $email = strtolower(trim((string) (isset($body["email"]) ? $body["email"] : "")));
        if ($email === "") {
            return array("status" => 400, "body" => array("error" => "missing_email"));
        }
        $providedPassword = isset($body["password"]) && (string) $body["password"] !== "";
        $password = $providedPassword ? (string) $body["password"] : rtrim(strtr(base64_encode(random_bytes(10)), "+/", "-_"), "=");
        $username = isset($body["username"]) ? (string) $body["username"] : "";
        if ($username === "") {
            $parts = explode("@", $email);
            $username = $parts[0];
        }
        $newAdmin = array(
            "id" => lumiere_sa_new_id("admin"),
            "email" => $email,
            "username" => $username,
            "passwordHash" => lumiere_sa_hash_password($password),
            "name" => (string) (isset($body["name"]) ? $body["name"] : ""),
            "roleId" => (string) (isset($body["roleId"]) ? $body["roleId"] : "role_support"),
            "status" => (string) (isset($body["status"]) ? $body["status"] : "active"),
            "createdAt" => lumiere_sa_iso(),
            "updatedAt" => lumiere_sa_iso(),
            "lastLoginAt" => null,
        );
        $admins[] = $newAdmin;
        lumiere_sa_save_collection("admins", $admins);
        lumiere_sa_audit($admin, "create_admin", "admin", $newAdmin["id"], $ip);
        $out = lumiere_sa_public_admin($newAdmin);
        $out["temporaryPassword"] = $providedPassword ? null : $password;
        return array("status" => 200, "body" => array("admin" => $out));
    }

    if ($route === "sa-roles" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body);
        if ($err) return $err;
        $roles = lumiere_sa_load_collection("roles", array());
        return array(
            "status" => 200,
            "body" => array(
                "items" => is_array($roles) ? $roles : array(),
                "allPermissions" => lumiere_sa_permissions(),
            ),
        );
    }

    // ── Global search ─────────────────────────────────────
    if ($route === "sa-search" && $method === "GET") {
        list($admin, $err) = lumiere_sa_require_admin($headers, $body);
        if ($err) return $err;
        $q = strtolower(trim(lumiere_sa_qs_get("q", "")));
        if (strlen($q) < 2) {
            return array("status" => 200, "body" => array("groups" => array()));
        }
        $groups = array();
        $cafes = lumiere_sa_load_collection("cafes", array());
        $cafeHits = array();
        if (is_array($cafes)) {
            foreach ($cafes as $c) {
                if (!is_array($c)) continue;
                $blob = strtolower(implode(" ", array(
                    isset($c["name"]) ? $c["name"] : "",
                    isset($c["ownerName"]) ? $c["ownerName"] : "",
                    isset($c["email"]) ? $c["email"] : "",
                    isset($c["phone"]) ? $c["phone"] : "",
                    isset($c["id"]) ? $c["id"] : "",
                )));
                if (strpos($blob, $q) !== false) {
                    $cafeHits[] = $c;
                    if (count($cafeHits) >= 8) break;
                }
            }
        }
        if ($cafeHits) $groups[] = array("type" => "cafes", "items" => $cafeHits);

        $payments = lumiere_sa_load_collection("saas_payments", array());
        $payHits = array();
        if (is_array($payments)) {
            foreach ($payments as $p) {
                if (!is_array($p)) continue;
                $blob = strtolower(implode(" ", array(
                    isset($p["id"]) ? $p["id"] : "",
                    isset($p["referenceNumber"]) ? $p["referenceNumber"] : "",
                    isset($p["tenantId"]) ? $p["tenantId"] : "",
                )));
                if (strpos($blob, $q) !== false) {
                    $payHits[] = $p;
                    if (count($payHits) >= 8) break;
                }
            }
        }
        if ($payHits) $groups[] = array("type" => "payments", "items" => $payHits);

        $subs = lumiere_sa_load_collection("subscriptions", array());
        $subHits = array();
        if (is_array($subs)) {
            foreach ($subs as $s) {
                if (!is_array($s)) continue;
                $sid = strtolower((string) (isset($s["id"]) ? $s["id"] : ""));
                $tid = strtolower((string) (isset($s["tenantId"]) ? $s["tenantId"] : ""));
                if (strpos($sid, $q) !== false || strpos($tid, $q) !== false) {
                    $subHits[] = $s;
                    if (count($subHits) >= 8) break;
                }
            }
        }
        if ($subHits) $groups[] = array("type" => "subscriptions", "items" => $subHits);

        $tickets = lumiere_sa_load_collection("support_tickets", array());
        $tktHits = array();
        if (is_array($tickets)) {
            foreach ($tickets as $t) {
                if (!is_array($t)) continue;
                $subj = strtolower((string) (isset($t["subject"]) ? $t["subject"] : ""));
                $tid = strtolower((string) (isset($t["id"]) ? $t["id"] : ""));
                if (strpos($subj, $q) !== false || strpos($tid, $q) !== false) {
                    $tktHits[] = $t;
                    if (count($tktHits) >= 8) break;
                }
            }
        }
        if ($tktHits) $groups[] = array("type" => "tickets", "items" => $tktHits);

        return array("status" => 200, "body" => array("groups" => $groups));
    }

    return array("status" => 404, "body" => array("error" => "not_found"));
}
