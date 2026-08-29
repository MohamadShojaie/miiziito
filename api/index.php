<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Cashier-Token, X-Super-Admin-Token, Authorization, X-Miiziito-Sandbox, X-Lumier-Sandbox");
header("Cache-Control: no-store");
date_default_timezone_set("Asia/Tehran");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$dataDir = dirname(__DIR__) . "/data";
$ordersFile = $dataDir . "/orders.json";
$sessionsFile = $dataDir . "/sessions.json";
$menuFile = $dataDir . "/menu-overrides.json";
$tablesFile = $dataDir . "/tables.json";
$invoicesFile = $dataDir . "/invoices.json";
$customersFile = $dataDir . "/customers.json";
$settingsFile = $dataDir . "/settings.json";
$couponsFile = $dataDir . "/coupons.json";
$hardwareFile = $dataDir . "/hardware.json";
$reservationsFile = $dataDir . "/reservations.json";
$paymentTerminalsFile = $dataDir . "/payment_terminals.json";
$paymentsFile = $dataDir . "/payments.json";
$paymentAttemptsFile = $dataDir . "/payment_attempts.json";
$secretFile = $dataDir . "/secret.php";
$uploadsDir = dirname(__DIR__) . "/uploads/items";
require_once __DIR__ . "/storage.php";
require_once __DIR__ . "/payment.php";
if (is_file(__DIR__ . "/super_admin.php")) {
    require_once __DIR__ . "/super_admin.php";
}
$allowedStatus = array(
    "waiting" => true,
    "preparing" => true,
    "ready" => true,
    "delivered" => true,
    "given" => true,
    "cancelled" => true,
    "invoiced" => true
);

function send_json($status, $payload) {
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_dir($dataDir) {
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0775, true);
    }
    @chmod($dataDir, 0775);
}

function ensure_json_file($file, $fallback) {
    if (!file_exists($file)) {
        @file_put_contents($file, $fallback, LOCK_EX);
    }
    @chmod($file, 0666);
}

function clip_text($s, $max) {
    if (function_exists("mb_substr")) {
        return mb_substr($s, 0, $max);
    }
    return substr($s, 0, $max);
}

function read_json_file($file, $default) {
    // When Postgres is enabled for this collection, never silently fall back to
    // JSON files (that causes split-brain: writes to files, reads from DB).
    if (function_exists("lumiere_db_enabled") && lumiere_db_enabled()
        && function_exists("lumiere_storage_map") && lumiere_storage_map($file)) {
        $fromDb = lumiere_storage_read($file, $default);
        if ($fromDb === null) {
            send_json(500, array("error" => "database_unavailable"));
        }
        return $fromDb;
    }
    $fromDb = function_exists("lumiere_storage_read") ? lumiere_storage_read($file, null) : null;
    if ($fromDb !== null) return $fromDb;
    $raw = @file_get_contents($file);
    $data = json_decode($raw, true);
    return $data !== null ? $data : $default;
}

function write_json_file($file, $data) {
    if (function_exists("lumiere_db_enabled") && lumiere_db_enabled()
        && function_exists("lumiere_storage_map") && lumiere_storage_map($file)) {
        if (!lumiere_storage_write($file, $data)) {
            send_json(500, array("error" => "save_failed", "detail" => "database"));
        }
        return;
    }
    if (function_exists("lumiere_storage_write") && lumiere_storage_write($file, $data)) return;
    $tmp = $file . ".tmp";
    $ok = file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    if ($ok === false) {
        send_json(500, array("error" => "save_failed"));
    }
    rename($tmp, $file);
}

function now_ms() {
    return (int) round(microtime(true) * 1000);
}

function new_item_window_ms() {
    return 14 * 24 * 60 * 60 * 1000;
}

function item_new_timestamp($row) {
    if (!is_array($row)) return 0;
    if (!empty($row["newAt"])) return intval($row["newAt"]);
    if (!empty($row["createdAt"])) return intval($row["createdAt"]);
    return 0;
}

function item_is_currently_new($row) {
    if (!is_array($row)) return false;
    if (array_key_exists("isNew", $row) && !$row["isNew"]) return false;
    $ts = item_new_timestamp($row);
    if ($ts <= 0) return !empty($row["isNew"]);
    return (now_ms() - $ts) < new_item_window_ms();
}

function apply_item_new_flag(&$current, $wantNew) {
    $current["isNew"] = !!$wantNew;
    if (!$wantNew) return;
    if (!item_is_currently_new(array_merge($current, array("isNew" => true)))) {
        $current["newAt"] = now_ms();
    } elseif (empty($current["newAt"]) && empty($current["createdAt"])) {
        $current["newAt"] = now_ms();
    }
}

function safe_item_id($itemId) {
    return preg_replace('/[^a-zA-Z0-9\-_]/', '', (string) $itemId);
}

function is_custom_item_id($itemId) {
    return (bool) preg_match('/^cat-\d+-custom-[a-zA-Z0-9]+$/', (string) $itemId);
}

function allowed_preset_icon($path) {
    $path = str_replace("\\", "/", trim((string) $path));
    if (!preg_match('#^assets/category/[a-z0-9._-]+\.(png|svg|webp|jpe?g)$#i', $path)) {
        return "";
    }
    return $path;
}

function category_index_known($overrides, $categoryIndex) {
    if ($categoryIndex >= 1000) {
        return isset($overrides["_addedCategories"][(string) $categoryIndex]);
    }
    if ($categoryIndex < 0 || $categoryIndex > 40) return false;
    $meta = isset($overrides["_categories"][(string) $categoryIndex]) ? $overrides["_categories"][(string) $categoryIndex] : array();
    if (is_array($meta) && !empty($meta["deleted"])) return false;
    return true;
}

function normalize_category_order($overrides, $order) {
    $clean = array();
    $seen = array();
    if (!is_array($order)) $order = array();
    foreach ($order as $ci) {
        $n = intval($ci);
        if (isset($seen[$n])) continue;
        if (!category_index_known($overrides, $n)) continue;
        $seen[$n] = true;
        $clean[] = $n;
        if (count($clean) >= 80) break;
    }
    return $clean;
}

function category_order_append(&$overrides, $categoryIndex) {
    if (!isset($overrides["_categoryOrder"]) || !is_array($overrides["_categoryOrder"])) {
        $overrides["_categoryOrder"] = array();
    }
    $n = intval($categoryIndex);
    foreach ($overrides["_categoryOrder"] as $existing) {
        if (intval($existing) === $n) return;
    }
    $overrides["_categoryOrder"][] = $n;
}

function category_order_remove(&$overrides, $categoryIndex) {
    if (!isset($overrides["_categoryOrder"]) || !is_array($overrides["_categoryOrder"])) return;
    $n = intval($categoryIndex);
    $next = array();
    foreach ($overrides["_categoryOrder"] as $existing) {
        if (intval($existing) === $n) continue;
        $next[] = intval($existing);
    }
    $overrides["_categoryOrder"] = $next;
}

function set_category_icon_value(&$overrides, $categoryIndex, $icon, $clear) {
    $key = (string) $categoryIndex;
    if ($categoryIndex >= 1000) {
        if (!isset($overrides["_addedCategories"][$key]) || !is_array($overrides["_addedCategories"][$key])) {
            return false;
        }
        if ($clear) unset($overrides["_addedCategories"][$key]["icon"]);
        else $overrides["_addedCategories"][$key]["icon"] = $icon;
        return true;
    }
    if ($categoryIndex < 0 || $categoryIndex > 40) return false;
    if (!isset($overrides["_categories"][$key]) || !is_array($overrides["_categories"][$key])) {
        $overrides["_categories"][$key] = array();
    }
    if ($clear) unset($overrides["_categories"][$key]["icon"]);
    else $overrides["_categories"][$key]["icon"] = $icon;
    return true;
}

function set_category_station_value(&$overrides, $categoryIndex, $station) {
    $station = strtolower(trim((string) $station));
    if ($station !== "bar" && $station !== "kitchen") return false;
    $key = (string) $categoryIndex;
    if ($categoryIndex >= 1000) {
        if (!isset($overrides["_addedCategories"][$key]) || !is_array($overrides["_addedCategories"][$key])) {
            return false;
        }
        $overrides["_addedCategories"][$key]["station"] = $station;
        return true;
    }
    if ($categoryIndex < 0 || $categoryIndex > 40) return false;
    if (!isset($overrides["_categories"][$key]) || !is_array($overrides["_categories"][$key])) {
        $overrides["_categories"][$key] = array();
    }
    $overrides["_categories"][$key]["station"] = $station;
    return true;
}

function delete_item_images($uploadsDir, $itemId) {
    $itemId = safe_item_id($itemId);
    if ($itemId === "" || !is_dir($uploadsDir)) return;
    $files = glob($uploadsDir . "/" . $itemId . ".*");
    if (!$files) $files = array();
    $more = glob($uploadsDir . "/" . $itemId . "-*");
    if ($more) $files = array_merge($files, $more);
    foreach ($files as $file) {
        if (is_file($file)) @unlink($file);
    }
}

function save_item_image($uploadsDir, $itemId, $dataUrl) {
    $itemId = safe_item_id($itemId);
    if ($itemId === "") return "";
    $dataUrl = (string) $dataUrl;
    $marker = "base64,";
    $pos = strpos($dataUrl, $marker);
    if ($pos === false) return "";
    $meta = strtolower(substr($dataUrl, 0, $pos));
    $b64 = substr($dataUrl, $pos + strlen($marker));
    $raw = base64_decode($b64, true);
    $min = (strpos($meta, "svg") !== false) ? 20 : 40;
    $max = (strpos($meta, "svg") !== false) ? 200000 : 2500000;
    if ($raw === false || strlen($raw) < $min || strlen($raw) > $max) {
        return "";
    }
    if (strpos($meta, "svg") !== false) {
        if (preg_match('/<script/i', $raw) || preg_match('/on\w+\s*=/i', $raw) || preg_match('/javascript:/i', $raw)) {
            return "";
        }
    }
    if (!is_dir($uploadsDir)) {
        @mkdir($uploadsDir, 0775, true);
    }
    @chmod($uploadsDir, 0775);
    delete_item_images($uploadsDir, $itemId);
    $ext = "jpg";
    if (strpos($meta, "svg") !== false) $ext = "svg";
    elseif (strpos($meta, "png") !== false) $ext = "png";
    elseif (strpos($meta, "webp") !== false) $ext = "webp";
    $name = $itemId . "-" . time() . "." . $ext;
    $path = $uploadsDir . "/" . $name;
    if (@file_put_contents($path, $raw, LOCK_EX) === false) {
        return "";
    }
    @chmod($path, 0666);
    $web = "uploads/items/";
    $folder = basename(str_replace("\\", "/", $uploadsDir));
    if (preg_match('/^dev[0-9]*$/', $folder)) {
        $web = "uploads/" . $folder . "/";
    }
    return $web . $name;
}

function read_orders($ordersFile) {
    $list = read_json_file($ordersFile, array());
    return is_array($list) ? $list : array();
}

function reservations_path_for($tablesFile) {
    return dirname((string) $tablesFile) . "/reservations.json";
}

function live_stamp($ordersFile, $tablesFile, $invoicesFile = "") {
    if (lumiere_db_enabled()) {
        $sandbox = lumiere_storage_sandbox_from_files($ordersFile, $tablesFile, $invoicesFile);
        $stamp = lumiere_storage_live_stamp($sandbox);
        if ($stamp > 0) return $stamp;
    }
    clearstatcache(true, $ordersFile);
    clearstatcache(true, $tablesFile);
    $a = @filemtime($ordersFile);
    $b = @filemtime($tablesFile);
    $max = max($a ? intval($a) : 0, $b ? intval($b) : 0);
    if ($invoicesFile !== "") {
        clearstatcache(true, $invoicesFile);
        $c = @filemtime($invoicesFile);
        $max = max($max, $c ? intval($c) : 0);
    }
    $reservationsFile = reservations_path_for($tablesFile);
    clearstatcache(true, $reservationsFile);
    $d = @filemtime($reservationsFile);
    $max = max($max, $d ? intval($d) : 0);
    return $max;
}

function orders_live_payload($ordersFile, $tablesFile, $invoicesFile = "") {
    $payload = tables_api_payload(read_table_layout($tablesFile));
    $payload["orders"] = read_orders($ordersFile);
    $payload["reservations"] = read_reservations(reservations_path_for($tablesFile));
    if ($invoicesFile !== "") {
        $payload["invoices"] = read_invoices($invoicesFile);
    }
    $payload["since"] = live_stamp($ordersFile, $tablesFile, $invoicesFile);
    return $payload;
}

function parse_session($raw) {
    if (is_array($raw)) {
        $role = (isset($raw["role"]) && $raw["role"] === "dev") ? "dev" : "cashier";
        $sandbox = "";
        if ($role === "dev") {
            $sandbox = sanitize_sandbox_id(isset($raw["sandbox"]) ? $raw["sandbox"] : "dev");
            if ($sandbox === "") $sandbox = "dev";
        }
        return array(
            "created" => intval(isset($raw["created"]) ? $raw["created"] : 0),
            "role" => $role,
            "sandbox" => $sandbox
        );
    }
    return array("created" => intval($raw), "role" => "cashier", "sandbox" => "");
}

function sanitize_sandbox_id($id) {
    $id = strtolower(trim((string) $id));
    if ($id === "1" || $id === "true") return "dev";
    $id = preg_replace('/[^a-z0-9]/', "", $id);
    if (preg_match('/^dev[0-9]*$/', $id)) return $id;
    return "";
}

function request_sandbox_id($body) {
    foreach (array("HTTP_X_MIIZIITO_SANDBOX", "HTTP_X_LUMIER_SANDBOX") as $hdr) {
        if (!empty($_SERVER[$hdr])) {
            $id = sanitize_sandbox_id($_SERVER[$hdr]);
            if ($id !== "") return $id;
        }
    }
    if (is_array($body) && array_key_exists("sandbox", $body) && $body["sandbox"] !== "" && $body["sandbox"] !== null && $body["sandbox"] !== false && $body["sandbox"] !== 0) {
        if ($body["sandbox"] === true) return "dev";
        $id = sanitize_sandbox_id($body["sandbox"]);
        if ($id !== "") return $id;
    }
    if (isset($_GET["sandbox"]) && $_GET["sandbox"] !== "" && $_GET["sandbox"] !== "0") {
        $id = sanitize_sandbox_id($_GET["sandbox"]);
        if ($id !== "") return $id;
    }
    return "";
}

function secret_matches($expected, $entered) {
    $expected = (string) $expected;
    $entered = (string) $entered;
    if ($expected === "" || strlen($expected) !== strlen($entered)) return false;
    return hash_equals($expected, $entered);
}

function apply_sandbox_store($dataDir, &$ordersFile, &$menuFile, &$tablesFile, &$invoicesFile, &$customersFile, &$uploadsDir, $sandboxId) {
    $sandboxId = sanitize_sandbox_id($sandboxId);
    if ($sandboxId === "") $sandboxId = "dev";
    $liveMenu = $menuFile;
    $liveTables = $tablesFile;
    $dir = $dataDir . "/" . $sandboxId;
    ensure_dir($dir);
    $ordersFile = $dir . "/orders.json";
    $menuFile = $dir . "/menu-overrides.json";
    $tablesFile = $dir . "/tables.json";
    $invoicesFile = $dir . "/invoices.json";
    $customersFile = $dir . "/customers.json";
    if (!is_file($ordersFile)) {
        @file_put_contents($ordersFile, "[]", LOCK_EX);
        @chmod($ordersFile, 0666);
    }
    if (!is_file($menuFile)) {
        $src = is_file($liveMenu) ? @file_get_contents($liveMenu) : "{}";
        @file_put_contents($menuFile, ($src !== false && $src !== "") ? $src : "{}", LOCK_EX);
        @chmod($menuFile, 0666);
    }
    if (!is_file($tablesFile)) {
        $src = is_file($liveTables) ? @file_get_contents($liveTables) : "{}";
        @file_put_contents($tablesFile, ($src !== false && $src !== "") ? $src : "{}", LOCK_EX);
        @chmod($tablesFile, 0666);
    }
    if (!is_file($invoicesFile)) {
        @file_put_contents($invoicesFile, "[]", LOCK_EX);
        @chmod($invoicesFile, 0666);
    }
    if (!is_file($customersFile)) {
        @file_put_contents($customersFile, "[]", LOCK_EX);
        @chmod($customersFile, 0666);
    }
    $reservationsFile = $dir . "/reservations.json";
    if (!is_file($reservationsFile)) {
        @file_put_contents($reservationsFile, "[]", LOCK_EX);
        @chmod($reservationsFile, 0666);
    }
    $uploadsDir = dirname($dataDir) . "/uploads/" . $sandboxId;
    if (!is_dir($uploadsDir)) {
        @mkdir($uploadsDir, 0775, true);
    }
    @chmod($uploadsDir, 0775);
}

function read_session($sessionsFile, $body) {
    $token = request_token($body);
    if ($token === "") return null;
    $sessions = read_json_file($sessionsFile, array());
    if (!is_array($sessions) || !isset($sessions[$token])) return null;
    $rec = parse_session($sessions[$token]);
    if ($rec["created"] > 0 && (time() - $rec["created"]) > 60 * 60 * 24 * 7) {
        unset($sessions[$token]);
        write_json_file($sessionsFile, $sessions);
        return null;
    }
    $rec["token"] = $token;
    return $rec;
}

function cashier_token_ok($sessionsFile, $token) {
    $token = trim((string) $token);
    if ($token === "") return false;
    return !!read_session($sessionsFile, array("token" => $token));
}

function sse_flush($chunk) {
    echo $chunk;
    if (function_exists("ob_flush")) {
        @ob_flush();
    }
    @flush();
}

function wait_for_live_change($ordersFile, $tablesFile, $invoicesFile, $since, $timeoutSec) {
    $since = intval($since);
    $deadline = microtime(true) + $timeoutSec;
    while (microtime(true) < $deadline) {
        if (connection_aborted()) break;
        $stamp = live_stamp($ordersFile, $tablesFile, $invoicesFile);
        if ($stamp > $since) return $stamp;
        usleep(400000);
    }
    return live_stamp($ordersFile, $tablesFile, $invoicesFile);
}

function parse_table_number($table) {
    $table = preg_replace('/\D+/', '', (string) $table);
    $table = substr($table, 0, 2);
    if ($table === "") return "";
    $n = intval($table);
    if ($n < 1 || $n > 99) return "";
    return (string) $n;
}

function default_table_layout() {
    return array(
        "regions" => array(
            array("id" => "green", "name" => "اتاق سبز", "tables" => array(1, 2, 3, 4)),
            array("id" => "blue", "name" => "اتاق آبی", "tables" => array(6, 7, 8, 9, 10, 11)),
            array("id" => "yard-up", "name" => "حیاط بالا", "tables" => array(12, 13, 14, 15, 16, 17, 18, 19, 20)),
            array("id" => "yard-down", "name" => "حیاط پایین", "tables" => array(21, 22, 23, 24, 25))
        ),
        "states" => array()
    );
}

function sanitize_table_layout($data) {
    $base = default_table_layout();
    if (!is_array($data)) return $base;

    $oldFlat = !isset($data["regions"]) && !isset($data["states"]);
    if ($oldFlat) {
        $states = array();
        foreach ($data as $key => $value) {
            $table = parse_table_number($key);
            if ($table === "") continue;
            if ($value === "full" || $value === "disabled" || $value === "reserved") $states[$table] = $value;
        }
        $base["states"] = $states;
        return $base;
    }

    $byId = array();
    foreach ($base["regions"] as $region) {
        $byId[$region["id"]] = $region;
    }
    if (!empty($data["regions"]) && is_array($data["regions"])) {
        foreach ($data["regions"] as $region) {
            if (!is_array($region) || empty($region["id"])) continue;
            $id = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) $region["id"]));
            if ($id === "") continue;
            $name = isset($region["name"]) ? trim((string) $region["name"]) : "";
            if ($name === "") $name = isset($byId[$id]) ? $byId[$id]["name"] : $id;
            $tables = array();
            $seen = array();
            if (!empty($region["tables"]) && is_array($region["tables"])) {
                foreach ($region["tables"] as $num) {
                    $table = parse_table_number($num);
                    if ($table === "" || isset($seen[$table])) continue;
                    $seen[$table] = true;
                    $tables[] = intval($table);
                }
            }
            $byId[$id] = array("id" => $id, "name" => $name, "tables" => $tables);
        }
    }
    $regions = array();
    foreach ($byId as $region) {
        $regions[] = $region;
    }

    $states = array();
    if (!empty($data["states"]) && is_array($data["states"])) {
        foreach ($data["states"] as $key => $value) {
            $table = parse_table_number($key);
            if ($table === "") continue;
            if ($value === "full" || $value === "disabled" || $value === "reserved") $states[$table] = $value;
        }
    }
    return array("regions" => $regions, "states" => $states);
}

function read_table_layout($tablesFile) {
    return sanitize_table_layout(read_json_file($tablesFile, array()));
}

function write_table_layout($tablesFile, $layout) {
    write_json_file($tablesFile, sanitize_table_layout($layout));
}

function known_table_set($layout) {
    $set = array();
    if (empty($layout["regions"]) || !is_array($layout["regions"])) return $set;
    foreach ($layout["regions"] as $region) {
        if (empty($region["tables"]) || !is_array($region["tables"])) continue;
        foreach ($region["tables"] as $num) {
            $table = parse_table_number($num);
            if ($table !== "") $set[$table] = true;
        }
    }
    return $set;
}

function is_known_table($layout, $table) {
    $set = known_table_set($layout);
    return isset($set[parse_table_number($table)]);
}

function table_state_of($layout, $table) {
    $table = parse_table_number($table);
    if ($table === "") return "open";
    if (!empty($layout["states"][$table])) return $layout["states"][$table];
    return "open";
}

function tables_api_payload($layout) {
    $layout = sanitize_table_layout($layout);
    return array(
        "tables" => $layout["states"],
        "regions" => $layout["regions"]
    );
}

function remove_table_from_regions(&$layout, $table) {
    $table = parse_table_number($table);
    if ($table === "" || empty($layout["regions"])) return;
    foreach ($layout["regions"] as &$region) {
        if (empty($region["tables"]) || !is_array($region["tables"])) continue;
        $next = array();
        foreach ($region["tables"] as $num) {
            if (parse_table_number($num) !== $table) $next[] = intval($num);
        }
        $region["tables"] = $next;
    }
    unset($region);
}

function add_table_to_region(&$layout, $regionId, $table) {
    $table = parse_table_number($table);
    $regionId = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) $regionId));
    if ($table === "" || $regionId === "") return false;
    $found = false;
    foreach ($layout["regions"] as &$region) {
        if ($region["id"] !== $regionId) continue;
        $region["tables"][] = intval($table);
        $uniq = array();
        $clean = array();
        foreach ($region["tables"] as $num) {
            $n = intval($num);
            if ($n < 1 || isset($uniq[$n])) continue;
            $uniq[$n] = true;
            $clean[] = $n;
        }
        sort($clean, SORT_NUMERIC);
        $region["tables"] = $clean;
        $found = true;
        break;
    }
    unset($region);
    return $found;
}

function add_region(&$layout, $name, $id = "") {
    $name = trim((string) $name);
    if ($name === "") return false;
    $id = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) $id));
    if ($id === "") {
        $id = "region-" . substr(md5($name . microtime(true)), 0, 10);
    }
    if (empty($layout["regions"]) || !is_array($layout["regions"])) {
        $layout["regions"] = array();
    }
    foreach ($layout["regions"] as $region) {
        if (!empty($region["id"]) && $region["id"] === $id) return false;
    }
    $layout["regions"][] = array("id" => $id, "name" => $name, "tables" => array());
    return true;
}

function rename_region(&$layout, $regionId, $name) {
    $name = trim((string) $name);
    $regionId = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) $regionId));
    if ($name === "" || $regionId === "") return false;
    if (empty($layout["regions"]) || !is_array($layout["regions"])) return false;
    foreach ($layout["regions"] as &$region) {
        if (!empty($region["id"]) && $region["id"] === $regionId) {
            $region["name"] = $name;
            unset($region);
            return true;
        }
    }
    unset($region);
    return false;
}

function remove_region(&$layout, $regionId) {
    $regionId = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) $regionId));
    if ($regionId === "" || empty($layout["regions"]) || !is_array($layout["regions"])) return false;
    $next = array();
    $removedTables = array();
    $found = false;
    foreach ($layout["regions"] as $region) {
        if (!empty($region["id"]) && $region["id"] === $regionId) {
            $found = true;
            if (!empty($region["tables"]) && is_array($region["tables"])) {
                foreach ($region["tables"] as $num) {
                    $t = parse_table_number($num);
                    if ($t !== "") $removedTables[] = $t;
                }
            }
            continue;
        }
        $next[] = $region;
    }
    if (!$found) return false;
    $layout["regions"] = $next;
    foreach ($removedTables as $t) {
        unset($layout["states"][$t]);
    }
    return true;
}

function rename_table_number(&$layout, $oldTable, $newTable) {
    $oldTable = parse_table_number($oldTable);
    $newTable = parse_table_number($newTable);
    if ($oldTable === "" || $newTable === "") return "table_required";
    if ($oldTable === $newTable) return "ok";
    if (!is_known_table($layout, $oldTable)) return "table_unknown";
    if (is_known_table($layout, $newTable)) return "table_exists";
    foreach ($layout["regions"] as &$region) {
        if (empty($region["tables"]) || !is_array($region["tables"])) continue;
        $next = array();
        $changed = false;
        foreach ($region["tables"] as $num) {
            $t = parse_table_number($num);
            if ($t === $oldTable) {
                $next[] = intval($newTable);
                $changed = true;
            } elseif ($t !== "") {
                $next[] = intval($t);
            }
        }
        if ($changed) {
            $next = array_values(array_unique($next));
            sort($next, SORT_NUMERIC);
            $region["tables"] = $next;
        }
    }
    unset($region);
    if (!empty($layout["states"][$oldTable])) {
        $layout["states"][$newTable] = $layout["states"][$oldTable];
        unset($layout["states"][$oldTable]);
    }
    return "ok";
}

function mark_table_full($tablesFile, $table) {
    $layout = read_table_layout($tablesFile);
    $table = parse_table_number($table);
    if ($table === "") return $layout;
    if (table_state_of($layout, $table) === "disabled") return $layout;
    $layout["states"][$table] = "full";
    write_table_layout($tablesFile, $layout);
    return read_table_layout($tablesFile);
}

function table_has_open_food($orders, $table) {
    $table = parse_table_number($table);
    foreach ($orders as $order) {
        $type = isset($order["type"]) ? $order["type"] : "food";
        if ($type === "waiter") continue;
        if (parse_table_number(isset($order["table"]) ? $order["table"] : "") !== $table) continue;
        $st = normalize_status(isset($order["status"]) ? $order["status"] : "waiting");
        if (!order_is_closed($st)) return true;
    }
    return false;
}

function maybe_free_table($tablesFile, $table, $orders) {
    $layout = read_table_layout($tablesFile);
    $table = parse_table_number($table);
    if ($table === "") return $layout;
    $cur = table_state_of($layout, $table);
    if ($cur === "disabled") return $layout;
    if (table_has_open_food($orders, $table)) {
        $layout["states"][$table] = "full";
    } elseif ($cur === "reserved") {
        $resFile = reservations_path_for($tablesFile);
        if (find_open_reservation_for_table(read_reservations($resFile), $table)) {
            $layout["states"][$table] = "reserved";
        } else {
            unset($layout["states"][$table]);
        }
    } else {
        unset($layout["states"][$table]);
    }
    write_table_layout($tablesFile, $layout);
    return read_table_layout($tablesFile);
}

function read_reservations($reservationsFile) {
    $list = read_json_file($reservationsFile, array());
    return is_array($list) ? array_values($list) : array();
}

function write_reservations($reservationsFile, $list) {
    if (!is_array($list)) $list = array();
    write_json_file($reservationsFile, array_values($list));
}

function normalize_phone($raw) {
    $digits = preg_replace('/\D+/', '', (string) $raw);
    if (strlen($digits) > 15) $digits = substr($digits, 0, 15);
    return $digits;
}

function reservation_is_open($status) {
    return $status === "pending" || $status === "accepted";
}

function find_open_reservation_for_table($reservations, $table) {
    $table = parse_table_number($table);
    foreach ($reservations as $row) {
        if (!is_array($row)) continue;
        if (parse_table_number(isset($row["table"]) ? $row["table"] : "") !== $table) continue;
        $st = isset($row["status"]) ? (string) $row["status"] : "";
        if (reservation_is_open($st)) return $row;
    }
    return null;
}

function mark_table_reserved($tablesFile, $table) {
    $layout = read_table_layout($tablesFile);
    $table = parse_table_number($table);
    if ($table === "") return $layout;
    if (table_state_of($layout, $table) === "disabled") return $layout;
    $layout["states"][$table] = "reserved";
    write_table_layout($tablesFile, $layout);
    return read_table_layout($tablesFile);
}

function clear_reserved_table($tablesFile, $table) {
    $layout = read_table_layout($tablesFile);
    $table = parse_table_number($table);
    if ($table === "") return $layout;
    if (table_state_of($layout, $table) !== "reserved") return $layout;
    unset($layout["states"][$table]);
    write_table_layout($tablesFile, $layout);
    return read_table_layout($tablesFile);
}

function seat_accepted_reservation($reservationsFile, $table) {
    $table = parse_table_number($table);
    $list = read_reservations($reservationsFile);
    $now = now_ms();
    $changed = false;
    $seated = null;
    foreach ($list as &$row) {
        if (!is_array($row)) continue;
        if (parse_table_number(isset($row["table"]) ? $row["table"] : "") !== $table) continue;
        if ((isset($row["status"]) ? $row["status"] : "") !== "accepted") continue;
        if (!reservation_hold_started($row, $now)) continue;
        $row["status"] = "seated";
        $row["updatedAt"] = $now;
        $seated = $row;
        $changed = true;
        break;
    }
    unset($row);
    if ($changed) write_reservations($reservationsFile, $list);
    return array($list, $seated);
}

function cancel_open_reservations_for_table($reservationsFile, $table) {
    $table = parse_table_number($table);
    $list = read_reservations($reservationsFile);
    $now = now_ms();
    $changed = false;
    foreach ($list as &$row) {
        if (!is_array($row)) continue;
        if (parse_table_number(isset($row["table"]) ? $row["table"] : "") !== $table) continue;
        $st = isset($row["status"]) ? (string) $row["status"] : "";
        if (!reservation_is_open($st)) continue;
        $row["status"] = "cancelled";
        $row["updatedAt"] = $now;
        $changed = true;
    }
    unset($row);
    if ($changed) write_reservations($reservationsFile, $list);
    return $list;
}

define("RESERVE_HOLD_BEFORE_MS", 30 * 60 * 1000);

function parse_reservation_date($raw) {
    $s = trim((string) $raw);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return "";
    $parts = explode("-", $s);
    $y = intval($parts[0]);
    $m = intval($parts[1]);
    $d = intval($parts[2]);
    if (!checkdate($m, $d, $y)) return "";
    $today = date("Y-m-d");
    if ($s < $today) return "";
    return $s;
}

function parse_reservation_time($raw) {
    $s = trim((string) $raw);
    if (!preg_match('/^\d{1,2}:\d{2}$/', $s)) return "";
    $parts = explode(":", $s);
    $h = intval($parts[0]);
    $m = intval($parts[1]);
    if ($h < 0 || $h > 23 || $m < 0 || $m > 59) return "";
    return sprintf("%02d:%02d", $h, $m);
}

function reservation_at_ms($row) {
    if (!is_array($row)) return 0;
    if (isset($row["reservedAt"]) && is_numeric($row["reservedAt"])) {
        return intval($row["reservedAt"]);
    }
    $date = isset($row["date"]) ? trim((string) $row["date"]) : "";
    $clock = isset($row["time"]) ? trim((string) $row["time"]) : "";
    if ($date === "" || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return 0;
    $clock = parse_reservation_time($clock !== "" ? $clock : "00:00");
    if ($clock === "") $clock = "00:00";
    $ts = strtotime($date . " " . $clock . ":00");
    if ($ts === false) return 0;
    return intval($ts * 1000);
}

function reservation_hold_started($row, $nowMs = 0) {
    if (!$nowMs) $nowMs = now_ms();
    $at = reservation_at_ms($row);
    if ($at <= 0) return true;
    return $nowMs >= ($at - RESERVE_HOLD_BEFORE_MS);
}

function reservation_time_reached($row, $nowMs = 0) {
    if (!$nowMs) $nowMs = now_ms();
    $at = reservation_at_ms($row);
    if ($at <= 0) return true;
    return $nowMs >= $at;
}

function sync_reservation_holds($reservationsFile, $tablesFile) {
    $list = read_reservations($reservationsFile);
    $now = now_ms();
    $layout = read_table_layout($tablesFile);
    $changed = false;
    foreach ($list as $row) {
        if (!is_array($row)) continue;
        if ((isset($row["status"]) ? $row["status"] : "") !== "accepted") continue;
        if (!reservation_hold_started($row, $now)) continue;
        $table = parse_table_number(isset($row["table"]) ? $row["table"] : "");
        if ($table === "") continue;
        $st = table_state_of($layout, $table);
        if ($st === "disabled" || $st === "full" || $st === "reserved") continue;
        $layout["states"][$table] = "reserved";
        $changed = true;
    }
    if ($changed) write_table_layout($tablesFile, $layout);
}

function cancel_reservations_after_invoice($reservationsFile, $tablesFile, $table) {
    $table = parse_table_number($table);
    $list = read_reservations($reservationsFile);
    $now = now_ms();
    $changed = false;
    $cancelledHold = false;
    foreach ($list as &$row) {
        if (!is_array($row)) continue;
        if (parse_table_number(isset($row["table"]) ? $row["table"] : "") !== $table) continue;
        $st = isset($row["status"]) ? (string) $row["status"] : "";
        if ($st !== "accepted" && $st !== "seated") continue;
        if (!reservation_time_reached($row, $now)) continue;
        $row["status"] = "cancelled";
        $row["updatedAt"] = $now;
        $changed = true;
        $cancelledHold = true;
    }
    unset($row);
    if ($changed) write_reservations($reservationsFile, $list);
    if ($cancelledHold) clear_reserved_table($tablesFile, $table);
    return $list;
}

function reservations_payload($reservationsFile, $tablesFile, $extra = array()) {
    sync_reservation_holds($reservationsFile, $tablesFile);
    $payload = tables_api_payload(read_table_layout($tablesFile));
    $payload["reservations"] = read_reservations($reservationsFile);
    if (is_array($extra)) {
        foreach ($extra as $k => $v) $payload[$k] = $v;
    }
    return $payload;
}

function read_body() {
    $raw = file_get_contents("php://input");
    if ($raw === false || $raw === "") {
        return array();
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function request_token($body) {
    if (!empty($_SERVER["HTTP_X_CASHIER_TOKEN"])) {
        return trim((string) $_SERVER["HTTP_X_CASHIER_TOKEN"]);
    }
    if (!empty($_SERVER["HTTP_AUTHORIZATION"]) && stripos($_SERVER["HTTP_AUTHORIZATION"], "Bearer ") === 0) {
        return trim(substr($_SERVER["HTTP_AUTHORIZATION"], 7));
    }
    if (is_array($body) && !empty($body["token"])) {
        return trim((string) $body["token"]);
    }
    if (!empty($_GET["token"])) {
        return trim((string) $_GET["token"]);
    }
    return "";
}

function require_cashier($sessionsFile, $body) {
    $rec = read_session($sessionsFile, $body);
    if (!$rec) {
        send_json(401, array("error" => "auth_required"));
    }
    return $rec["token"];
}

function sanitize_items($items) {
    if (!is_array($items) || !$items) {
        return null;
    }
    $cleaned = array();
    foreach ($items as $i => $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string) (isset($item["name"]) ? $item["name"] : ""));
        if ($name === "") {
            continue;
        }
        $count = isset($item["count"]) ? intval($item["count"]) : 1;
        if ($count < 1) $count = 1;
        if ($count > 99) $count = 99;
        $cleaned[] = array(
            "id" => (string) (isset($item["id"]) ? $item["id"] : ("item-" . $i)),
            "name" => clip_text($name, 200),
            "price" => (string) (isset($item["price"]) ? $item["price"] : ""),
            "count" => $count
        );
        $tops = sanitize_toppings(isset($item["toppings"]) ? $item["toppings"] : array());
        if ($tops) {
            $cleaned[count($cleaned) - 1]["toppings"] = $tops;
        }
    }
    return $cleaned ? $cleaned : null;
}

function sanitize_toppings($items) {
    if (!is_array($items)) {
        return array();
    }
    $cleaned = array();
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $name = trim((string) (isset($item["name"]) ? $item["name"] : ""));
        if ($name === "") continue;
        $price = isset($item["price"]) ? floatval($item["price"]) : 0;
        if ($price < 0) $price = 0;
        $cleaned[] = array(
            "name" => clip_text($name, 80),
            "price" => $price
        );
        if (count($cleaned) >= 24) break;
    }
    return $cleaned;
}

function normalize_status($status) {
    if ($status === "given") return "preparing";
    return $status;
}

function compute_stats($orders) {
    $count = 0;
    $sum = 0;
    $hours = array();
    $items = array();
    for ($h = 0; $h < 24; $h++) {
        $hours[$h] = 0;
    }
    foreach ($orders as $order) {
        $type = isset($order["type"]) ? $order["type"] : "food";
        if ($type === "waiter") continue;
        $st = normalize_status(isset($order["status"]) ? $order["status"] : "waiting");
        if ($st === "cancelled") continue;
        $count++;
        $sum += floatval(isset($order["total"]) ? $order["total"] : 0);
        $ts = intval(isset($order["createdAt"]) ? $order["createdAt"] : 0) / 1000;
        if ($ts > 0) {
            $hour = intval(date("G", $ts));
            $hours[$hour]++;
        }
        if (!empty($order["items"]) && is_array($order["items"])) {
            foreach ($order["items"] as $item) {
                $name = isset($item["name"]) ? $item["name"] : "";
                if ($name === "") continue;
                $qty = isset($item["count"]) ? intval($item["count"]) : 1;
                if (!isset($items[$name])) $items[$name] = 0;
                $items[$name] += $qty;
            }
        }
    }
    arsort($items);
    $top = array();
    $i = 0;
    foreach ($items as $name => $qty) {
        if ($i >= 8) break;
        $top[] = array("name" => $name, "count" => $qty);
        $i++;
    }
    $peakHour = 0;
    $peakCount = 0;
    foreach ($hours as $h => $c) {
        if ($c > $peakCount) {
            $peakCount = $c;
            $peakHour = $h;
        }
    }
    return array(
        "orderCount" => $count,
        "averageTotal" => $count ? round($sum / $count) : 0,
        "topItems" => $top,
        "peakHour" => $peakHour,
        "hours" => $hours
    );
}

function order_is_closed($status) {
    $st = normalize_status($status);
    return $st === "delivered" || $st === "cancelled" || $st === "invoiced";
}

function cashier_label($session) {
    if ($session && isset($session["role"]) && $session["role"] === "dev") return "توسعه‌دهنده";
    return "صندوق";
}

function append_order_history(&$order, $action, $status = "") {
    if (!isset($order["history"]) || !is_array($order["history"])) $order["history"] = array();
    $entry = array(
        "at" => now_ms(),
        "action" => (string) $action
    );
    if ($status !== "") $entry["status"] = normalize_status($status);
    $order["history"][] = $entry;
    if (count($order["history"]) > 80) {
        $order["history"] = array_slice($order["history"], -80);
    }
}

function parse_price_value($raw) {
    if (is_int($raw) || is_float($raw)) return max(0, intval(round($raw)));
    $s = (string) $raw;
    $persian = array("۰","۱","۲","۳","۴","۵","۶","۷","۸","۹");
    $latin = array("0","1","2","3","4","5","6","7","8","9");
    $s = str_replace($persian, $latin, $s);
    $s = str_replace(",", "", $s);
    if (preg_match_all('/\d+/', $s, $m) && !empty($m[0])) {
        $max = 0;
        foreach ($m[0] as $n) $max = max($max, intval($n));
        return $max;
    }
    return 0;
}

function invoice_items_from_order($order) {
    $items = array();
    if (empty($order["items"]) || !is_array($order["items"])) return $items;
    foreach ($order["items"] as $item) {
        if (!is_array($item)) continue;
        $qty = isset($item["count"]) ? intval($item["count"]) : 1;
        if ($qty < 1) $qty = 1;
        $unit = parse_price_value(isset($item["price"]) ? $item["price"] : 0);
        $items[] = array(
            "id" => (string) (isset($item["id"]) ? $item["id"] : ""),
            "name" => clip_text((string) (isset($item["name"]) ? $item["name"] : ""), 200),
            "count" => $qty,
            "unit" => $unit,
            "line" => $unit * $qty,
            "price" => (string) (isset($item["price"]) ? $item["price"] : "")
        );
    }
    return $items;
}

function read_invoices($invoicesFile) {
    $list = read_json_file($invoicesFile, array());
    return is_array($list) ? $list : array();
}

function trim_orders_list($orders, $limit = 1500) {
    if (count($orders) <= $limit) return $orders;
    $active = array();
    $closed = array();
    foreach ($orders as $order) {
        $type = isset($order["type"]) ? $order["type"] : "food";
        $st = normalize_status(isset($order["status"]) ? $order["status"] : "waiting");
        if ($type !== "waiter" && ($st === "waiting" || $st === "preparing" || $st === "ready")) {
            $active[] = $order;
        } else {
            $closed[] = $order;
        }
    }
    $room = $limit - count($active);
    if ($room < 0) return array_slice($active, 0, $limit);
    return array_merge($active, array_slice($closed, 0, $room));
}

function allowed_pay_method($method) {
    return $method === "cash" || $method === "card" || $method === "online";
}

function sanitize_payments($raw) {
    if (!is_array($raw)) return array();
    $out = array();
    foreach ($raw as $row) {
        if (!is_array($row)) continue;
        $method = isset($row["method"]) ? (string) $row["method"] : "";
        if (!allowed_pay_method($method)) continue;
        $amount = isset($row["amount"]) ? intval(round(floatval($row["amount"]))) : 0;
        if ($amount <= 0) continue;
        $entry = array("method" => $method, "amount" => $amount);
        foreach (array("paymentId", "referenceNumber", "terminalId", "providerTransactionId") as $k) {
            if (!empty($row[$k])) {
                $entry[$k] = clip_text(trim((string) $row[$k]), 80);
            }
        }
        $out[] = $entry;
    }
    return $out;
}

function payments_total($payments) {
    $sum = 0;
    foreach ($payments as $row) $sum += intval($row["amount"]);
    return $sum;
}

function payments_label($payments) {
    $methods = array();
    foreach ($payments as $row) {
        $methods[$row["method"]] = true;
    }
    $keys = array_keys($methods);
    if (count($keys) === 0) return "";
    if (count($keys) > 1) return "mixed";
    return $keys[0];
}

function invoice_discount($subtotal, $type, $value) {
    $subtotal = intval($subtotal);
    $value = max(0, floatval($value));
    $amount = 0;
    if ($type === "percent") {
        if ($value > 100) $value = 100;
        $amount = intval(round($subtotal * $value / 100));
    } elseif ($type === "fixed") {
        $amount = intval(round($value));
        if ($amount > $subtotal) $amount = $subtotal;
    } else {
        $type = "";
        $value = 0;
        $amount = 0;
    }
    return array($type, $value, $amount);
}

function next_invoice_number($invoices) {
    $max = 1000;
    foreach ($invoices as $inv) {
        $n = isset($inv["number"]) ? intval($inv["number"]) : 0;
        if ($n > $max) $max = $n;
    }
    return $max + 1;
}

function append_invoice_history(&$invoice, $action, $note = "") {
    if (!isset($invoice["history"]) || !is_array($invoice["history"])) $invoice["history"] = array();
    $entry = array(
        "at" => now_ms(),
        "action" => (string) $action
    );
    if ($note !== "") $entry["note"] = clip_text($note, 200);
    $invoice["history"][] = $entry;
    if (count($invoice["history"]) > 80) {
        $invoice["history"] = array_slice($invoice["history"], -80);
    }
}

function invoice_paid_amount($invoice) {
    return payments_total(isset($invoice["payments"]) && is_array($invoice["payments"]) ? $invoice["payments"] : array());
}

function invoice_refunded_amount($invoice) {
    $sum = 0;
    if (empty($invoice["refunds"]) || !is_array($invoice["refunds"])) return 0;
    foreach ($invoice["refunds"] as $row) {
        if (!is_array($row)) continue;
        $sum += isset($row["amount"]) ? intval($row["amount"]) : 0;
    }
    return $sum;
}

function refresh_invoice_status(&$invoice) {
    $st = isset($invoice["status"]) ? (string) $invoice["status"] : "unpaid";
    if ($st === "cancelled") return;
    $paid = invoice_paid_amount($invoice);
    $refunded = invoice_refunded_amount($invoice);
    $total = isset($invoice["total"]) ? intval($invoice["total"]) : 0;
    if ($refunded > 0 && $refunded >= $paid && $paid > 0) {
        $invoice["status"] = "refunded";
    } elseif ($refunded > 0) {
        $invoice["status"] = "partially_refunded";
    } elseif ($paid >= $total && $total >= 0 && $paid > 0) {
        $invoice["status"] = "paid";
    } elseif ($paid >= $total && $total === 0) {
        $invoice["status"] = "paid";
    } else {
        $invoice["status"] = "unpaid";
    }
    $invoice["payMethod"] = payments_label(isset($invoice["payments"]) && is_array($invoice["payments"]) ? $invoice["payments"] : array());
}

function day_start_ms($offsetDays = 0) {
    return (strtotime("today") + intval($offsetDays) * 86400) * 1000;
}

function week_start_ms() {
    $w = intval(date("w"));
    $daysBack = ($w + 1) % 7;
    return day_start_ms(-$daysBack);
}

function month_start_ms() {
    return strtotime(date("Y-m-01")) * 1000;
}

function invoice_in_range($invoice, $fromMs, $toMs) {
    $ts = intval(isset($invoice["createdAt"]) ? $invoice["createdAt"] : 0);
    if ($fromMs > 0 && $ts < $fromMs) return false;
    if ($toMs > 0 && $ts >= $toMs) return false;
    return true;
}

function compute_invoice_stats($invoices) {
    $today = day_start_ms(0);
    $tomorrow = day_start_ms(1);
    $week = week_start_ms();
    $month = month_start_ms();
    $todaySales = 0;
    $weekSales = 0;
    $monthSales = 0;
    $todayCount = 0;
    $paidCount = 0;
    $paidSum = 0;
    $unpaidCount = 0;
    $unpaidTotal = 0;
    $cash = 0;
    $card = 0;
    $online = 0;
    $discountTotal = 0;
    $refundTotal = 0;
    $hours = array();
    $items = array();
    for ($h = 0; $h < 24; $h++) $hours[$h] = 0;
    foreach ($invoices as $inv) {
        if (!is_array($inv)) continue;
        $st = isset($inv["status"]) ? $inv["status"] : "unpaid";
        if ($st === "cancelled") continue;
        $ts = intval(isset($inv["createdAt"]) ? $inv["createdAt"] : 0);
        $total = intval(isset($inv["total"]) ? $inv["total"] : 0);
        $refunded = invoice_refunded_amount($inv);
        $net = max(0, $total - $refunded);
        $discountTotal += intval(isset($inv["discountAmount"]) ? $inv["discountAmount"] : 0);
        $refundTotal += $refunded;
        if ($st === "unpaid") {
            $unpaidCount++;
            $unpaidTotal += $total;
        }
        $isSales = ($st === "paid" || $st === "partially_refunded" || $st === "refunded");
        if ($isSales) {
            $paidCount++;
            $paidSum += $net;
            if ($ts >= $today && $ts < $tomorrow) {
                $todaySales += $net;
                $todayCount++;
            }
            if ($ts >= $week) $weekSales += $net;
            if ($ts >= $month) $monthSales += $net;
            $hour = $ts > 0 ? intval(date("G", $ts / 1000)) : 0;
            $hours[$hour]++;
            if (!empty($inv["payments"]) && is_array($inv["payments"])) {
                foreach ($inv["payments"] as $p) {
                    if (!is_array($p)) continue;
                    $amt = intval(isset($p["amount"]) ? $p["amount"] : 0);
                    $m = isset($p["method"]) ? $p["method"] : "";
                    if ($m === "cash") $cash += $amt;
                    if ($m === "card") $card += $amt;
                    if ($m === "online") $online += $amt;
                }
            }
            if (!empty($inv["items"]) && is_array($inv["items"])) {
                foreach ($inv["items"] as $item) {
                    if (!is_array($item)) continue;
                    $name = isset($item["name"]) ? $item["name"] : "";
                    if ($name === "") continue;
                    $qty = isset($item["count"]) ? intval($item["count"]) : 1;
                    if (!isset($items[$name])) $items[$name] = 0;
                    $items[$name] += $qty;
                }
            }
        }
    }
    arsort($items);
    $top = array();
    $i = 0;
    foreach ($items as $name => $qty) {
        if ($i >= 8) break;
        $top[] = array("name" => $name, "count" => $qty);
        $i++;
    }
    $peakHour = 0;
    $peakCount = 0;
    foreach ($hours as $h => $c) {
        if ($c > $peakCount) {
            $peakCount = $c;
            $peakHour = $h;
        }
    }
    return array(
        "todaySales" => $todaySales,
        "weekSales" => $weekSales,
        "monthSales" => $monthSales,
        "todayCount" => $todayCount,
        "invoiceCount" => $paidCount,
        "averageTotal" => $paidCount ? round($paidSum / $paidCount) : 0,
        "unpaidCount" => $unpaidCount,
        "unpaidTotal" => $unpaidTotal,
        "cashSales" => $cash,
        "cardSales" => $card,
        "onlineSales" => $online,
        "discountTotal" => $discountTotal,
        "refundTotal" => $refundTotal,
        "topItems" => $top,
        "peakHour" => $peakHour,
        "hours" => $hours
    );
}

function invoice_summary_cards($invoices) {
    $stats = compute_invoice_stats($invoices);
    return array(
        "todaySales" => $stats["todaySales"],
        "todayCount" => $stats["todayCount"],
        "averageTotal" => $stats["todayCount"] ? round($stats["todaySales"] / $stats["todayCount"]) : 0,
        "unpaidCount" => $stats["unpaidCount"],
        "unpaidTotal" => $stats["unpaidTotal"]
    );
}

function default_site_settings() {
    return array(
        "restaurantNameFa" => "کافه",
        "restaurantNameEn" => "Cafe",
        "tagline" => "قهوه تخصصی، طعمی متفاوت از غذا",
        "address" => "",
        "phone" => "",
        "logo" => "",
        "backgroundImage" => "",
        "primary" => "#D8DAD3",
        "secondary" => "#566347",
        "creditName" => "Mohamad Shojaei",
        "telegram" => "https://t.me/mo1hamad",
        "email" => "mohamad.shojaie.bg@gmail.com",
        "showNewSection" => true,
        "showFooterCredit" => true,
        "showContactOnMenu" => false,
        "showLogoOnMenu" => true,
        "showLogoOnReceipt" => false,
        "showContactOnReceipt" => true,
        "receiptFooterMessage" => "به امید دیدار مجدد",
        "showBackgroundOnMenu" => true,
        "menuStructure" => "classic",
        "updatedAt" => 0
    );
}

function normalize_hex_color($raw, $fallback) {
    $v = trim((string) $raw);
    if (!preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $v)) {
        return $fallback;
    }
    if (strlen($v) === 4) {
        return "#" . strtoupper($v[1] . $v[1] . $v[2] . $v[2] . $v[3] . $v[3]);
    }
    return strtoupper($v);
}

function normalize_asset_path($raw) {
    $s = trim((string) $raw);
    if ($s === "" || strpos($s, "data:") === 0) return "";
    if (preg_match('#^(https?://|/|uploads/)#', $s)) {
        return clip_text($s, 300);
    }
    return "";
}

function branding_uploads_dir() {
    $dir = dirname(__DIR__) . "/uploads/branding";
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    @chmod($dir, 0775);
    return $dir;
}

function delete_branding_images($kind) {
    $kind = preg_replace('/[^a-z0-9_-]/i', '', (string) $kind);
    if ($kind === "") return;
    $dir = branding_uploads_dir();
    $files = glob($dir . "/" . $kind . ".*");
    if (!$files) $files = array();
    $more = glob($dir . "/" . $kind . "-*");
    if ($more) $files = array_merge($files, $more);
    foreach ($files as $file) {
        if (is_file($file)) @unlink($file);
    }
}

function save_branding_image($kind, $dataUrl) {
    $kind = preg_replace('/[^a-z0-9_-]/i', '', (string) $kind);
    if ($kind !== "logo" && $kind !== "background") return "";
    $saved = save_item_image(branding_uploads_dir(), $kind, $dataUrl);
    if ($saved === "") return "";
    $name = basename(str_replace("\\", "/", $saved));
    return "uploads/branding/" . $name;
}

function read_site_settings($settingsFile) {
    $raw = read_json_file($settingsFile, array());
    return merge_site_settings(default_site_settings(), is_array($raw) ? $raw : array());
}

function merge_site_settings($base, $incoming) {
    if (!is_array($base)) $base = default_site_settings();
    if (!is_array($incoming)) $incoming = array();
    $out = $base;
    if (isset($incoming["restaurantNameFa"])) {
        $out["restaurantNameFa"] = clip_text(trim((string) $incoming["restaurantNameFa"]), 80);
    }
    if (isset($incoming["restaurantNameEn"])) {
        $out["restaurantNameEn"] = clip_text(trim((string) $incoming["restaurantNameEn"]), 80);
    }
    if (isset($incoming["tagline"])) {
        $out["tagline"] = clip_text(trim((string) $incoming["tagline"]), 200);
    }
    if (array_key_exists("address", $incoming)) {
        $out["address"] = clip_text(trim((string) $incoming["address"]), 200);
    }
    if (array_key_exists("phone", $incoming)) {
        $out["phone"] = clip_text(trim((string) $incoming["phone"]), 40);
    }
    if (array_key_exists("logo", $incoming)) {
        $rawLogo = $incoming["logo"];
        if (is_string($rawLogo) && strpos($rawLogo, "data:") === 0) {
            $saved = save_branding_image("logo", $rawLogo);
            if ($saved !== "") $out["logo"] = $saved;
        } elseif ($rawLogo === "" || $rawLogo === null) {
            delete_branding_images("logo");
            $out["logo"] = "";
        } else {
            $out["logo"] = normalize_asset_path($rawLogo);
        }
    }
    if (array_key_exists("backgroundImage", $incoming)) {
        $rawBg = $incoming["backgroundImage"];
        if (is_string($rawBg) && strpos($rawBg, "data:") === 0) {
            $saved = save_branding_image("background", $rawBg);
            if ($saved !== "") $out["backgroundImage"] = $saved;
        } elseif ($rawBg === "" || $rawBg === null) {
            delete_branding_images("background");
            $out["backgroundImage"] = "";
        } else {
            $out["backgroundImage"] = normalize_asset_path($rawBg);
        }
    }
    if (isset($incoming["primary"])) {
        $out["primary"] = normalize_hex_color($incoming["primary"], $out["primary"]);
    }
    if (isset($incoming["secondary"])) {
        $out["secondary"] = normalize_hex_color($incoming["secondary"], $out["secondary"]);
    }
    if (isset($incoming["creditName"])) {
        $out["creditName"] = clip_text(trim((string) $incoming["creditName"]), 120);
    }
    if (isset($incoming["telegram"])) {
        $out["telegram"] = clip_text(trim((string) $incoming["telegram"]), 200);
    }
    if (isset($incoming["email"])) {
        $out["email"] = clip_text(trim((string) $incoming["email"]), 120);
    }
    if (array_key_exists("showNewSection", $incoming)) {
        $out["showNewSection"] = !!$incoming["showNewSection"];
    }
    if (array_key_exists("showFooterCredit", $incoming)) {
        $out["showFooterCredit"] = !!$incoming["showFooterCredit"];
    }
    if (array_key_exists("showContactOnMenu", $incoming)) {
        $out["showContactOnMenu"] = !!$incoming["showContactOnMenu"];
    }
    if (array_key_exists("showLogoOnMenu", $incoming)) {
        $out["showLogoOnMenu"] = !!$incoming["showLogoOnMenu"];
    }
    if (array_key_exists("showLogoOnReceipt", $incoming)) {
        $out["showLogoOnReceipt"] = !!$incoming["showLogoOnReceipt"];
    }
    if (array_key_exists("showContactOnReceipt", $incoming)) {
        $out["showContactOnReceipt"] = !!$incoming["showContactOnReceipt"];
    }
    if (array_key_exists("receiptFooterMessage", $incoming)) {
        $out["receiptFooterMessage"] = clip_text(trim((string) $incoming["receiptFooterMessage"]), 120);
    }
    if (array_key_exists("showBackgroundOnMenu", $incoming)) {
        $out["showBackgroundOnMenu"] = !!$incoming["showBackgroundOnMenu"];
    }
    if (isset($incoming["menuStructure"])) {
        $structure = trim((string) $incoming["menuStructure"]);
        $allowed = array("classic", "cards", "compact", "magazine", "personal");
        if (in_array($structure, $allowed, true)) {
            $out["menuStructure"] = $structure;
        }
    }
    if (isset($incoming["updatedAt"])) {
        $out["updatedAt"] = intval($incoming["updatedAt"]);
    }
    if ($out["restaurantNameFa"] === "") $out["restaurantNameFa"] = $base["restaurantNameFa"];
    if ($out["restaurantNameEn"] === "") $out["restaurantNameEn"] = $base["restaurantNameEn"];
    if ($out["tagline"] === "") $out["tagline"] = $base["tagline"];
    if ($out["creditName"] === "") $out["creditName"] = $base["creditName"];
    if ($out["receiptFooterMessage"] === "") $out["receiptFooterMessage"] = $base["receiptFooterMessage"];
    return $out;
}

function compute_settings_summary($orders, $invoices, $layout) {
    $customersMap = array();
    if (is_array($invoices)) {
        foreach ($invoices as $inv) {
            if (!is_array($inv)) continue;
            $name = trim((string) (isset($inv["customerName"]) ? $inv["customerName"] : ""));
            if ($name === "") continue;
            if (!isset($customersMap[$name])) {
                $customersMap[$name] = array("name" => $name, "invoices" => 0, "phone" => "");
            }
            $customersMap[$name]["invoices"] += 1;
            $phone = trim((string) (isset($inv["customerPhone"]) ? $inv["customerPhone"] : ""));
            if ($phone !== "") {
                $customersMap[$name]["phone"] = $phone;
            }
        }
    }
    $customers = array_values($customersMap);
    usort($customers, function ($a, $b) {
        return $b["invoices"] - $a["invoices"];
    });
    $customers = array_slice($customers, 0, 8);
    $tableCount = 0;
    if (is_array($layout) && isset($layout["regions"]) && is_array($layout["regions"])) {
        foreach ($layout["regions"] as $region) {
            if (!is_array($region) || !isset($region["tables"]) || !is_array($region["tables"])) continue;
            $tableCount += count($region["tables"]);
        }
    }
    return array(
        "orderCount" => is_array($orders) ? count($orders) : 0,
        "invoiceCount" => is_array($invoices) ? count($invoices) : 0,
        "tableCount" => $tableCount,
        "customerCount" => count($customersMap),
        "customers" => $customers
    );
}

function read_customers($customersFile) {
    $raw = read_json_file($customersFile, array());
    return is_array($raw) ? $raw : array();
}

function write_customers($customersFile, $customers) {
    if (!is_array($customers)) $customers = array();
    write_json_file($customersFile, array_values($customers));
}

function new_customer_id() {
    if (function_exists("random_bytes")) {
        return "cust_" . bin2hex(random_bytes(8));
    }
    return "cust_" . dechex(mt_rand()) . dechex(mt_rand());
}

function normalize_birthday($raw) {
    $s = trim((string) $raw);
    if ($s === "") return "";
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return "";
    $y = intval($m[1]);
    $mo = intval($m[2]);
    $d = intval($m[3]);
    if (!checkdate($mo, $d, $y)) return "";
    return sprintf("%04d-%02d-%02d", $y, $mo, $d);
}

function normalize_customer_record($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : $fallbackId));
    if ($id === "") $id = new_customer_id();
    $name = clip_text(trim((string) (isset($raw["name"]) ? $raw["name"] : "")), 80);
    $phone = clip_text(trim((string) (isset($raw["phone"]) ? $raw["phone"] : "")), 20);
    $birthday = normalize_birthday(isset($raw["birthday"]) ? $raw["birthday"] : "");
    $notes = clip_text(trim((string) (isset($raw["notes"]) ? $raw["notes"] : "")), 300);
    $tier = trim((string) (isset($raw["tier"]) ? $raw["tier"] : "standard"));
    if (!in_array($tier, array("standard", "silver", "gold", "vip"), true)) {
        $tier = "standard";
    }
    $tags = array();
    $seen = array();
    $rawTags = isset($raw["tags"]) && is_array($raw["tags"]) ? $raw["tags"] : array();
    foreach ($rawTags as $item) {
        $tag = clip_text(trim((string) $item), 24);
        if ($tag === "") continue;
        $key = strtolower($tag);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $tags[] = $tag;
        if (count($tags) >= 8) break;
    }
    $lastContactAt = null;
    if (array_key_exists("lastContactAt", $raw) && $raw["lastContactAt"] !== "" && $raw["lastContactAt"] !== null) {
        $lastContactAt = intval($raw["lastContactAt"]);
        if ($lastContactAt <= 0) $lastContactAt = null;
    }
    $deletedAt = null;
    if (array_key_exists("deletedAt", $raw) && $raw["deletedAt"] !== "" && $raw["deletedAt"] !== null) {
        $deletedAt = intval($raw["deletedAt"]);
        if ($deletedAt <= 0) $deletedAt = null;
    }
    $createdAt = isset($raw["createdAt"]) ? intval($raw["createdAt"]) : now_ms();
    $updatedAt = isset($raw["updatedAt"]) ? intval($raw["updatedAt"]) : $createdAt;
    $out = array(
        "id" => $id,
        "name" => $name,
        "phone" => $phone,
        "birthday" => $birthday,
        "notes" => $notes,
        "tier" => $tier,
        "tags" => $tags,
        "lastContactAt" => $lastContactAt,
        "createdAt" => $createdAt,
        "updatedAt" => $updatedAt
    );
    if ($deletedAt) $out["deletedAt"] = $deletedAt;
    return $out;
}

function find_customer_index($customers, $id) {
    if (!is_array($customers)) return -1;
    $id = trim((string) $id);
    if ($id === "") return -1;
    foreach ($customers as $i => $row) {
        if (!is_array($row)) continue;
        if ((string) (isset($row["id"]) ? $row["id"] : "") === $id) return $i;
    }
    return -1;
}

function sort_customers($customers) {
    if (!is_array($customers)) return array();
    usort($customers, function ($a, $b) {
        $an = trim((string) (isset($a["name"]) ? $a["name"] : ""));
        $bn = trim((string) (isset($b["name"]) ? $b["name"] : ""));
        return strcasecmp($an, $bn);
    });
    return $customers;
}

function visible_customers($customers) {
    if (!is_array($customers)) return array();
    $rows = array();
    foreach ($customers as $row) {
        if (!is_array($row)) continue;
        if (!empty($row["deletedAt"])) continue;
        $rows[] = $row;
    }
    return sort_customers($rows);
}

function resolve_customer_link($customersFile, $body, $fallback = null, $clear = false) {
    $src = is_array($body) ? $body : array();
    $prev = is_array($fallback) ? $fallback : array();
    if ($clear || (array_key_exists("customerId", $src) && !$src["customerId"])) {
        return array("", "", "");
    }
    $cid = trim((string) (isset($src["customerId"]) ? $src["customerId"] : (isset($prev["customerId"]) ? $prev["customerId"] : "")));
    $name = clip_text(trim((string) (isset($src["customerName"]) ? $src["customerName"] : (isset($prev["customerName"]) ? $prev["customerName"] : ""))), 80);
    $phone = clip_text(trim((string) (isset($src["customerPhone"]) ? $src["customerPhone"] : (isset($prev["customerPhone"]) ? $prev["customerPhone"] : ""))), 20);
    if ($cid !== "") {
        $customers = read_customers($customersFile);
        $idx = find_customer_index($customers, $cid);
        if ($idx < 0) {
            $cid = "";
        } else {
            $row = is_array($customers[$idx]) ? $customers[$idx] : array();
            if (!empty($row["deletedAt"])) {
                $cid = "";
                if ($name === "") $name = clip_text(trim((string) (isset($row["name"]) ? $row["name"] : (isset($prev["customerName"]) ? $prev["customerName"] : ""))), 80);
                if ($phone === "") $phone = clip_text(trim((string) (isset($row["phone"]) ? $row["phone"] : (isset($prev["customerPhone"]) ? $prev["customerPhone"] : ""))), 20);
            } else {
                if ($name === "") $name = clip_text(trim((string) (isset($row["name"]) ? $row["name"] : "")), 80);
                if ($phone === "") $phone = clip_text(trim((string) (isset($row["phone"]) ? $row["phone"] : "")), 20);
            }
        }
    }
    return array($cid, $name, $phone);
}

function apply_customer_link(&$record, $cid, $name, $phone) {
    if (!is_array($record)) $record = array();
    if ($cid !== "") {
        $record["customerId"] = $cid;
    } else {
        unset($record["customerId"]);
    }
    $record["customerName"] = $name;
    $record["customerPhone"] = $phone;
}

function normalize_coupon_code($raw) {
    $code = strtolower(preg_replace('/\s+/', '', trim((string) $raw)));
    return clip_text($code, 32);
}

function read_coupons($couponsFile) {
    $raw = read_json_file($couponsFile, array());
    return is_array($raw) ? $raw : array();
}

function write_coupons($couponsFile, $coupons) {
    if (!is_array($coupons)) $coupons = array();
    write_json_file($couponsFile, array_values($coupons));
}

function new_coupon_id() {
    if (function_exists("random_bytes")) {
        return "cpn_" . bin2hex(random_bytes(8));
    }
    return "cpn_" . dechex(mt_rand()) . dechex(mt_rand());
}

function normalize_coupon_record($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : $fallbackId));
    if ($id === "") $id = new_coupon_id();
    $code = normalize_coupon_code(isset($raw["code"]) ? $raw["code"] : "");
    $label = clip_text(trim((string) (isset($raw["label"]) ? $raw["label"] : "")), 120);
    $discountType = isset($raw["discountType"]) ? (string) $raw["discountType"] : "percent";
    if ($discountType !== "percent" && $discountType !== "fixed") $discountType = "percent";
    $discountValue = isset($raw["discountValue"]) ? floatval($raw["discountValue"]) : 0;
    if ($discountValue < 0) $discountValue = 0;
    if ($discountType === "percent" && $discountValue > 100) $discountValue = 100;
    $active = !isset($raw["active"]) || !!$raw["active"];
    $expiresAt = null;
    if (isset($raw["expiresAt"]) && $raw["expiresAt"] !== null && $raw["expiresAt"] !== "") {
        $expiresAt = intval($raw["expiresAt"]);
        if ($expiresAt <= 0) $expiresAt = null;
    }
    $usageLimit = null;
    if (isset($raw["usageLimit"]) && $raw["usageLimit"] !== null && $raw["usageLimit"] !== "") {
        $usageLimit = intval($raw["usageLimit"]);
        if ($usageLimit <= 0) $usageLimit = null;
    }
    $usedCount = isset($raw["usedCount"]) ? max(0, intval($raw["usedCount"])) : 0;
    $createdAt = isset($raw["createdAt"]) ? intval($raw["createdAt"]) : now_ms();
    $updatedAt = isset($raw["updatedAt"]) ? intval($raw["updatedAt"]) : now_ms();
    return array(
        "id" => $id,
        "code" => $code,
        "label" => $label,
        "discountType" => $discountType,
        "discountValue" => $discountValue,
        "active" => $active,
        "expiresAt" => $expiresAt,
        "usageLimit" => $usageLimit,
        "usedCount" => $usedCount,
        "createdAt" => $createdAt,
        "updatedAt" => $updatedAt
    );
}

function find_coupon_index($coupons, $id) {
    if (!is_array($coupons)) return -1;
    $id = trim((string) $id);
    if ($id === "") return -1;
    foreach ($coupons as $i => $row) {
        if (!is_array($row)) continue;
        if ((string) (isset($row["id"]) ? $row["id"] : "") === $id) return $i;
    }
    return -1;
}

function find_coupon_by_code($coupons, $code) {
    $key = normalize_coupon_code($code);
    if ($key === "" || !is_array($coupons)) return null;
    foreach ($coupons as $row) {
        if (!is_array($row)) continue;
        if (normalize_coupon_code(isset($row["code"]) ? $row["code"] : "") === $key) {
            return $row;
        }
    }
    return null;
}

function sort_coupons($coupons) {
    if (!is_array($coupons)) return array();
    usort($coupons, function ($a, $b) {
        $ac = trim((string) (isset($a["code"]) ? $a["code"] : ""));
        $bc = trim((string) (isset($b["code"]) ? $b["code"] : ""));
        return strcasecmp($ac, $bc);
    });
    return $coupons;
}

function validate_coupon_record($coupons, $code) {
    $row = find_coupon_by_code($coupons, $code);
    if (!$row) {
        return array("valid" => false, "error" => "invalid_code");
    }
    if (empty($row["active"])) {
        return array("valid" => false, "error" => "inactive");
    }
    if (!empty($row["expiresAt"]) && now_ms() > intval($row["expiresAt"])) {
        return array("valid" => false, "error" => "expired");
    }
    if (!empty($row["usageLimit"])) {
        $limit = intval($row["usageLimit"]);
        $used = isset($row["usedCount"]) ? max(0, intval($row["usedCount"])) : 0;
        if ($limit > 0 && $used >= $limit) {
            return array("valid" => false, "error" => "usage_limit");
        }
    }
    $type = isset($row["discountType"]) ? (string) $row["discountType"] : "";
    $value = isset($row["discountValue"]) ? floatval($row["discountValue"]) : 0;
    if ($value <= 0) {
        return array("valid" => false, "error" => "invalid_value");
    }
    if ($type === "percent" && $value > 100) {
        return array("valid" => false, "error" => "invalid_value");
    }
    return array("valid" => true, "coupon" => $row);
}

function redeem_coupon(&$coupons, $code) {
    $row = find_coupon_by_code($coupons, $code);
    if (!$row) return false;
    $idx = find_coupon_index($coupons, isset($row["id"]) ? $row["id"] : "");
    if ($idx < 0) return false;
    $used = (isset($row["usedCount"]) ? max(0, intval($row["usedCount"])) : 0) + 1;
    $active = !isset($row["active"]) || !!$row["active"];
    if (!empty($row["usageLimit"])) {
        $limit = intval($row["usageLimit"]);
        if ($limit > 0 && $used >= $limit) $active = false;
    }
    $record = normalize_coupon_record(array(
        "id" => isset($row["id"]) ? $row["id"] : "",
        "code" => isset($row["code"]) ? $row["code"] : "",
        "label" => isset($row["label"]) ? $row["label"] : "",
        "discountType" => isset($row["discountType"]) ? $row["discountType"] : "percent",
        "discountValue" => isset($row["discountValue"]) ? $row["discountValue"] : 0,
        "active" => $active,
        "expiresAt" => isset($row["expiresAt"]) ? $row["expiresAt"] : null,
        "usageLimit" => isset($row["usageLimit"]) ? $row["usageLimit"] : null,
        "usedCount" => $used,
        "createdAt" => isset($row["createdAt"]) ? $row["createdAt"] : now_ms(),
        "updatedAt" => now_ms()
    ), isset($row["id"]) ? $row["id"] : "");
    $coupons[$idx] = $record;
    return true;
}

function read_hardware($hardwareFile) {
    $raw = read_json_file($hardwareFile, array());
    return is_array($raw) ? array_values($raw) : array();
}

function write_hardware($hardwareFile, $devices) {
    if (!is_array($devices)) $devices = array();
    write_json_file($hardwareFile, array_values($devices));
}

function new_hardware_id() {
    return "hw_" . bin2hex(random_bytes(8));
}

function default_station_for_type($type) {
    $map = array(
        "waiter_pager" => "waiter",
        "kitchen_printer" => "kitchen",
        "kds" => "kitchen",
        "bar_printer" => "bar",
        "receipt_printer" => "cashier"
    );
    return isset($map[$type]) ? $map[$type] : "general";
}

function normalize_hardware($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $types = array("waiter_pager", "kitchen_printer", "bar_printer", "receipt_printer", "kds", "other");
    $stations = array("waiter", "kitchen", "bar", "cashier", "general");
    $connections = array("network", "usb", "bluetooth", "serial", "cloud");
    $type = isset($raw["type"]) ? trim((string) $raw["type"]) : "other";
    if (!in_array($type, $types, true)) $type = "other";
    $station = isset($raw["station"]) ? trim((string) $raw["station"]) : "";
    if (!in_array($station, $stations, true)) $station = default_station_for_type($type);
    $connection = isset($raw["connection"]) ? trim((string) $raw["connection"]) : "network";
    if (!in_array($connection, $connections, true)) $connection = "network";
    $paper = isset($raw["paperWidth"]) ? trim((string) $raw["paperWidth"]) : "";
    if ($paper !== "58" && $paper !== "80") {
        $paper = in_array($type, array("kitchen_printer", "bar_printer", "receipt_printer"), true) ? "80" : "";
    }
    $copies = isset($raw["copies"]) ? intval($raw["copies"]) : 1;
    if ($copies < 1) $copies = 1;
    if ($copies > 9) $copies = 9;
    $name = clip_text(trim((string) (isset($raw["name"]) ? $raw["name"] : "")), 80);
    if ($name === "") $name = "دستگاه بدون نام";
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : ""));
    if ($id === "") $id = $fallbackId !== "" ? $fallbackId : new_hardware_id();
    $created = isset($raw["createdAt"]) ? intval($raw["createdAt"]) : now_ms();
    if ($created <= 0) $created = now_ms();
    $codePage = clip_text(trim((string) (isset($raw["codePage"]) ? $raw["codePage"] : "utf8")), 24);
    if ($codePage === "") $codePage = "utf8";
    return array(
        "id" => $id,
        "name" => $name,
        "type" => $type,
        "station" => $station,
        "connection" => $connection,
        "address" => clip_text(trim((string) (isset($raw["address"]) ? $raw["address"] : "")), 120),
        "port" => clip_text(trim((string) (isset($raw["port"]) ? $raw["port"] : "")), 20),
        "paperWidth" => $paper,
        "copies" => $copies,
        "enabled" => !isset($raw["enabled"]) || !!$raw["enabled"],
        "notes" => clip_text(trim((string) (isset($raw["notes"]) ? $raw["notes"] : "")), 240),
        "isDefault" => !empty($raw["isDefault"]),
        "codePage" => $codePage,
        "manufacturer" => clip_text(trim((string) (isset($raw["manufacturer"]) ? $raw["manufacturer"] : "")), 80),
        "model" => clip_text(trim((string) (isset($raw["model"]) ? $raw["model"] : "")), 80),
        "vendorId" => clip_text(trim((string) (isset($raw["vendorId"]) ? $raw["vendorId"] : "")), 16),
        "productId" => clip_text(trim((string) (isset($raw["productId"]) ? $raw["productId"] : "")), 16),
        "cupsQueue" => clip_text(trim((string) (isset($raw["cupsQueue"]) ? $raw["cupsQueue"] : "")), 80),
        "createdAt" => $created,
        "updatedAt" => now_ms()
    );
}

function hardware_fingerprint($row) {
    if (!is_array($row)) return "";
    $kind = isset($row["connection"]) ? strtolower(trim((string) $row["connection"])) : "network";
    $address = isset($row["address"]) ? strtolower(trim((string) $row["address"])) : "";
    $port = isset($row["port"]) ? trim((string) $row["port"]) : "";
    $vid = isset($row["vendorId"]) ? strtolower(trim((string) $row["vendorId"])) : "";
    $pid = isset($row["productId"]) ? strtolower(trim((string) $row["productId"])) : "";
    $queue = isset($row["cupsQueue"]) ? strtolower(trim((string) $row["cupsQueue"])) : "";
    if ($kind === "network") return "net|" . $address . "|" . ($port !== "" ? $port : "9100");
    if ($kind === "bluetooth") return "bt|" . $address;
    if ($kind === "usb") {
        if ($queue !== "") return "cups|" . $queue;
        return "usb|" . $vid . "|" . $pid . "|" . $address;
    }
    return $kind . "|" . $address . "|" . $port;
}

function escpos_paper_cols($width) {
    return strval($width) === "58" ? 32 : 48;
}

/** @return bool */
function escpos_has_persian($text) {
    return (bool) preg_match('/[\x{0600}-\x{06FF}\x{0750}-\x{077F}\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]/u', strval($text));
}

function escpos_to_persian_digits($text) {
    return strtr(strval($text), array(
        "0" => "۰", "1" => "۱", "2" => "۲", "3" => "۳", "4" => "۴",
        "5" => "۵", "6" => "۶", "7" => "۷", "8" => "۸", "9" => "۹",
    ));
}

function escpos_arabic_forms() {
    static $forms = null;
    if ($forms !== null) return $forms;
    // isolated, final, initial, medial
    $forms = array(
        "ا" => array("ﺍ", "ﺎ", "ﺍ", "ﺎ"),
        "آ" => array("ﺁ", "ﺂ", "ﺁ", "ﺂ"),
        "ب" => array("ﺏ", "ﺐ", "ﺑ", "ﺒ"),
        "پ" => array("ﭖ", "ﭗ", "ﭘ", "ﭙ"),
        "ت" => array("ﺕ", "ﺖ", "ﺗ", "ﺘ"),
        "ث" => array("ﺙ", "ﺚ", "ﺛ", "ﺜ"),
        "ج" => array("ﺝ", "ﺞ", "ﺟ", "ﺠ"),
        "چ" => array("ﭺ", "ﭻ", "ﭼ", "ﭽ"),
        "ح" => array("ﺡ", "ﺢ", "ﺣ", "ﺤ"),
        "خ" => array("ﺥ", "ﺦ", "ﺧ", "ﺨ"),
        "د" => array("ﺩ", "ﺪ", "ﺩ", "ﺪ"),
        "ذ" => array("ﺫ", "ﺬ", "ﺫ", "ﺬ"),
        "ر" => array("ﺭ", "ﺮ", "ﺭ", "ﺮ"),
        "ز" => array("ﺯ", "ﺰ", "ﺯ", "ﺰ"),
        "ژ" => array("ﮊ", "ﮋ", "ﮊ", "ﮋ"),
        "س" => array("ﺱ", "ﺲ", "ﺳ", "ﺴ"),
        "ش" => array("ﺵ", "ﺶ", "ﺷ", "ﺸ"),
        "ص" => array("ﺹ", "ﺺ", "ﺻ", "ﺼ"),
        "ض" => array("ﺽ", "ﺾ", "ﺿ", "ﻀ"),
        "ط" => array("ﻁ", "ﻂ", "ﻃ", "ﻄ"),
        "ظ" => array("ﻅ", "ﻆ", "ﻇ", "ﻈ"),
        "ع" => array("ﻉ", "ﻊ", "ﻋ", "ﻌ"),
        "غ" => array("ﻍ", "ﻎ", "ﻏ", "ﻐ"),
        "ف" => array("ﻑ", "ﻒ", "ﻓ", "ﻔ"),
        "ق" => array("ﻕ", "ﻖ", "ﻗ", "ﻘ"),
        "ک" => array("ﮎ", "ﮏ", "ﮐ", "ﮑ"),
        "ك" => array("ﻙ", "ﻚ", "ﻛ", "ﻜ"),
        "گ" => array("ﮒ", "ﮓ", "ﮔ", "ﮕ"),
        "ل" => array("ﻝ", "ﻞ", "ﻟ", "ﻠ"),
        "م" => array("ﻡ", "ﻢ", "ﻣ", "ﻤ"),
        "ن" => array("ﻥ", "ﻦ", "ﻧ", "ﻨ"),
        "و" => array("ﻭ", "ﻮ", "ﻭ", "ﻮ"),
        "ه" => array("ﻩ", "ﻪ", "ﻫ", "ﻬ"),
        "ی" => array("ﯼ", "ﯽ", "ﯾ", "ﯿ"),
        "ي" => array("ﻱ", "ﻲ", "ﻳ", "ﻴ"),
        "ة" => array("ﺓ", "ﺔ", "ﺓ", "ﺔ"),
        "ى" => array("ﻯ", "ﻰ", "ﻯ", "ﻰ"),
        "ء" => array("ء", "ء", "ء", "ء"),
    );
    return $forms;
}

function escpos_dual_connecting() {
    static $set = null;
    if ($set !== null) return $set;
    $non = array("ا", "آ", "د", "ذ", "ر", "ز", "ژ", "و", "ة", "ى", "ء");
    $set = array();
    foreach (array_keys(escpos_arabic_forms()) as $ch) {
        if (!in_array($ch, $non, true)) $set[$ch] = true;
    }
    return $set;
}

function escpos_reshape_arabic($text) {
    $forms = escpos_arabic_forms();
    $dual = escpos_dual_connecting();
    $chars = preg_split("//u", strval($text), -1, PREG_SPLIT_NO_EMPTY);
    if (!$chars) return "";
    $n = count($chars);
    $out = array();
    for ($i = 0; $i < $n; $i++) {
        $ch = $chars[$i];
        if (!isset($forms[$ch])) {
            $out[] = $ch;
            continue;
        }
        $prev = $i > 0 ? $chars[$i - 1] : "";
        $nxt = $i + 1 < $n ? $chars[$i + 1] : "";
        $joinPrev = isset($dual[$prev]) && isset($forms[$ch]);
        $joinNext = isset($dual[$ch]) && isset($forms[$nxt]);
        if ($joinPrev && $joinNext) $out[] = $forms[$ch][3];
        elseif ($joinPrev) $out[] = $forms[$ch][1];
        elseif ($joinNext) $out[] = $forms[$ch][2];
        else $out[] = $forms[$ch][0];
    }
    return implode("", $out);
}

function escpos_reverse_rtl($text) {
    $parts = preg_split('/([A-Za-z0-9]+)/u', strval($text), -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
    if (!$parts) return "";
    return implode("", array_reverse($parts));
}

function escpos_prepare_rtl_line($text, $persianDigits = true) {
    $s = strval($text);
    if ($persianDigits) $s = escpos_to_persian_digits($s);
    if (!escpos_has_persian($s)) return $s;
    if (class_exists("Normalizer")) {
        $n = Normalizer::normalize($s, Normalizer::FORM_C);
        if ($n !== false) $s = $n;
    }
    $s = preg_replace_callback(
        '/[\x{0600}-\x{06FF}\x{0750}-\x{077F}\x{FB50}-\x{FDFF}\x{FE70}-\x{FEFF}]+/u',
        function ($m) {
            return escpos_reshape_arabic($m[0]);
        },
        $s
    );
    return escpos_reverse_rtl($s);
}

function escpos_encode($text, $codePage = "utf8") {
    $text = strval($text);
    if ($codePage === "utf8" || $codePage === "") return $text;
    if (function_exists("iconv")) {
        $map = array(
            "pc437" => "CP437",
            "pc850" => "CP850",
            "wpc1252" => "Windows-1252",
            "wpc1256" => "Windows-1256",
            "pc864" => "CP864"
        );
        $to = isset($map[$codePage]) ? $map[$codePage] : "UTF-8";
        $converted = @iconv("UTF-8", $to . "//IGNORE", $text);
        if ($converted !== false) return $converted;
    }
    return $text;
}

function escpos_test_receipt($connectionType = "network", $paperWidth = "80", $codePage = "utf8") {
    $cols = escpos_paper_cols($paperWidth);
    $sep = str_repeat("=", $cols);
    $when = date("Y-m-d H:i:s");
    $kind = strtoupper(strval($connectionType));
    $body = $sep . "\n"
        . "   PRINTER TEST\n"
        . $sep . "\n"
        . "Connection: SUCCESS\n"
        . "Type: " . $kind . "\n"
        . "Date: " . $when . "\n"
        . $sep . "\n\n\n";
    $out = "\x1B\x40";
    $out .= "\x1B\x61\x01";
    $out .= escpos_encode($body, $codePage);
    $out .= "\x1D\x56\x01";
    return $out;
}

function escpos_fit_cell($text, $width, $align = "left") {
    $s = strval($text);
    $width = max(0, intval($width));
    $len = function_exists("mb_strlen") ? mb_strlen($s, "UTF-8") : strlen($s);
    while ($len > $width && $s !== "") {
        $s = function_exists("mb_substr") ? mb_substr($s, 0, -1, "UTF-8") : substr($s, 0, -1);
        $len = function_exists("mb_strlen") ? mb_strlen($s, "UTF-8") : strlen($s);
    }
    $pad = $width - $len;
    if ($pad <= 0) return $s;
    $spaces = str_repeat(" ", $pad);
    if ($align === "right") return $spaces . $s;
    if ($align === "center") {
        $left = intdiv($pad, 2);
        return str_repeat(" ", $left) . $s . str_repeat(" ", $pad - $left);
    }
    return $s . $spaces;
}

function escpos_money($value) {
    return number_format(intval(round(floatval($value))), 0, ".", ",");
}

function escpos_generate_receipt($data) {
    if (!is_array($data)) $data = array();
    $mode = isset($data["mode"]) ? strtolower(trim((string) $data["mode"])) : (isset($data["ticketType"]) ? strtolower(trim((string) $data["ticketType"])) : "receipt");
    if (in_array($mode, array("station", "kitchen", "bar", "ticket"), true)) {
        return escpos_generate_station_ticket($data);
    }
    return escpos_generate_invoice($data);
}

function escpos_generate_invoice($data) {
    if (!is_array($data)) $data = array();
    $paper = isset($data["paperWidth"]) ? strval($data["paperWidth"]) : "80";
    $codePage = isset($data["codePage"]) ? strval($data["codePage"]) : "utf8";
    $cols = escpos_paper_cols($paper);
    if ($cols <= 32) {
        $wTotal = 9; $wQty = 3; $wUnit = 8; $wName = 12;
        $side = 10;
    } else {
        $wTotal = 12; $wQty = 4; $wUnit = 10; $wName = 22;
        $side = 14;
    }
    $mid = max(4, $cols - $side * 2);
    $storeEn = isset($data["storeName"]) ? strval($data["storeName"]) : (isset($data["storeNameEn"]) ? strval($data["storeNameEn"]) : "Cafe");
    $storeFa = isset($data["storeNameFa"]) ? trim(strval($data["storeNameFa"])) : "";

    $cell = function ($text, $width, $align = "left", $rtl = true) {
        $raw = strval($text);
        if ($rtl && escpos_has_persian($raw)) {
            $raw = escpos_prepare_rtl_line($raw, false);
        }
        return escpos_fit_cell($raw, $width, $align);
    };

    $timeS = isset($data["time"]) ? trim(strval($data["time"])) : "";
    $dateS = isset($data["dateJalali"]) ? trim(strval($data["dateJalali"])) : (isset($data["date"]) ? trim(strval($data["date"])) : "");
    $when = isset($data["datetime"]) ? strval($data["datetime"]) : "";
    if ($timeS === "") {
        if ($when !== "" && strpos($when, " ") !== false) {
            $parts = explode(" ", $when);
            $timeS = end($parts);
            if (strlen($timeS) === 5) $timeS .= ":00";
        } else {
            $timeS = date("H:i:s");
        }
    }
    if ($dateS === "") $dateS = $when !== "" ? substr($when, 0, 10) : date("Y/m/d");
    $invNo = isset($data["receiptNumber"]) ? trim(strval($data["receiptNumber"])) : "—";
    if ($invNo === "") $invNo = "—";

    $out = "\x1B\x40";
    if ($codePage === "wpc1256") $out .= "\x1B\x74\x32";
    $out .= "\x1B\x33\x1C";

    $emitRaw = function ($text) use (&$out, $codePage) {
        $out .= escpos_encode($text, $codePage);
    };

    $out .= "\x1B\x61\x00";
    $out .= "\x1D\x42\x01";
    $emitRaw($cell($timeS, $side, "left", false));
    $out .= "\x1D\x42\x00";
    $emitRaw(escpos_fit_cell("", $mid, "center"));
    $out .= "\x1D\x42\x01";
    $emitRaw($cell("شماره فاکتور", $side, "right"));
    $out .= "\n\x1D\x42\x00";

    $out .= "\x1D\x42\x01";
    $emitRaw($cell($dateS, $side, "left", false));
    $out .= "\x1D\x42\x00";
    $emitRaw(escpos_fit_cell("", $mid, "center"));
    $out .= "\x1D\x42\x01";
    $emitRaw($cell($invNo, $side, "right", false));
    $out .= "\n\x1D\x42\x00";

    $out .= "\x1B\x61\x01\x1D\x21\x11\x1B\x45\x01";
    $emitRaw($storeEn . "\n");
    $out .= "\x1B\x45\x00\x1D\x21\x00";
    if ($storeFa !== "" && strtolower($storeFa) !== strtolower($storeEn)) {
        $emitRaw(escpos_prepare_rtl_line($storeFa, false) . "\n");
    }
    $out .= "\x1B\x61\x00";
    $emitRaw(str_repeat("=", $cols) . "\n");

    $customer = isset($data["customer"]) ? trim(strval($data["customer"])) : "";
    $location = isset($data["location"]) ? trim(strval($data["location"])) : "";
    if ($location === "" && isset($data["table"]) && strval($data["table"]) !== "") {
        $location = "میز " . $data["table"];
    }
    $locLine = $location !== "" ? "مکان: " . $location : "";
    $custLine = $customer !== "" ? "مشتری: " . $customer : "مشتری: —";
    $half = intdiv($cols, 2);
    $emitRaw($cell($locLine, $half, "left") . $cell($custLine, $cols - $half, "right") . "\n");
    $emitRaw(str_repeat("-", $cols) . "\n");

    $header = $cell("قیمت کل", $wTotal, "left")
        . $cell("تعداد", $wQty, "center")
        . $cell("فی", $wUnit, "center")
        . $cell("نام", $wName, "right");
    $out .= "\x1D\x42\x01";
    $emitRaw(escpos_fit_cell($header, $cols, "left") . "\n");
    $out .= "\x1D\x42\x00";

    $items = isset($data["items"]) && is_array($data["items"]) ? $data["items"] : array();
    if (!$items) {
        $out .= "\x1B\x61\x01";
        $emitRaw(escpos_prepare_rtl_line("بدون آیتم", false) . "\n");
        $out .= "\x1B\x61\x00";
    }
    foreach ($items as $row) {
        if (!is_array($row)) continue;
        $name = isset($row["name"]) ? strval($row["name"]) : "آیتم";
        $qty = isset($row["qty"]) ? $row["qty"] : (isset($row["count"]) ? $row["count"] : 1);
        $qtyLabel = (is_numeric($qty) && floatval($qty) == intval($qty)) ? strval(intval($qty)) : strval($qty);
        $unit = isset($row["unitPrice"]) ? floatval($row["unitPrice"]) : (isset($row["price"]) ? floatval($row["price"]) : 0);
        $amount = isset($row["amount"]) ? floatval($row["amount"]) : (isset($row["line"]) ? floatval($row["line"]) : ($unit * floatval($qty)));
        $shaped = escpos_prepare_rtl_line($name, false);
        $nameLen = function_exists("mb_strlen") ? mb_strlen($shaped, "UTF-8") : strlen($shaped);
        if ($nameLen > $wName) {
            $emitRaw($cell($name, $cols, "right") . "\n");
            $nameCell = str_repeat(" ", $wName);
        } else {
            $nameCell = $cell($name, $wName, "right");
        }
        $line = $cell(escpos_money($amount), $wTotal, "left", false)
            . $cell($qtyLabel, $wQty, "center", false)
            . $cell(escpos_money($unit), $wUnit, "right", false)
            . $nameCell;
        $emitRaw($line . "\n");
    }

    $emitRaw(str_repeat("-", $cols) . "\n");
    $sumRow = function ($label, $value) use ($cell, $cols, $emitRaw) {
        $emitRaw($cell(escpos_money($value), 16, "left", false) . $cell($label, $cols - 16, "right") . "\n");
    };
    if (isset($data["subtotal"])) $sumRow("جمع کل", $data["subtotal"]);
    if (!empty($data["discount"])) $sumRow("تخفیف", $data["discount"]);
    if (!empty($data["tax"])) $sumRow("مالیات بر ارزش افزوده", $data["tax"]);
    $total = isset($data["total"]) ? $data["total"] : (isset($data["subtotal"]) ? $data["subtotal"] : 0);
    $currency = isset($data["currency"]) ? strval($data["currency"]) : "تومان";
    $emitRaw("\n");
    $pay = $cell(escpos_money($total) . " " . $currency, 22, "left", false) . $cell("قابل پرداخت", $cols - 22, "right");
    $out .= "\x1D\x21\x01\x1D\x42\x01";
    $emitRaw(escpos_fit_cell($pay, $cols, "left") . "\n");
    $out .= "\x1D\x42\x00\x1D\x21\x00";

    if (!empty($data["payment"])) {
        $half = intdiv($cols, 2);
        $emitRaw($cell(strval($data["payment"]), $half, "left", false) . $cell("پرداخت", $cols - $half, "right") . "\n");
    }

    $emitRaw(str_repeat("-", $cols) . "\n");
    $out .= "\x1B\x61\x01";
    $footer = isset($data["footer"]) ? trim(strval($data["footer"])) : "به امید دیدار مجدد";
    $emitRaw(escpos_prepare_rtl_line($footer, false) . "\n");
    if ($storeFa !== "") $emitRaw(escpos_prepare_rtl_line($storeFa, false) . "\n");
    if (!empty($data["phone"])) $emitRaw("تلفن: " . $data["phone"] . "\n");
    if (!empty($data["address"])) $emitRaw(escpos_prepare_rtl_line(strval($data["address"]), false) . "\n");
    $out .= "\n\n\n";
    $out .= "\x1D\x56\x01";
    return $out;
}

function escpos_generate_station_ticket($data) {
    if (!is_array($data)) $data = array();
    $paper = isset($data["paperWidth"]) ? strval($data["paperWidth"]) : "80";
    $codePage = isset($data["codePage"]) ? strval($data["codePage"]) : "utf8";
    $cols = escpos_paper_cols($paper);
    $stationRaw = strtolower(strval(isset($data["station"]) ? $data["station"] : (isset($data["subtitle"]) ? $data["subtitle"] : "")));
    $isBar = (strpos($stationRaw, "bar") !== false) || (strpos(strval(isset($data["subtitle"]) ? $data["subtitle"] : ""), "بار") !== false);
    $stationFa = $isBar ? "بار" : "آشپزخانه";
    $stationEn = $isBar ? "BAR" : "KITCHEN";

    $out = "\x1B\x40"; // init
    if ($codePage === "wpc1256") $out .= "\x1B\x74\x32";
    $out .= "\x1B\x61\x01"; // center

    $emit = function ($text, $big = false, $bold = false) use (&$out, $codePage) {
        $line = escpos_prepare_rtl_line($text);
        if ($bold) $out .= "\x1B\x45\x01";
        if ($big) $out .= "\x1D\x21\x11";
        $out .= escpos_encode($line . "\n", $codePage);
        if ($big) $out .= "\x1D\x21\x00";
        if ($bold) $out .= "\x1B\x45\x00";
    };

    $emit(str_repeat("=", $cols));
    $emit($stationFa, true, true);
    $emit($stationEn);
    $emit(str_repeat("=", $cols));

    if (isset($data["table"]) && strval($data["table"]) !== "") {
        $emit("میز " . $data["table"], true, true);
    }
    $when = isset($data["datetime"]) ? strval($data["datetime"]) : date("H:i");
    if (strpos($when, " ") !== false) {
        $parts = explode(" ", $when);
        $when = end($parts);
    }
    $emit("ساعت " . $when);
    $emit(str_repeat("-", $cols));

    $out .= "\x1B\x61\x00"; // left for items
    $items = isset($data["items"]) && is_array($data["items"]) ? $data["items"] : array();
    if (!$items) {
        $out .= "\x1B\x61\x01";
        $emit("بدون آیتم");
        $out .= "\x1B\x61\x00";
    } else {
        foreach ($items as $i => $row) {
            if (!is_array($row)) continue;
            $name = isset($row["name"]) ? strval($row["name"]) : "آیتم";
            $qty = isset($row["qty"]) ? $row["qty"] : (isset($row["count"]) ? $row["count"] : 1);
            $qtyLabel = (is_numeric($qty) && floatval($qty) == intval($qty)) ? strval(intval($qty)) : strval($qty);
            $emit("×" . $qtyLabel . "  " . $name, true, true);
            if (!empty($row["toppings"]) && is_array($row["toppings"])) {
                foreach ($row["toppings"] as $top) {
                    $tname = is_array($top) ? (isset($top["name"]) ? $top["name"] : "") : strval($top);
                    if ($tname !== "") $emit("   + " . $tname);
                }
            }
            if ($i < count($items) - 1) $out .= "\n";
        }
    }

    $out .= "\x1B\x61\x01";
    $emit(str_repeat("=", $cols));
    $emit(isset($data["footer"]) ? strval($data["footer"]) : "سفارش جدید");
    if (!empty($data["storeName"])) $emit(strval($data["storeName"]));
    $out .= "\n\n";
    $out .= "\x1D\x56\x01";
    return $out;
}

function printer_network_send($host, $port, $payload, $timeout = 4.0) {
    $host = trim((string) $host);
    $port = intval($port);
    if ($port <= 0) $port = 9100;
    if ($host === "") {
        return array("ok" => false, "error" => "unavailable", "message" => "Network printer address is missing");
    }
    $errno = 0;
    $errstr = "";
    $fp = @fsockopen($host, $port, $errno, $errstr, $timeout);
    if (!$fp) {
        return array("ok" => false, "error" => "unavailable", "message" => "Network printer is not reachable");
    }
    stream_set_timeout($fp, intval($timeout));
    $written = @fwrite($fp, $payload);
    @fclose($fp);
    if ($written === false) {
        return array("ok" => false, "error" => "communication_error", "message" => "Failed to send data to printer");
    }
    return array("ok" => true, "type" => "network", "bytes" => strlen($payload));
}

function printer_send($printer, $payload) {
    if (!is_array($printer)) {
        return array("ok" => false, "error" => "unavailable", "message" => "Printer not found");
    }
    $kind = isset($printer["connection"]) ? strtolower(trim((string) $printer["connection"])) : "network";
    if ($kind === "network") {
        return printer_network_send(
            isset($printer["address"]) ? $printer["address"] : "",
            isset($printer["port"]) ? $printer["port"] : 9100,
            $payload
        );
    }
    return array(
        "ok" => false,
        "error" => "unsupported",
        "message" => "Bluetooth/USB printing requires the local POS API host"
    );
}

function find_printer_for_request($devices, $body) {
    if (isset($body["printer"]) && is_array($body["printer"])) return $body["printer"];
    $id = trim((string) (isset($body["printerId"]) ? $body["printerId"] : (isset($body["id"]) ? $body["id"] : "")));
    if ($id !== "") {
        foreach ($devices as $row) {
            if (is_array($row) && isset($row["id"]) && (string) $row["id"] === $id) return $row;
        }
        return null;
    }
    $fallback = null;
    foreach ($devices as $row) {
        if (!is_array($row)) continue;
        $type = isset($row["type"]) ? (string) $row["type"] : "";
        if (!in_array($type, array("kitchen_printer", "bar_printer", "receipt_printer"), true)) continue;
        if (isset($row["enabled"]) && !$row["enabled"]) continue;
        if (!empty($row["isDefault"])) return $row;
        if ($type === "receipt_printer" && $fallback === null) $fallback = $row;
        if ($fallback === null) $fallback = $row;
    }
    return $fallback;
}

function discover_network_printers_php($port = 9100) {
    $local = isset($_SERVER["SERVER_ADDR"]) ? (string) $_SERVER["SERVER_ADDR"] : "";
    if ($local === "" || $local === "127.0.0.1" || $local === "::1") {
        $local = gethostbyname(gethostname());
    }
    $parts = explode(".", $local);
    if (count($parts) !== 4) {
        return array(
            "ok" => true,
            "type" => "network",
            "localIp" => $local,
            "subnet" => "",
            "scanned" => 0,
            "printers" => array(),
            "message" => "Could not detect a local IPv4 subnet on this host. Prefer the local POS API for full discovery."
        );
    }
    $prefix = $parts[0] . "." . $parts[1] . "." . $parts[2];
    $octets = array(1, 2, 5, 10, 20, 25, 30, 40, 50, 51, 52, 53, 54, 55, 60, 70, 80, 90, 100, 110, 120, 150, 180, 200, 210, 220, 230, 240, 250);
    $found = array();
    foreach ($octets as $i) {
        $ip = $prefix . "." . $i;
        if ($ip === $local) continue;
        $errno = 0;
        $errstr = "";
        $fp = @fsockopen($ip, intval($port), $errno, $errstr, 0.15);
        if ($fp) {
            @fclose($fp);
            $found[] = array(
                "id" => "net:" . $ip . ":" . $port,
                "name" => "Printer " . $ip,
                "hostname" => "",
                "address" => $ip,
                "port" => strval($port),
                "connection" => "network",
                "status" => "online",
                "likelyThermal" => true,
                "manufacturer" => "",
                "model" => ""
            );
        }
    }
    return array(
        "ok" => true,
        "type" => "network",
        "localIp" => $local,
        "subnet" => $prefix . ".0/24",
        "scanned" => count($octets),
        "printers" => $found,
        "message" => count($found) ? "" : "No printers found on common addresses. Enter IP manually or use full scan via local API."
    );
}

function find_hardware_index($devices, $id) {
    $id = trim((string) $id);
    if ($id === "" || !is_array($devices)) return -1;
    foreach ($devices as $i => $row) {
        if (is_array($row) && isset($row["id"]) && (string) $row["id"] === $id) return $i;
    }
    return -1;
}

function sort_hardware($devices) {
    if (!is_array($devices)) return array();
    $order = array(
        "waiter_pager" => 0,
        "kitchen_printer" => 1,
        "bar_printer" => 2,
        "receipt_printer" => 3,
        "kds" => 4,
        "other" => 5
    );
    usort($devices, function ($a, $b) use ($order) {
        $ta = is_array($a) && isset($a["type"]) ? (string) $a["type"] : "other";
        $tb = is_array($b) && isset($b["type"]) ? (string) $b["type"] : "other";
        $oa = isset($order[$ta]) ? $order[$ta] : 9;
        $ob = isset($order[$tb]) ? $order[$tb] : 9;
        if ($oa !== $ob) return $oa - $ob;
        $na = is_array($a) && isset($a["name"]) ? (string) $a["name"] : "";
        $nb = is_array($b) && isset($b["name"]) ? (string) $b["name"] : "";
        return strcmp($na, $nb);
    });
    return array_values($devices);
}

ensure_dir($dataDir);
ensure_json_file($ordersFile, "[]");
ensure_json_file($sessionsFile, "{}");
ensure_json_file($menuFile, "{}");
ensure_json_file($tablesFile, "{}");
ensure_json_file($invoicesFile, "[]");
ensure_json_file($customersFile, "[]");
ensure_json_file($settingsFile, "{}");
ensure_json_file($couponsFile, "[]");
ensure_json_file($hardwareFile, "[]");
ensure_json_file($reservationsFile, "[]");

$route = isset($_GET["route"]) ? $_GET["route"] : "";
$id = isset($_GET["id"]) ? $_GET["id"] : "";
$method = $_SERVER["REQUEST_METHOD"];
$body = ($method === "GET") ? array() : read_body();
if ($body === null) {
    send_json(400, array("error" => "invalid_json"));
}

$session = read_session($sessionsFile, $body);
$sandboxId = "";
if ($session && $session["role"] === "dev") {
    $sandboxId = $session["sandbox"] !== "" ? $session["sandbox"] : "dev";
} elseif (!$session) {
    $sandboxId = request_sandbox_id($body);
}
if ($sandboxId !== "") {
    apply_sandbox_store($dataDir, $ordersFile, $menuFile, $tablesFile, $invoicesFile, $customersFile, $uploadsDir, $sandboxId);
}

if (strpos((string) $route, "sa-") === 0 && function_exists("lumiere_super_admin_handle")) {
    $saHeaders = array();
    if (!empty($_SERVER["HTTP_X_SUPER_ADMIN_TOKEN"])) {
        $saHeaders["X-Super-Admin-Token"] = $_SERVER["HTTP_X_SUPER_ADMIN_TOKEN"];
    }
    if (!empty($_SERVER["HTTP_AUTHORIZATION"])) {
        $saHeaders["Authorization"] = $_SERVER["HTTP_AUTHORIZATION"];
    }
    if (!empty($_SERVER["HTTP_X_FORWARDED_FOR"])) {
        $saHeaders["X-Forwarded-For"] = $_SERVER["HTTP_X_FORWARDED_FOR"];
    }
    if (!empty($_SERVER["HTTP_X_REAL_IP"])) {
        $saHeaders["X-Real-IP"] = $_SERVER["HTTP_X_REAL_IP"];
    }
    if (!empty($_SERVER["REMOTE_ADDR"])) {
        $saHeaders["Remote-Addr"] = $_SERVER["REMOTE_ADDR"];
    }
    $saResult = lumiere_super_admin_handle($method, $route, $id, $body, $saHeaders);
    if (is_array($saResult)) {
        send_json(
            isset($saResult["status"]) ? intval($saResult["status"]) : 500,
            isset($saResult["body"]) && is_array($saResult["body"]) ? $saResult["body"] : array()
        );
    }
}

if ($route === "health") {
    $health = array("ok" => true);
    if (lumiere_db_enabled()) {
        $health = array_merge($health, lumiere_storage_health());
    } else {
        $health["database"] = "json_files";
    }
    send_json(200, $health);
}

if ($route === "login" && $method === "POST") {
    $password = "";
    $devAccounts = array();
    if (is_file($secretFile)) {
        include $secretFile;
        if (isset($CASHIER_PASSWORD)) $password = (string) $CASHIER_PASSWORD;
        if (isset($DEV_PASSWORD) && (string) $DEV_PASSWORD !== "") {
            $devAccounts["dev"] = (string) $DEV_PASSWORD;
        }
        if (isset($DEV_PASSWORD_2) && (string) $DEV_PASSWORD_2 !== "") {
            $devAccounts["dev2"] = (string) $DEV_PASSWORD_2;
        }
        if (isset($DEV_ACCOUNTS) && is_array($DEV_ACCOUNTS)) {
            foreach ($DEV_ACCOUNTS as $sid => $spass) {
                $sid = sanitize_sandbox_id($sid);
                if ($sid === "" || (string) $spass === "") continue;
                $devAccounts[$sid] = (string) $spass;
            }
        }
    }
    $entered = isset($body["password"]) ? (string) $body["password"] : "";
    $role = "";
    $sandbox = "";
    if (secret_matches($password, $entered)) {
        $role = "cashier";
    } else {
        foreach ($devAccounts as $sid => $spass) {
            if (secret_matches($spass, $entered)) {
                $role = "dev";
                $sandbox = $sid;
                break;
            }
        }
    }
    if ($role === "") {
        send_json(401, array("error" => "bad_password"));
    }
    $token = bin2hex(function_exists("random_bytes") ? random_bytes(24) : openssl_random_pseudo_bytes(24));
    $sessions = read_json_file($sessionsFile, array());
    if (!is_array($sessions)) $sessions = array();
    $sessions[$token] = array("created" => time(), "role" => $role, "sandbox" => $sandbox);
    write_json_file($sessionsFile, $sessions);
    send_json(200, array(
        "token" => $token,
        "role" => $role,
        "sandbox" => $sandbox,
        "dev" => $role === "dev"
    ));
}

if ($route === "logout" && $method === "POST") {
    $token = request_token($body);
    $sessions = read_json_file($sessionsFile, array());
    if (is_array($sessions) && $token !== "" && isset($sessions[$token])) {
        unset($sessions[$token]);
        write_json_file($sessionsFile, $sessions);
    }
    send_json(200, array("ok" => true));
}

if ($route === "menu" && $method === "GET") {
    $overrides = read_json_file($menuFile, array());
    send_json(200, array("overrides" => is_array($overrides) ? $overrides : array()));
}

if ($route === "menu" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $action = isset($body["action"]) ? (string) $body["action"] : "update";
    $overrides = read_json_file($menuFile, array());
    if (!is_array($overrides)) $overrides = array();
    if (!isset($overrides["_added"]) || !is_array($overrides["_added"])) {
        $overrides["_added"] = array();
    }
    if (!isset($overrides["_addedCategories"]) || !is_array($overrides["_addedCategories"])) {
        $overrides["_addedCategories"] = array();
    }
    if (!isset($overrides["_categories"]) || !is_array($overrides["_categories"])) {
        $overrides["_categories"] = array();
    }
    if (!isset($overrides["_categoryOrder"]) || !is_array($overrides["_categoryOrder"])) {
        $overrides["_categoryOrder"] = array();
    }

    if ($action === "add") {
        $categoryIndex = isset($body["categoryIndex"]) ? intval($body["categoryIndex"]) : -1;
        if ($categoryIndex < 0 || $categoryIndex > 2000) {
            send_json(400, array("error" => "category_required"));
        }
        if ($categoryIndex >= 1000 && !isset($overrides["_addedCategories"][(string) $categoryIndex])) {
            send_json(400, array("error" => "category_unknown"));
        }
        $name = clip_text(trim((string) (isset($body["name"]) ? $body["name"] : "")), 120);
        if ($name === "") {
            send_json(400, array("error" => "name_required"));
        }
        if (count($overrides["_added"]) >= 120) {
            send_json(400, array("error" => "too_many"));
        }
        $price = isset($body["price"]) ? floatval($body["price"]) : 0;
        if ($price < 0) $price = 0;
        $rand = bin2hex(function_exists("random_bytes") ? random_bytes(5) : openssl_random_pseudo_bytes(5));
        $itemId = "cat-" . $categoryIndex . "-custom-" . $rand;
        $now = now_ms();
        $overrides["_added"][$itemId] = array(
            "categoryIndex" => $categoryIndex,
            "name" => $name,
            "description" => clip_text(trim((string) (isset($body["description"]) ? $body["description"] : "")), 400),
            "price" => $price,
            "soldOut" => false,
            "toppings" => array(),
            "isNew" => true,
            "createdAt" => $now,
            "newAt" => $now
        );
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides, "id" => $itemId));
    }

    if ($action === "addCategory") {
        $name = clip_text(trim((string) (isset($body["name"]) ? $body["name"] : "")), 80);
        if ($name === "") {
            send_json(400, array("error" => "name_required"));
        }
        if (count($overrides["_addedCategories"]) >= 40) {
            send_json(400, array("error" => "too_many"));
        }
        $next = 1000;
        foreach ($overrides["_addedCategories"] as $key => $unused) {
            $n = intval($key);
            if ($n >= $next) $next = $n + 1;
        }
        $icon = "";
        if (!empty($body["image"])) {
            $saved = save_item_image($uploadsDir, "caticon-" . $next, $body["image"]);
            if ($saved === "") {
                send_json(400, array("error" => "image_invalid"));
            }
            $icon = $saved;
        } elseif (!empty($body["icon"])) {
            $icon = allowed_preset_icon($body["icon"]);
        }
        if ($icon === "") {
            send_json(400, array("error" => "icon_required"));
        }
        $overrides["_addedCategories"][(string) $next] = array(
            "name" => $name,
            "hidden" => false,
            "icon" => $icon
        );
        category_order_append($overrides, $next);
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides, "categoryIndex" => $next));
    }

    if ($action === "reorderCategories") {
        $order = isset($body["order"]) ? $body["order"] : array();
        $overrides["_categoryOrder"] = normalize_category_order($overrides, $order);
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    if ($action === "hideCategory") {
        $categoryIndex = isset($body["categoryIndex"]) ? intval($body["categoryIndex"]) : -1;
        $hidden = !empty($body["hidden"]);
        $key = (string) $categoryIndex;
        if ($categoryIndex >= 1000) {
            if (!isset($overrides["_addedCategories"][$key]) || !is_array($overrides["_addedCategories"][$key])) {
                send_json(400, array("error" => "category_unknown"));
            }
            $overrides["_addedCategories"][$key]["hidden"] = $hidden;
        } else {
            if ($categoryIndex < 0 || $categoryIndex > 40) {
                send_json(400, array("error" => "category_required"));
            }
            if (!isset($overrides["_categories"][$key]) || !is_array($overrides["_categories"][$key])) {
                $overrides["_categories"][$key] = array();
            }
            $overrides["_categories"][$key]["hidden"] = $hidden;
        }
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    if ($action === "deleteCategory") {
        $categoryIndex = isset($body["categoryIndex"]) ? intval($body["categoryIndex"]) : -1;
        $key = (string) $categoryIndex;
        if ($categoryIndex >= 1000) {
            if (!isset($overrides["_addedCategories"][$key])) {
                send_json(400, array("error" => "category_unknown"));
            }
            unset($overrides["_addedCategories"][$key]);
            category_order_remove($overrides, $categoryIndex);
            delete_item_images($uploadsDir, "caticon-" . $categoryIndex);
            if (isset($overrides["_added"]) && is_array($overrides["_added"])) {
                foreach ($overrides["_added"] as $itemId => $item) {
                    if (!is_array($item)) continue;
                    if (intval(isset($item["categoryIndex"]) ? $item["categoryIndex"] : -1) !== $categoryIndex) continue;
                    delete_item_images($uploadsDir, $itemId);
                    unset($overrides["_added"][$itemId]);
                }
            }
        } else {
            if ($categoryIndex < 0 || $categoryIndex > 40) {
                send_json(400, array("error" => "category_required"));
            }
            if (!isset($overrides["_categories"][$key]) || !is_array($overrides["_categories"][$key])) {
                $overrides["_categories"][$key] = array();
            }
            $overrides["_categories"][$key]["deleted"] = true;
            $overrides["_categories"][$key]["hidden"] = true;
            category_order_remove($overrides, $categoryIndex);
        }
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    if ($action === "restoreCategory") {
        $categoryIndex = isset($body["categoryIndex"]) ? intval($body["categoryIndex"]) : -1;
        if ($categoryIndex < 0 || $categoryIndex > 40) {
            send_json(400, array("error" => "category_required"));
        }
        $key = (string) $categoryIndex;
        if (isset($overrides["_categories"][$key]) && is_array($overrides["_categories"][$key])) {
            unset($overrides["_categories"][$key]["deleted"]);
            $overrides["_categories"][$key]["hidden"] = false;
        }
        category_order_append($overrides, $categoryIndex);
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    if ($action === "setCategoryIcon") {
        $categoryIndex = isset($body["categoryIndex"]) ? intval($body["categoryIndex"]) : -1;
        $iconId = "caticon-" . $categoryIndex;
        if ($categoryIndex >= 1000) {
            if (!isset($overrides["_addedCategories"][(string) $categoryIndex])) {
                send_json(400, array("error" => "category_unknown"));
            }
        } elseif ($categoryIndex < 0 || $categoryIndex > 40) {
            send_json(400, array("error" => "category_required"));
        }
        if (!empty($body["clearIcon"])) {
            delete_item_images($uploadsDir, $iconId);
            if (!set_category_icon_value($overrides, $categoryIndex, "", true)) {
                send_json(400, array("error" => "category_unknown"));
            }
        } elseif (!empty($body["icon"])) {
            $preset = allowed_preset_icon($body["icon"]);
            if ($preset === "") {
                send_json(400, array("error" => "icon_invalid"));
            }
            delete_item_images($uploadsDir, $iconId);
            if (!set_category_icon_value($overrides, $categoryIndex, $preset, false)) {
                send_json(400, array("error" => "category_unknown"));
            }
        } elseif (!empty($body["image"])) {
            $saved = save_item_image($uploadsDir, $iconId, $body["image"]);
            if ($saved === "") {
                send_json(400, array("error" => "image_invalid"));
            }
            if (!set_category_icon_value($overrides, $categoryIndex, $saved, false)) {
                send_json(400, array("error" => "category_unknown"));
            }
        } else {
            send_json(400, array("error" => "icon_required"));
        }
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    if ($action === "setCategoryStation") {
        $categoryIndex = isset($body["categoryIndex"]) ? intval($body["categoryIndex"]) : -1;
        $station = isset($body["station"]) ? strtolower(trim((string) $body["station"])) : "";
        if ($station !== "bar" && $station !== "kitchen") {
            send_json(400, array("error" => "station_invalid"));
        }
        if ($categoryIndex >= 1000) {
            if (!isset($overrides["_addedCategories"][(string) $categoryIndex])) {
                send_json(400, array("error" => "category_unknown"));
            }
        } elseif ($categoryIndex < 0 || $categoryIndex > 40) {
            send_json(400, array("error" => "category_required"));
        }
        if (!set_category_station_value($overrides, $categoryIndex, $station)) {
            send_json(400, array("error" => "category_unknown"));
        }
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    $itemId = safe_item_id(isset($body["id"]) ? $body["id"] : "");
    if ($itemId === "") {
        send_json(400, array("error" => "id_required"));
    }

    if ($action === "delete") {
        if (!is_custom_item_id($itemId) || !isset($overrides["_added"][$itemId])) {
            send_json(400, array("error" => "not_custom"));
        }
        delete_item_images($uploadsDir, $itemId);
        unset($overrides["_added"][$itemId]);
        unset($overrides[$itemId]);
        write_json_file($menuFile, $overrides);
        send_json(200, array("overrides" => $overrides));
    }

    $isCustom = is_custom_item_id($itemId) && isset($overrides["_added"][$itemId]) && is_array($overrides["_added"][$itemId]);
    if ($isCustom) {
        $current = $overrides["_added"][$itemId];
    } else {
        $current = isset($overrides[$itemId]) && is_array($overrides[$itemId]) ? $overrides[$itemId] : array();
    }
    if ($isCustom && array_key_exists("name", $body)) {
        $name = clip_text(trim((string) $body["name"]), 120);
        if ($name === "") {
            send_json(400, array("error" => "name_required"));
        }
        $current["name"] = $name;
    }
    if (array_key_exists("description", $body)) {
        $current["description"] = clip_text(trim((string) $body["description"]), 400);
    }
    if (array_key_exists("soldOut", $body)) {
        $current["soldOut"] = !!$body["soldOut"];
    }
    if (array_key_exists("isNew", $body)) {
        apply_item_new_flag($current, !!$body["isNew"]);
    }
    if (array_key_exists("price", $body) && $body["price"] !== "" && $body["price"] !== null) {
        $price = floatval($body["price"]);
        if ($price < 0) $price = 0;
        $current["price"] = $price;
    }
    if (!empty($body["clearImage"])) {
        delete_item_images($uploadsDir, $itemId);
        unset($current["image"]);
        unset($current["photo"]);
    }
    if (!empty($body["image"])) {
        $saved = save_item_image($uploadsDir, $itemId, $body["image"]);
        if ($saved === "") {
            send_json(400, array("error" => "image_invalid"));
        }
        $current["image"] = $saved;
    }
    if (array_key_exists("toppings", $body)) {
        $current["toppings"] = sanitize_toppings($body["toppings"]);
    }
    if ($isCustom) {
        $overrides["_added"][$itemId] = $current;
    } else {
        $overrides[$itemId] = $current;
    }
    write_json_file($menuFile, $overrides);
    send_json(200, array("overrides" => $overrides));
}

if ($route === "stats" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    $orderStats = compute_stats(read_orders($ordersFile));
    $invoiceStats = compute_invoice_stats(read_invoices($invoicesFile));
    send_json(200, array(
        "stats" => array_merge($orderStats, $invoiceStats, array(
            "orderCount" => $invoiceStats["invoiceCount"] ? $invoiceStats["invoiceCount"] : $orderStats["orderCount"],
            "averageTotal" => $invoiceStats["invoiceCount"] ? $invoiceStats["averageTotal"] : $orderStats["averageTotal"],
            "topItems" => $invoiceStats["topItems"] ? $invoiceStats["topItems"] : $orderStats["topItems"],
            "peakHour" => $invoiceStats["invoiceCount"] ? $invoiceStats["peakHour"] : $orderStats["peakHour"],
            "hours" => $invoiceStats["invoiceCount"] ? $invoiceStats["hours"] : $orderStats["hours"]
        ))
    ));
}

if ($route === "settings" && $method === "GET") {
    $settings = read_site_settings($settingsFile);
    $payload = array("settings" => $settings);
    if ($session) {
        $payload["summary"] = compute_settings_summary(
            read_orders($ordersFile),
            read_invoices($invoicesFile),
            read_table_layout($tablesFile)
        );
    }
    send_json(200, $payload);
}

if ($route === "settings" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $incoming = isset($body["settings"]) && is_array($body["settings"]) ? $body["settings"] : array();
    $settings = merge_site_settings(read_site_settings($settingsFile), $incoming);
    $settings["updatedAt"] = now_ms();
    write_json_file($settingsFile, $settings);
    send_json(200, array(
        "ok" => true,
        "settings" => $settings,
        "summary" => compute_settings_summary(
            read_orders($ordersFile),
            read_invoices($invoicesFile),
            read_table_layout($tablesFile)
        )
    ));
}

if ($route === "customers" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    $customers = visible_customers(read_customers($customersFile));
    send_json(200, array("customers" => $customers));
}

if ($route === "customers" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $customers = read_customers($customersFile);
    $action = isset($body["action"]) ? (string) $body["action"] : "add";

    if ($action === "add") {
        $name = clip_text(trim((string) (isset($body["name"]) ? $body["name"] : "")), 80);
        if ($name === "") send_json(400, array("error" => "name_required"));
        $record = normalize_customer_record(array(
            "name" => $name,
            "phone" => isset($body["phone"]) ? $body["phone"] : "",
            "birthday" => isset($body["birthday"]) ? $body["birthday"] : "",
            "notes" => isset($body["notes"]) ? $body["notes"] : "",
            "tier" => isset($body["tier"]) ? $body["tier"] : "standard",
            "tags" => isset($body["tags"]) ? $body["tags"] : array(),
            "lastContactAt" => isset($body["lastContactAt"]) ? $body["lastContactAt"] : null,
            "createdAt" => now_ms(),
            "updatedAt" => now_ms()
        ));
        $customers[] = $record;
        write_customers($customersFile, $customers);
        send_json(200, array("ok" => true, "customer" => $record, "customers" => visible_customers($customers)));
    }

    if ($action === "update") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_customer_index($customers, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($customers[$idx]) ? $customers[$idx] : array();
        if (!empty($cur["deletedAt"])) send_json(404, array("error" => "not_found"));
        $name = clip_text(trim((string) (isset($body["name"]) ? $body["name"] : (isset($cur["name"]) ? $cur["name"] : ""))), 80);
        if ($name === "") send_json(400, array("error" => "name_required"));
        $record = normalize_customer_record(array(
            "id" => $id,
            "name" => $name,
            "phone" => isset($body["phone"]) ? $body["phone"] : (isset($cur["phone"]) ? $cur["phone"] : ""),
            "birthday" => isset($body["birthday"]) ? $body["birthday"] : (isset($cur["birthday"]) ? $cur["birthday"] : ""),
            "notes" => isset($body["notes"]) ? $body["notes"] : (isset($cur["notes"]) ? $cur["notes"] : ""),
            "tier" => isset($body["tier"]) ? $body["tier"] : (isset($cur["tier"]) ? $cur["tier"] : "standard"),
            "tags" => array_key_exists("tags", $body) ? $body["tags"] : (isset($cur["tags"]) ? $cur["tags"] : array()),
            "lastContactAt" => array_key_exists("lastContactAt", $body) ? $body["lastContactAt"] : (isset($cur["lastContactAt"]) ? $cur["lastContactAt"] : null),
            "createdAt" => isset($cur["createdAt"]) ? $cur["createdAt"] : now_ms(),
            "updatedAt" => now_ms()
        ), $id);
        $customers[$idx] = $record;
        write_customers($customersFile, $customers);
        send_json(200, array("ok" => true, "customer" => $record, "customers" => visible_customers($customers)));
    }

    if ($action === "touch") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_customer_index($customers, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($customers[$idx]) ? $customers[$idx] : array();
        if (!empty($cur["deletedAt"])) send_json(404, array("error" => "not_found"));
        $record = normalize_customer_record(array_merge($cur, array(
            "lastContactAt" => now_ms(),
            "updatedAt" => now_ms()
        )), $id);
        $customers[$idx] = $record;
        write_customers($customersFile, $customers);
        send_json(200, array("ok" => true, "customer" => $record, "customers" => visible_customers($customers)));
    }

    if ($action === "remove") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_customer_index($customers, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($customers[$idx]) ? $customers[$idx] : array();
        $now = now_ms();
        $record = normalize_customer_record(array_merge($cur, array(
            "deletedAt" => $now,
            "updatedAt" => $now
        )), $id);
        $customers[$idx] = $record;
        write_customers($customersFile, $customers);
        send_json(200, array("ok" => true, "id" => $id, "customers" => visible_customers($customers)));
    }

    send_json(400, array("error" => "invalid_action"));
}

if ($route === "coupons" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    send_json(200, array("coupons" => sort_coupons(read_coupons($couponsFile))));
}

if ($route === "coupons" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $coupons = read_coupons($couponsFile);
    $action = isset($body["action"]) ? (string) $body["action"] : "add";

    if ($action === "validate") {
        $code = isset($body["code"]) ? $body["code"] : "";
        $result = validate_coupon_record($coupons, $code);
        if (empty($result["valid"])) {
            $err = isset($result["error"]) ? (string) $result["error"] : "invalid_code";
            $messages = array(
                "invalid_code" => "کد نامعتبر است",
                "inactive" => "این کد غیرفعال است",
                "expired" => "مهلت این کد تمام شده است",
                "invalid_value" => "مقدار تخفیف نامعتبر است",
                "usage_limit" => "سقف استفاده این کد تمام شده است"
            );
            send_json(200, array(
                "valid" => false,
                "error" => $err,
                "message" => isset($messages[$err]) ? $messages[$err] : "کد نامعتبر است"
            ));
        }
        send_json(200, array("valid" => true, "coupon" => $result["coupon"]));
    }

    if ($action === "add") {
        $code = normalize_coupon_code(isset($body["code"]) ? $body["code"] : "");
        if ($code === "") send_json(400, array("error" => "code_required"));
        if (find_coupon_by_code($coupons, $code)) {
            send_json(400, array("error" => "code_exists"));
        }
        $record = normalize_coupon_record(array(
            "code" => $code,
            "label" => isset($body["label"]) ? $body["label"] : "",
            "discountType" => isset($body["discountType"]) ? $body["discountType"] : "percent",
            "discountValue" => isset($body["discountValue"]) ? $body["discountValue"] : 0,
            "active" => !isset($body["active"]) || !!$body["active"],
            "expiresAt" => isset($body["expiresAt"]) ? $body["expiresAt"] : null,
            "usageLimit" => isset($body["usageLimit"]) ? $body["usageLimit"] : null,
            "usedCount" => 0,
            "createdAt" => now_ms(),
            "updatedAt" => now_ms()
        ));
        if ($record["code"] === "") send_json(400, array("error" => "code_required"));
        $coupons[] = $record;
        write_coupons($couponsFile, $coupons);
        send_json(200, array("ok" => true, "coupon" => $record, "coupons" => sort_coupons($coupons)));
    }

    if ($action === "update") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_coupon_index($coupons, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($coupons[$idx]) ? $coupons[$idx] : array();
        $code = normalize_coupon_code(isset($body["code"]) ? $body["code"] : (isset($cur["code"]) ? $cur["code"] : ""));
        if ($code === "") send_json(400, array("error" => "code_required"));
        $existing = find_coupon_by_code($coupons, $code);
        if ($existing && (string) (isset($existing["id"]) ? $existing["id"] : "") !== $id) {
            send_json(400, array("error" => "code_exists"));
        }
        $record = normalize_coupon_record(array(
            "id" => $id,
            "code" => $code,
            "label" => isset($body["label"]) ? $body["label"] : (isset($cur["label"]) ? $cur["label"] : ""),
            "discountType" => isset($body["discountType"]) ? $body["discountType"] : (isset($cur["discountType"]) ? $cur["discountType"] : "percent"),
            "discountValue" => isset($body["discountValue"]) ? $body["discountValue"] : (isset($cur["discountValue"]) ? $cur["discountValue"] : 0),
            "active" => isset($body["active"]) ? !!$body["active"] : !empty($cur["active"]),
            "expiresAt" => array_key_exists("expiresAt", $body) ? $body["expiresAt"] : (isset($cur["expiresAt"]) ? $cur["expiresAt"] : null),
            "usageLimit" => array_key_exists("usageLimit", $body) ? $body["usageLimit"] : (isset($cur["usageLimit"]) ? $cur["usageLimit"] : null),
            "usedCount" => isset($cur["usedCount"]) ? $cur["usedCount"] : 0,
            "createdAt" => isset($cur["createdAt"]) ? $cur["createdAt"] : now_ms(),
            "updatedAt" => now_ms()
        ), $id);
        $coupons[$idx] = $record;
        write_coupons($couponsFile, $coupons);
        send_json(200, array("ok" => true, "coupon" => $record, "coupons" => sort_coupons($coupons)));
    }

    if ($action === "remove") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_coupon_index($coupons, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        array_splice($coupons, $idx, 1);
        write_coupons($couponsFile, $coupons);
        send_json(200, array("ok" => true, "id" => $id, "coupons" => sort_coupons($coupons)));
    }

    send_json(400, array("error" => "invalid_action"));
}

if ($route === "hardware" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    send_json(200, array("devices" => sort_hardware(read_hardware($hardwareFile))));
}

if ($route === "hardware" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $devices = read_hardware($hardwareFile);
    $action = isset($body["action"]) ? (string) $body["action"] : "add";

    if ($action === "add") {
        $name = trim((string) (isset($body["name"]) ? $body["name"] : ""));
        if ($name === "") send_json(400, array("error" => "name_required"));
        $incoming = array(
            "name" => $name,
            "type" => isset($body["type"]) ? $body["type"] : "other",
            "station" => isset($body["station"]) ? $body["station"] : "",
            "connection" => isset($body["connection"]) ? $body["connection"] : "network",
            "address" => isset($body["address"]) ? $body["address"] : "",
            "port" => isset($body["port"]) ? $body["port"] : "",
            "paperWidth" => isset($body["paperWidth"]) ? $body["paperWidth"] : "",
            "copies" => isset($body["copies"]) ? $body["copies"] : 1,
            "enabled" => !isset($body["enabled"]) || !!$body["enabled"],
            "notes" => isset($body["notes"]) ? $body["notes"] : "",
            "isDefault" => !empty($body["isDefault"]),
            "codePage" => isset($body["codePage"]) ? $body["codePage"] : "utf8",
            "manufacturer" => isset($body["manufacturer"]) ? $body["manufacturer"] : "",
            "model" => isset($body["model"]) ? $body["model"] : "",
            "vendorId" => isset($body["vendorId"]) ? $body["vendorId"] : "",
            "productId" => isset($body["productId"]) ? $body["productId"] : "",
            "cupsQueue" => isset($body["cupsQueue"]) ? $body["cupsQueue"] : ""
        );
        $fp = hardware_fingerprint($incoming);
        foreach ($devices as $row) {
            if (is_array($row) && hardware_fingerprint($row) === $fp) {
                send_json(409, array("error" => "duplicate", "device" => $row));
            }
        }
        if (!empty($incoming["isDefault"])) {
            foreach ($devices as $i => $row) {
                if (is_array($row)) $devices[$i] = normalize_hardware(array_merge($row, array("isDefault" => false)));
            }
        }
        $record = normalize_hardware($incoming);
        $devices[] = $record;
        write_hardware($hardwareFile, $devices);
        send_json(200, array("ok" => true, "device" => $record, "devices" => sort_hardware($devices)));
    }

    if ($action === "update") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_hardware_index($devices, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($devices[$idx]) ? $devices[$idx] : array();
        $name = trim((string) (isset($body["name"]) ? $body["name"] : (isset($cur["name"]) ? $cur["name"] : "")));
        if ($name === "") send_json(400, array("error" => "name_required"));
        if (!empty($body["isDefault"])) {
            foreach ($devices as $i => $row) {
                if ($i === $idx || !is_array($row)) continue;
                $devices[$i] = normalize_hardware(array_merge($row, array("isDefault" => false)));
            }
        }
        $record = normalize_hardware(array(
            "id" => $id,
            "name" => $name,
            "type" => isset($body["type"]) ? $body["type"] : (isset($cur["type"]) ? $cur["type"] : "other"),
            "station" => isset($body["station"]) ? $body["station"] : (isset($cur["station"]) ? $cur["station"] : ""),
            "connection" => isset($body["connection"]) ? $body["connection"] : (isset($cur["connection"]) ? $cur["connection"] : "network"),
            "address" => isset($body["address"]) ? $body["address"] : (isset($cur["address"]) ? $cur["address"] : ""),
            "port" => isset($body["port"]) ? $body["port"] : (isset($cur["port"]) ? $cur["port"] : ""),
            "paperWidth" => array_key_exists("paperWidth", $body) ? $body["paperWidth"] : (isset($cur["paperWidth"]) ? $cur["paperWidth"] : ""),
            "copies" => isset($body["copies"]) ? $body["copies"] : (isset($cur["copies"]) ? $cur["copies"] : 1),
            "enabled" => isset($body["enabled"]) ? !!$body["enabled"] : !empty($cur["enabled"]),
            "notes" => isset($body["notes"]) ? $body["notes"] : (isset($cur["notes"]) ? $cur["notes"] : ""),
            "isDefault" => array_key_exists("isDefault", $body) ? !!$body["isDefault"] : !empty($cur["isDefault"]),
            "codePage" => isset($body["codePage"]) ? $body["codePage"] : (isset($cur["codePage"]) ? $cur["codePage"] : "utf8"),
            "manufacturer" => isset($body["manufacturer"]) ? $body["manufacturer"] : (isset($cur["manufacturer"]) ? $cur["manufacturer"] : ""),
            "model" => isset($body["model"]) ? $body["model"] : (isset($cur["model"]) ? $cur["model"] : ""),
            "vendorId" => isset($body["vendorId"]) ? $body["vendorId"] : (isset($cur["vendorId"]) ? $cur["vendorId"] : ""),
            "productId" => isset($body["productId"]) ? $body["productId"] : (isset($cur["productId"]) ? $cur["productId"] : ""),
            "cupsQueue" => isset($body["cupsQueue"]) ? $body["cupsQueue"] : (isset($cur["cupsQueue"]) ? $cur["cupsQueue"] : ""),
            "createdAt" => isset($cur["createdAt"]) ? $cur["createdAt"] : now_ms()
        ), $id);
        $devices[$idx] = $record;
        write_hardware($hardwareFile, $devices);
        send_json(200, array("ok" => true, "device" => $record, "devices" => sort_hardware($devices)));
    }

    if ($action === "set_default") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_hardware_index($devices, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $record = null;
        foreach ($devices as $i => $row) {
            if (!is_array($row)) continue;
            $isTarget = $i === $idx;
            $devices[$i] = normalize_hardware(array_merge($row, array("isDefault" => $isTarget)));
            if ($isTarget) $record = $devices[$i];
        }
        write_hardware($hardwareFile, $devices);
        send_json(200, array("ok" => true, "device" => $record, "devices" => sort_hardware($devices)));
    }

    if ($action === "toggle") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_hardware_index($devices, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($devices[$idx]) ? $devices[$idx] : array();
        $enabled = array_key_exists("enabled", $body) ? !!$body["enabled"] : empty($cur["enabled"]);
        $record = normalize_hardware(array_merge($cur, array("enabled" => $enabled)), $id);
        $devices[$idx] = $record;
        write_hardware($hardwareFile, $devices);
        send_json(200, array("ok" => true, "device" => $record, "devices" => sort_hardware($devices)));
    }

    if ($action === "remove") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = find_hardware_index($devices, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        array_splice($devices, $idx, 1);
        write_hardware($hardwareFile, $devices);
        send_json(200, array("ok" => true, "id" => $id, "devices" => sort_hardware($devices)));
    }

    send_json(400, array("error" => "invalid_action"));
}

if ($route === "printers" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    send_json(200, array(
        "ok" => true,
        "capabilities" => array(
            "network" => true,
            "bluetooth" => false,
            "usb" => false,
            "platform" => "php",
            "rfcomm" => false,
            "cups" => false
        )
    ));
}

if ($route === "printers" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $action = isset($body["action"]) ? (string) $body["action"] : "discover";
    $devices = read_hardware($hardwareFile);

    if ($action === "capabilities") {
        send_json(200, array(
            "ok" => true,
            "capabilities" => array(
                "network" => true,
                "bluetooth" => false,
                "usb" => false,
                "platform" => "php",
                "rfcomm" => false,
                "cups" => false
            )
        ));
    }

    if ($action === "discover") {
        $kind = isset($body["type"]) ? strtolower(trim((string) $body["type"])) : (isset($body["connection"]) ? strtolower(trim((string) $body["connection"])) : "network");
        if ($kind === "bluetooth" || $kind === "usb") {
            send_json(200, array(
                "ok" => true,
                "type" => $kind,
                "printers" => array(),
                "message" => "Bluetooth/USB discovery requires the local POS API on the cashier machine."
            ));
        }
        send_json(200, discover_network_printers_php(isset($body["port"]) ? intval($body["port"]) : 9100));
    }

    if ($action === "test") {
        $printer = find_printer_for_request($devices, $body);
        if (!$printer) send_json(404, array("ok" => false, "error" => "not_found", "message" => "Printer not found"));
        $paper = isset($printer["paperWidth"]) ? $printer["paperWidth"] : "80";
        $codePage = isset($printer["codePage"]) ? $printer["codePage"] : "utf8";
        $payload = escpos_test_receipt(isset($printer["connection"]) ? $printer["connection"] : "network", $paper, $codePage);
        $result = printer_send($printer, $payload);
        $result["printer"] = array(
            "id" => isset($printer["id"]) ? $printer["id"] : "",
            "name" => isset($printer["name"]) ? $printer["name"] : "",
            "connection" => isset($printer["connection"]) ? $printer["connection"] : "",
            "address" => isset($printer["address"]) ? $printer["address"] : ""
        );
        send_json(!empty($result["ok"]) ? 200 : 502, $result);
    }

    if ($action === "print") {
        $printer = find_printer_for_request($devices, $body);
        if (!$printer) send_json(404, array("ok" => false, "error" => "not_found", "message" => "Printer not found"));
        if (isset($printer["enabled"]) && !$printer["enabled"]) {
            send_json(502, array("ok" => false, "error" => "disabled", "message" => "Printer is disabled"));
        }
        if (!empty($body["bytesBase64"])) {
            $payload = base64_decode((string) $body["bytesBase64"], true);
            if ($payload === false) send_json(400, array("ok" => false, "error" => "bad_payload"));
        } else {
            $receipt = isset($body["receipt"]) && is_array($body["receipt"]) ? $body["receipt"] : array();
            if (empty($receipt["paperWidth"])) $receipt["paperWidth"] = isset($printer["paperWidth"]) ? $printer["paperWidth"] : "80";
            if (empty($receipt["codePage"])) $receipt["codePage"] = isset($printer["codePage"]) ? $printer["codePage"] : "utf8";
            $payload = escpos_generate_receipt($receipt);
        }
        $result = printer_send($printer, $payload);
        send_json(!empty($result["ok"]) ? 200 : 502, $result);
    }

    send_json(400, array("error" => "invalid_action"));
}

if ($route === "tables" && $method === "GET") {
    send_json(200, tables_api_payload(read_table_layout($tablesFile)));
}

if ($route === "tables" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $layout = read_table_layout($tablesFile);
    $action = isset($body["action"]) ? (string) $body["action"] : "state";
    $table = parse_table_number(isset($body["table"]) ? $body["table"] : "");

    if ($action === "add_region") {
        $name = isset($body["name"]) ? trim((string) $body["name"]) : "";
        if ($name === "") send_json(400, array("error" => "name_required"));
        $regionId = isset($body["id"]) ? (string) $body["id"] : "";
        if (!add_region($layout, $name, $regionId)) {
            send_json(400, array("error" => "region_exists"));
        }
        write_table_layout($tablesFile, $layout);
        send_json(200, tables_api_payload(read_table_layout($tablesFile)));
    }

    if ($action === "rename_region") {
        $regionId = isset($body["id"]) ? (string) $body["id"] : "";
        $name = isset($body["name"]) ? trim((string) $body["name"]) : "";
        if ($name === "") send_json(400, array("error" => "name_required"));
        if (!rename_region($layout, $regionId, $name)) {
            send_json(400, array("error" => "region_required"));
        }
        write_table_layout($tablesFile, $layout);
        send_json(200, tables_api_payload(read_table_layout($tablesFile)));
    }

    if ($action === "remove_region") {
        $regionId = isset($body["id"]) ? (string) $body["id"] : "";
        if ($regionId === "") send_json(400, array("error" => "region_required"));
        if (!remove_region($layout, $regionId)) {
            send_json(400, array("error" => "region_required"));
        }
        write_table_layout($tablesFile, $layout);
        send_json(200, tables_api_payload(read_table_layout($tablesFile)));
    }

    if ($action === "add") {
        if ($table === "") send_json(400, array("error" => "table_required"));
        if (is_known_table($layout, $table)) {
            send_json(400, array("error" => "table_exists"));
        }
        $regionId = isset($body["region"]) ? (string) $body["region"] : "";
        if (!add_table_to_region($layout, $regionId, $table)) {
            send_json(400, array("error" => "region_required"));
        }
        write_table_layout($tablesFile, $layout);
        $payload = tables_api_payload(read_table_layout($tablesFile));
        $payload["table"] = $table;
        $payload["region"] = $regionId;
        send_json(200, $payload);
    }

    if ($action === "rename_table") {
        $newTable = parse_table_number(isset($body["newTable"]) ? $body["newTable"] : "");
        $result = rename_table_number($layout, $table, $newTable);
        if ($result !== "ok") send_json(400, array("error" => $result));
        write_table_layout($tablesFile, $layout);
        $payload = tables_api_payload(read_table_layout($tablesFile));
        $payload["table"] = $newTable;
        $payload["oldTable"] = $table;
        send_json(200, $payload);
    }

    if ($action === "remove") {
        if ($table === "") send_json(400, array("error" => "table_required"));
        remove_table_from_regions($layout, $table);
        unset($layout["states"][$table]);
        write_table_layout($tablesFile, $layout);
        $payload = tables_api_payload(read_table_layout($tablesFile));
        $payload["table"] = $table;
        send_json(200, $payload);
    }

    if ($table === "") {
        send_json(400, array("error" => "table_required"));
    }
    if (!is_known_table($layout, $table)) {
        send_json(400, array("error" => "table_unknown"));
    }
    $state = isset($body["state"]) ? (string) $body["state"] : "";
    if ($state !== "open" && $state !== "full" && $state !== "disabled" && $state !== "reserved") {
        send_json(400, array("error" => "invalid_state"));
    }
    $prev = table_state_of($layout, $table);
    if ($state === "open") {
        unset($layout["states"][$table]);
    } else {
        $layout["states"][$table] = $state;
    }
    write_table_layout($tablesFile, $layout);
    $resFile = reservations_path_for($tablesFile);
    if ($prev === "reserved" && $state !== "reserved") {
        cancel_open_reservations_for_table($resFile, $table);
    }
    $payload = tables_api_payload(read_table_layout($tablesFile));
    $payload["reservations"] = read_reservations($resFile);
    $payload["table"] = $table;
    $payload["state"] = $state;
    send_json(200, $payload);
}

if ($route === "reservations" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    $resFile = reservations_path_for($tablesFile);
    send_json(200, reservations_payload($resFile, $tablesFile));
}

if ($route === "reservations" && $method === "POST") {
    $resFile = reservations_path_for($tablesFile);
    $action = isset($body["action"]) ? (string) $body["action"] : "";
    $now = now_ms();

    if ($action === "accept" || $action === "reject" || $action === "cancel") {
        require_cashier($sessionsFile, $body);
        $id = isset($body["id"]) ? trim((string) $body["id"]) : "";
        if ($id === "") send_json(400, array("error" => "id_required"));
        $list = read_reservations($resFile);
        $found = null;
        $foundIndex = -1;
        foreach ($list as $i => $row) {
            if (is_array($row) && isset($row["id"]) && (string) $row["id"] === $id) {
                $found = $row;
                $foundIndex = $i;
                break;
            }
        }
        if ($foundIndex < 0) send_json(404, array("error" => "not_found"));
        $cur = isset($found["status"]) ? (string) $found["status"] : "";
        $table = parse_table_number(isset($found["table"]) ? $found["table"] : "");

        if ($action === "accept") {
            if ($cur !== "pending") send_json(400, array("error" => "invalid_status"));
            $layout = read_table_layout($tablesFile);
            if ($table === "" || !is_known_table($layout, $table)) {
                send_json(400, array("error" => "table_unknown"));
            }
            $st = table_state_of($layout, $table);
            if ($st === "disabled") send_json(400, array("error" => "table_disabled"));
            if (reservation_hold_started($found, $now)) {
                if ($st === "full" || $st === "reserved") send_json(400, array("error" => "table_unavailable"));
                mark_table_reserved($tablesFile, $table);
            }
            $found["status"] = "accepted";
            $found["updatedAt"] = $now;
            $list[$foundIndex] = $found;
            write_reservations($resFile, $list);
            send_json(200, reservations_payload($resFile, $tablesFile, array(
                "reservation" => $found,
                "ok" => true
            )));
        }

        if ($action === "reject") {
            if ($cur !== "pending") send_json(400, array("error" => "invalid_status"));
            $found["status"] = "rejected";
            $found["updatedAt"] = $now;
            $list[$foundIndex] = $found;
            write_reservations($resFile, $list);
            send_json(200, reservations_payload($resFile, $tablesFile, array(
                "reservation" => $found,
                "ok" => true
            )));
        }

        // cancel
        if ($cur !== "pending" && $cur !== "accepted") {
            send_json(400, array("error" => "invalid_status"));
        }
        $found["status"] = "cancelled";
        $found["updatedAt"] = $now;
        $list[$foundIndex] = $found;
        write_reservations($resFile, $list);
        if ($cur === "accepted" && $table !== "") {
            clear_reserved_table($tablesFile, $table);
        }
        send_json(200, reservations_payload($resFile, $tablesFile, array(
            "reservation" => $found,
            "ok" => true
        )));
    }

    // Public create
    $table = parse_table_number(isset($body["table"]) ? $body["table"] : "");
    $name = isset($body["name"]) ? trim((string) $body["name"]) : "";
    $phone = normalize_phone(isset($body["phone"]) ? $body["phone"] : "");
    $reserveDate = parse_reservation_date(isset($body["date"]) ? $body["date"] : "");
    $reserveTime = parse_reservation_time(isset($body["time"]) ? $body["time"] : "");
    $guests = isset($body["guests"]) ? intval($body["guests"]) : 0;
    if ($guests < 0) $guests = 0;
    if ($guests > 99) $guests = 99;
    if ($table === "") send_json(400, array("error" => "table_required"));
    if ($reserveDate === "") {
        $rawDate = isset($body["date"]) ? trim((string) $body["date"]) : "";
        send_json(400, array("error" => $rawDate === "" ? "date_required" : "date_invalid"));
    }
    if ($reserveTime === "") {
        $rawTime = isset($body["time"]) ? trim((string) $body["time"]) : "";
        send_json(400, array("error" => $rawTime === "" ? "time_required" : "time_invalid"));
    }
    $ts = strtotime($reserveDate . " " . $reserveTime . ":00");
    if ($ts === false) send_json(400, array("error" => "time_invalid"));
    $reservedAt = intval($ts * 1000);
    if ($reservedAt < $now) send_json(400, array("error" => "time_past"));
    $nameLen = function_exists("mb_strlen") ? mb_strlen($name, "UTF-8") : strlen($name);
    if ($name === "" || $nameLen < 2) send_json(400, array("error" => "name_required"));
    if (function_exists("mb_substr")) {
        if ($nameLen > 80) $name = mb_substr($name, 0, 80, "UTF-8");
    } elseif (strlen($name) > 80) {
        $name = substr($name, 0, 80);
    }
    if (strlen($phone) < 8) send_json(400, array("error" => "phone_required"));

    $layout = read_table_layout($tablesFile);
    if (!is_known_table($layout, $table)) send_json(400, array("error" => "table_unknown"));
    $st = table_state_of($layout, $table);
    if ($st === "disabled") send_json(400, array("error" => "table_disabled"));

    $list = read_reservations($resFile);
    if (find_open_reservation_for_table($list, $table)) {
        send_json(400, array("error" => "table_reserved"));
    }

    $reservation = array(
        "id" => "rsv-" . $now . "-" . mt_rand(1000, 9999),
        "table" => intval($table),
        "name" => $name,
        "phone" => $phone,
        "date" => $reserveDate,
        "time" => $reserveTime,
        "reservedAt" => $reservedAt,
        "status" => "pending",
        "createdAt" => $now,
        "updatedAt" => $now
    );
    if ($guests > 0) $reservation["guests"] = $guests;
    array_unshift($list, $reservation);
    if (count($list) > 800) $list = array_slice($list, 0, 800);
    write_reservations($resFile, $list);
    send_json(201, reservations_payload($resFile, $tablesFile, array(
        "reservation" => $reservation,
        "ok" => true
    )));
}

if ($route === "orders" && $method === "GET") {
    $layout = read_table_layout($tablesFile);
    $payload = tables_api_payload($layout);
    $payload["orders"] = read_orders($ordersFile);
    $payload["reservations"] = read_reservations(reservations_path_for($tablesFile));
    $payload["since"] = live_stamp($ordersFile, $tablesFile, $invoicesFile);
    if ($session) {
        $payload["invoices"] = read_invoices($invoicesFile);
        $payload["summary"] = invoice_summary_cards($payload["invoices"]);
    }
    send_json(200, $payload);
}

if ($route === "stream" && $method === "GET") {
    $mode = isset($_GET["mode"]) ? (string) $_GET["mode"] : "sse";
    $since = isset($_GET["since"]) ? intval($_GET["since"]) : 0;
    $token = request_token($body);
    $authed = cashier_token_ok($sessionsFile, $token);

    if ($mode === "poll") {
        if (!$authed) send_json(401, array("error" => "auth_required"));
        @set_time_limit(35);
        ignore_user_abort(true);
        if ($since > 0) {
            wait_for_live_change($ordersFile, $tablesFile, $invoicesFile, $since, 22);
        }
        send_json(200, orders_live_payload($ordersFile, $tablesFile, $invoicesFile));
    }

    header("Content-Type: text/event-stream; charset=utf-8");
    header("Cache-Control: no-cache, no-store");
    header("Connection: keep-alive");
    header("X-Accel-Buffering: no");
    header("X-LiteSpeed-Cache-Control: no-cache");
    @ini_set("zlib.output_compression", "0");
    @ini_set("output_buffering", "off");
    @ini_set("implicit_flush", "1");
    while (ob_get_level() > 0) {
        @ob_end_flush();
    }
    @set_time_limit(35);
    ignore_user_abort(true);
    sse_flush("retry: 2500\n\n");
    if (!$authed) {
        sse_flush("event: auth\ndata: {\"error\":\"auth_required\"}\n\n");
        exit;
    }
    $stamp = live_stamp($ordersFile, $tablesFile, $invoicesFile);
    sse_flush("data: " . json_encode(orders_live_payload($ordersFile, $tablesFile, $invoicesFile), JSON_UNESCAPED_UNICODE) . "\n\n");
    $deadline = time() + 22;
    while (time() < $deadline) {
        if (connection_aborted()) break;
        $next = live_stamp($ordersFile, $tablesFile, $invoicesFile);
        if ($next > $stamp) {
            $stamp = $next;
            sse_flush("data: " . json_encode(orders_live_payload($ordersFile, $tablesFile, $invoicesFile), JSON_UNESCAPED_UNICODE) . "\n\n");
        } else {
            usleep(400000);
        }
    }
    sse_flush(": bye\n\n");
    exit;
}

if ($route === "orders" && $method === "POST") {
    $type = isset($body["type"]) && $body["type"] === "waiter" ? "waiter" : "food";
    $table = parse_table_number(isset($body["table"]) ? $body["table"] : "");
    if ($table === "") {
        send_json(400, array("error" => "table_required"));
    }
    $layout = read_table_layout($tablesFile);
    if (!is_known_table($layout, $table)) {
        send_json(400, array("error" => "table_unknown"));
    }
    if (table_state_of($layout, $table) === "disabled") {
        send_json(400, array("error" => "table_disabled"));
    }
    $items = array();
    $total = 0;
    if ($type === "food") {
        $items = sanitize_items(isset($body["items"]) ? $body["items"] : null);
        if (!$items) {
            send_json(400, array("error" => "items_required"));
        }
        $total = isset($body["total"]) ? floatval($body["total"]) : 0;
    }
    $orders = read_orders($ordersFile);
    $now = round(microtime(true) * 1000);
    $merged = false;
    $order = null;

    foreach ($orders as &$existing) {
        $st = normalize_status(isset($existing["status"]) ? $existing["status"] : "waiting");
        $existingType = isset($existing["type"]) ? $existing["type"] : "food";
        if ($existingType !== $type) continue;
        if (parse_table_number(isset($existing["table"]) ? $existing["table"] : "") !== $table) continue;
        if (order_is_closed($st)) continue;

        if ($type === "food") {
            if (empty($existing["batches"]) || !is_array($existing["batches"])) {
                $existing["batches"] = array(array(
                    "createdAt" => isset($existing["createdAt"]) ? $existing["createdAt"] : $now,
                    "items" => isset($existing["items"]) ? $existing["items"] : array(),
                    "total" => isset($existing["total"]) ? $existing["total"] : 0
                ));
            }
            $existing["batches"][] = array(
                "createdAt" => $now,
                "items" => $items,
                "total" => $total
            );
            $existing["items"] = array_merge(isset($existing["items"]) && is_array($existing["items"]) ? $existing["items"] : array(), $items);
            $existing["total"] = floatval(isset($existing["total"]) ? $existing["total"] : 0) + $total;
        } else {
            if (empty($existing["calls"]) || !is_array($existing["calls"])) {
                $existing["calls"] = array(array(
                    "createdAt" => isset($existing["createdAt"]) ? $existing["createdAt"] : $now
                ));
            }
            $existing["calls"][] = array("createdAt" => $now);
            $existing["callCount"] = count($existing["calls"]);
        }
        $existing["updatedAt"] = $now;
        $existing["status"] = "waiting";
        if (isset($body["customerId"]) || isset($body["customerName"])) {
            list($custId, $cname, $cphone) = resolve_customer_link($customersFile, $body, $existing);
            apply_customer_link($existing, $custId, $cname, $cphone);
        }
        append_order_history($existing, $type === "food" ? "items_added" : "called_again", "waiting");
        $order = $existing;
        $merged = true;
        break;
    }
    unset($existing);
    if ($merged && $order) {
        $next = array($order);
        foreach ($orders as $row) {
            if ($row["id"] !== $order["id"]) $next[] = $row;
        }
        $orders = $next;
    }

    if (!$merged) {
        $order = array(
            "id" => "ord-" . $now . "-" . mt_rand(1000, 9999),
            "type" => $type,
            "table" => $table,
            "items" => $items,
            "total" => $total,
            "status" => "waiting",
            "createdAt" => $now,
            "updatedAt" => $now,
            "batches" => $type === "food" ? array(array(
                "createdAt" => $now,
                "items" => $items,
                "total" => $total
            )) : array(),
            "calls" => $type === "waiter" ? array(array("createdAt" => $now)) : array(),
            "callCount" => $type === "waiter" ? 1 : 0,
            "history" => array(array("at" => $now, "action" => "created", "status" => "waiting"))
        );
        list($custId, $cname, $cphone) = resolve_customer_link($customersFile, $body);
        apply_customer_link($order, $custId, $cname, $cphone);
        array_unshift($orders, $order);
    }

    $orders = trim_orders_list($orders, 1500);
    write_json_file($ordersFile, $orders);
    $layout = read_table_layout($tablesFile);
    if ($type === "food") {
        $resFile = reservations_path_for($tablesFile);
        sync_reservation_holds($resFile, $tablesFile);
        $layout = read_table_layout($tablesFile);
        if (table_state_of($layout, $table) === "reserved") {
            seat_accepted_reservation($resFile, $table);
        }
        $layout = mark_table_full($tablesFile, $table);
    }
    $payload = tables_api_payload($layout);
    $payload["order"] = $order;
    $payload["orders"] = $orders;
    $payload["reservations"] = read_reservations(reservations_path_for($tablesFile));
    $payload["merged"] = $merged;
    send_json(201, $payload);
}

if ($route === "item" && $id !== "") {
    require_cashier($sessionsFile, $body);
    $action = isset($body["action"]) ? (string) $body["action"] : "";
    $doCancel = ($method === "DELETE") || $action === "delete" || $action === "cancel";
    $nextStatus = isset($body["status"]) ? normalize_status((string) $body["status"]) : "";
    $orders = read_orders($ordersFile);

    $found = null;
    $foundIndex = -1;
    foreach ($orders as $i => $order) {
        if (isset($order["id"]) && (string) $order["id"] === (string) $id) {
            $found = $order;
            $foundIndex = $i;
            break;
        }
    }
    if ($foundIndex < 0) send_json(404, array("error" => "not_found"));

    if ($doCancel) {
        $cur = normalize_status(isset($found["status"]) ? $found["status"] : "waiting");
        if ($cur === "invoiced") send_json(400, array("error" => "already_invoiced"));
        if ($cur !== "cancelled") {
            $found["status"] = "cancelled";
            $found["updatedAt"] = now_ms();
            append_order_history($found, "cancel", "cancelled");
            $orders[$foundIndex] = $found;
            write_json_file($ordersFile, $orders);
        }
        $layout = read_table_layout($tablesFile);
        $foundType = isset($found["type"]) ? $found["type"] : "food";
        if ($foundType !== "waiter") {
            $layout = maybe_free_table($tablesFile, isset($found["table"]) ? $found["table"] : "", $orders);
        }
        $payload = tables_api_payload($layout);
        $payload["order"] = $found;
        $payload["orders"] = $orders;
        send_json(200, $payload);
    }

    if (($method === "PATCH" || $method === "POST") && $action === "table") {
        $newTable = parse_table_number(isset($body["table"]) ? $body["table"] : "");
        if ($newTable === "") send_json(400, array("error" => "table_required"));
        $layout = read_table_layout($tablesFile);
        if (!is_known_table($layout, $newTable)) send_json(400, array("error" => "table_unknown"));
        if (table_state_of($layout, $newTable) === "disabled") send_json(400, array("error" => "table_disabled"));
        $oldTable = parse_table_number(isset($found["table"]) ? $found["table"] : "");
        $foundType = isset($found["type"]) ? $found["type"] : "food";
        $found["table"] = $newTable;
        $found["updatedAt"] = now_ms();
        append_order_history($found, "table", isset($found["status"]) ? $found["status"] : "waiting");
        $orders[$foundIndex] = $found;
        write_json_file($ordersFile, $orders);
        if ($foundType !== "waiter" && !order_is_closed(isset($found["status"]) ? $found["status"] : "waiting")) {
            if ($oldTable !== "" && $oldTable !== $newTable) {
                maybe_free_table($tablesFile, $oldTable, $orders);
            }
            $layout = mark_table_full($tablesFile, $newTable);
        } else {
            $layout = maybe_free_table($tablesFile, $oldTable, $orders);
            $layout = read_table_layout($tablesFile);
        }
        $payload = tables_api_payload($layout);
        $payload["order"] = $found;
        $payload["orders"] = $orders;
        send_json(200, $payload);
    }

    if (($method === "PATCH" || $method === "POST") && $action === "customer") {
        $cur = normalize_status(isset($found["status"]) ? $found["status"] : "waiting");
        if ($cur === "cancelled") send_json(400, array("error" => "order_cancelled"));
        $clear = empty($body["customerId"]) && empty($body["customerName"]);
        list($custId, $cname, $cphone) = resolve_customer_link($customersFile, $body, $found, $clear);
        apply_customer_link($found, $custId, $cname, $cphone);
        $found["updatedAt"] = now_ms();
        append_order_history($found, "customer", $cur);
        $orders[$foundIndex] = $found;
        write_json_file($ordersFile, $orders);
        $payload = tables_api_payload(read_table_layout($tablesFile));
        $payload["order"] = $found;
        $payload["orders"] = $orders;
        send_json(200, $payload);
    }

    if (($method === "PATCH" || $method === "POST") && $action === "items") {
        $orderType = isset($found["type"]) ? $found["type"] : "food";
        if ($orderType === "waiter") send_json(400, array("error" => "not_editable"));
        $cur = normalize_status(isset($found["status"]) ? $found["status"] : "waiting");
        if ($cur === "cancelled") send_json(400, array("error" => "order_cancelled"));
        if ($cur === "invoiced") send_json(400, array("error" => "already_invoiced"));
        $items = sanitize_items(isset($body["items"]) ? $body["items"] : null);
        if (!$items) send_json(400, array("error" => "items_required"));
        $sum = 0;
        foreach ($items as $it) {
            $sum += parse_price_value(isset($it["price"]) ? $it["price"] : 0) * intval($it["count"]);
        }
        $total = isset($body["total"]) ? floatval($body["total"]) : 0;
        if ($total <= 0) $total = $sum;
        $now = now_ms();
        $found["items"] = $items;
        $found["total"] = $total;
        $found["updatedAt"] = $now;
        if (isset($body["customerId"]) || isset($body["customerName"])) {
            list($custId, $cname, $cphone) = resolve_customer_link($customersFile, $body, $found);
            apply_customer_link($found, $custId, $cname, $cphone);
        }
        if (!isset($found["batches"]) || !is_array($found["batches"])) $found["batches"] = array();
        $found["batches"][] = array(
            "createdAt" => $now,
            "items" => $items,
            "total" => $total,
            "edit" => true
        );
        append_order_history($found, "items", $cur);
        $orders[$foundIndex] = $found;
        write_json_file($ordersFile, $orders);
        $payload = tables_api_payload(read_table_layout($tablesFile));
        $payload["order"] = $found;
        $payload["orders"] = $orders;
        send_json(200, $payload);
    }

    if ($method === "PATCH" || $method === "POST") {
        if ($nextStatus === "invoiced") send_json(400, array("error" => "use_checkout"));
        if (!isset($allowedStatus[$nextStatus])) {
            send_json(400, array("error" => "invalid_status"));
        }
        $orderType = isset($found["type"]) ? $found["type"] : "food";
        $cur = normalize_status(isset($found["status"]) ? $found["status"] : "waiting");
        if ($cur === "invoiced" && $nextStatus !== "invoiced") {
            send_json(400, array("error" => "already_invoiced"));
        }
        if ($orderType === "waiter" && $nextStatus !== "waiting" && $nextStatus !== "delivered" && $nextStatus !== "cancelled") {
            send_json(400, array("error" => "invalid_status"));
        }
        $found["status"] = $nextStatus;
        $found["updatedAt"] = now_ms();
        append_order_history($found, "status", $nextStatus);
        $orders[$foundIndex] = $found;
        write_json_file($ordersFile, $orders);
        $layout = read_table_layout($tablesFile);
        if ($orderType !== "waiter" && order_is_closed($nextStatus)) {
            $layout = maybe_free_table($tablesFile, isset($found["table"]) ? $found["table"] : "", $orders);
        } elseif ($orderType !== "waiter" && !order_is_closed($nextStatus)) {
            $layout = mark_table_full($tablesFile, isset($found["table"]) ? $found["table"] : "");
        }
        $payload = tables_api_payload($layout);
        $payload["order"] = $found;
        $payload["orders"] = $orders;
        send_json(200, $payload);
    }
}

if ($route === "invoices" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    $invoices = read_invoices($invoicesFile);
    send_json(200, array(
        "invoices" => $invoices,
        "summary" => invoice_summary_cards($invoices)
    ));
}

if ($route === "invoices" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $orderId = isset($body["orderId"]) ? (string) $body["orderId"] : "";
    if ($orderId === "") send_json(400, array("error" => "order_required"));
    $orders = read_orders($ordersFile);
    $found = null;
    $foundIndex = -1;
    foreach ($orders as $i => $order) {
        if (isset($order["id"]) && $order["id"] === $orderId) {
            $found = $order;
            $foundIndex = $i;
            break;
        }
    }
    if ($foundIndex < 0) send_json(404, array("error" => "not_found"));
    $orderType = isset($found["type"]) ? $found["type"] : "food";
    if ($orderType === "waiter") send_json(400, array("error" => "not_billable"));
    $st = normalize_status(isset($found["status"]) ? $found["status"] : "waiting");
    if ($st === "cancelled") send_json(400, array("error" => "order_cancelled"));
    if ($st === "invoiced") {
        $invoices = read_invoices($invoicesFile);
        $existingInv = null;
        foreach ($invoices as $inv) {
            if (isset($inv["orderId"]) && $inv["orderId"] === $orderId) {
                $existingInv = $inv;
                break;
            }
        }
        send_json(200, array(
            "invoice" => $existingInv,
            "invoices" => $invoices,
            "orders" => $orders,
            "summary" => invoice_summary_cards($invoices)
        ));
    }
    if ($st !== "ready" && $st !== "delivered") send_json(400, array("error" => "not_ready"));

    $items = invoice_items_from_order($found);
    $subtotal = 0;
    foreach ($items as $row) $subtotal += intval($row["line"]);
    if ($subtotal <= 0) $subtotal = intval(round(floatval(isset($found["total"]) ? $found["total"] : 0)));
    $discountType = isset($body["discountType"]) ? (string) $body["discountType"] : "";
    $discountValue = isset($body["discountValue"]) ? $body["discountValue"] : 0;
    $couponCode = normalize_coupon_code(isset($body["couponCode"]) ? $body["couponCode"] : "");
    if ($couponCode !== "") {
        $coupons = read_coupons($couponsFile);
        $result = validate_coupon_record($coupons, $couponCode);
        if (empty($result["valid"])) {
            $err = isset($result["error"]) ? (string) $result["error"] : "invalid_code";
            $messages = array(
                "invalid_code" => "کد نامعتبر است",
                "inactive" => "این کد غیرفعال است",
                "expired" => "مهلت این کد تمام شده است",
                "invalid_value" => "مقدار تخفیف نامعتبر است",
                "usage_limit" => "سقف استفاده این کد تمام شده است"
            );
            send_json(400, array(
                "error" => $err,
                "message" => isset($messages[$err]) ? $messages[$err] : "کد نامعتبر است"
            ));
        }
    }
    list($discountType, $discountValue, $discountAmount) = invoice_discount($subtotal, $discountType, $discountValue);
    $tax = isset($body["tax"]) ? max(0, intval(round(floatval($body["tax"])))) : 0;
    $total = max(0, $subtotal - $discountAmount + $tax);
    $unpaid = !empty($body["unpaid"]);
    $payments = sanitize_payments(isset($body["payments"]) ? $body["payments"] : array());
    $paidSum = payments_total($payments);
    if (!$unpaid && $paidSum !== $total) {
        send_json(400, array("error" => "payment_mismatch"));
    }

    // Multi-guest split: one invoice per person
    $rawSplits = isset($body["splits"]) && is_array($body["splits"])
        ? $body["splits"]
        : (isset($body["guestSplits"]) && is_array($body["guestSplits"]) ? $body["guestSplits"] : null);
    if (!$unpaid && is_array($rawSplits) && count($rawSplits) > 0) {
        $splits = array();
        $splitSum = 0;
        foreach ($rawSplits as $row) {
            if (!is_array($row)) continue;
            $gName = clip_text(trim((string) (isset($row["name"]) ? $row["name"] : "")), 80);
            $gAmount = isset($row["amount"]) ? intval(round(floatval($row["amount"]))) : 0;
            $gMethod = isset($row["method"]) ? (string) $row["method"] : "cash";
            if (!allowed_pay_method($gMethod) || $gMethod === "online") $gMethod = "cash";
            if ($gName === "") $gName = "نفر " . (count($splits) + 1);
            if ($gAmount <= 0) send_json(400, array("error" => "invalid_amount", "message" => "مبلغ هر نفر باید بیشتر از صفر باشد"));
            $gCid = trim((string) (isset($row["customerId"]) ? $row["customerId"] : ""));
            $splitRow = array("name" => $gName, "amount" => $gAmount, "method" => $gMethod, "customerId" => $gCid);
            foreach (array("paymentId", "referenceNumber", "terminalId", "providerTransactionId") as $k) {
                if (!empty($row[$k])) {
                    $splitRow[$k] = clip_text(trim((string) $row[$k]), 80);
                }
            }
            $splits[] = $splitRow;
            $splitSum += $gAmount;
        }
        if (count($splits) < 1) send_json(400, array("error" => "splits_required"));
        if ($splitSum !== $total) send_json(400, array("error" => "payment_mismatch", "message" => "جمع سهم افراد با مبلغ فاکتور هم‌خوانی ندارد"));

        $couponCode = normalize_coupon_code(isset($body["couponCode"]) ? $body["couponCode"] : "");
        if ($couponCode !== "") {
            $coupons = read_coupons($couponsFile);
            $result = validate_coupon_record($coupons, $couponCode);
            if (empty($result["valid"])) {
                $err = isset($result["error"]) ? (string) $result["error"] : "invalid_code";
                send_json(400, array("error" => $err));
            }
        }

        $invoices = read_invoices($invoicesFile);
        $now = now_ms();
        $created = array();
        $tableNum = parse_table_number(isset($found["table"]) ? $found["table"] : "");
        $cashier = cashier_label($session);
        foreach ($splits as $i => $split) {
            $amount = intval($split["amount"]);
            $pay = array(array("method" => $split["method"], "amount" => $amount));
            foreach (array("paymentId", "referenceNumber", "terminalId", "providerTransactionId") as $k) {
                if (!empty($split[$k])) {
                    $pay[0][$k] = $split[$k];
                }
            }
            $invoice = array(
                "id" => "inv-" . $now . "-" . ($i + 1) . "-" . mt_rand(1000, 9999),
                "number" => next_invoice_number(array_merge($invoices, $created)),
                "orderId" => $orderId,
                "table" => $tableNum,
                "createdAt" => $now + $i,
                "updatedAt" => $now + $i,
                "cashier" => $cashier,
                "customerName" => $split["name"],
                "customerPhone" => "",
                "couponCode" => $i === 0 ? $couponCode : "",
                "items" => array(array(
                    "name" => "سهم از سفارش میز " . (string) (isset($found["table"]) ? $found["table"] : ""),
                    "price" => $amount,
                    "count" => 1,
                    "line" => $amount
                )),
                "subtotal" => $amount,
                "discountType" => "",
                "discountValue" => 0,
                "discountAmount" => 0,
                "tax" => 0,
                "total" => $amount,
                "payments" => $pay,
                "payMethod" => $split["method"],
                "status" => "paid",
                "history" => array(array("at" => $now + $i, "action" => "paid")),
                "refunds" => array(),
                "splitIndex" => $i + 1,
                "splitCount" => count($splits)
            );
            list($custId, $cname, $cphone) = resolve_customer_link($customersFile, array(
                "customerId" => isset($split["customerId"]) ? $split["customerId"] : "",
                "customerName" => $split["name"],
                "customerPhone" => ""
            ), array());
            apply_customer_link($invoice, $custId, $cname, $cphone);
            refresh_invoice_status($invoice);
            $created[] = $invoice;
        }
        foreach (array_reverse($created) as $inv) {
            array_unshift($invoices, $inv);
        }
        if (count($invoices) > 5000) $invoices = array_slice($invoices, 0, 5000);
        write_json_file($invoicesFile, $invoices);

        if ($couponCode !== "") {
            $coupons = read_coupons($couponsFile);
            redeem_coupon($coupons, $couponCode);
            write_coupons($couponsFile, $coupons);
        }

        $ids = array();
        foreach ($created as $inv) $ids[] = $inv["id"];
        $found["status"] = "invoiced";
        $found["invoiceId"] = $ids[0];
        $found["invoiceIds"] = $ids;
        $found["updatedAt"] = $now;
        append_order_history($found, "invoiced", "invoiced");
        $orders[$foundIndex] = $found;
        write_json_file($ordersFile, $orders);
        $resFile = reservations_path_for($tablesFile);
        $reservations = cancel_reservations_after_invoice($resFile, $tablesFile, isset($found["table"]) ? $found["table"] : "");
        $layout = maybe_free_table($tablesFile, isset($found["table"]) ? $found["table"] : "", $orders);
        $payload = tables_api_payload($layout);
        $payload["order"] = $found;
        $payload["orders"] = $orders;
        $payload["invoice"] = $created[0];
        $payload["createdInvoices"] = $created;
        $payload["invoices"] = $invoices;
        $payload["reservations"] = $reservations;
        $payload["summary"] = invoice_summary_cards($invoices);
        send_json(201, $payload);
    }

    $customerName = clip_text(trim((string) (isset($body["customerName"]) ? $body["customerName"] : "")), 80);
    $customerPhone = clip_text(trim((string) (isset($body["customerPhone"]) ? $body["customerPhone"] : "")), 20);
    $linkBody = array(
        "customerId" => array_key_exists("customerId", $body) ? $body["customerId"] : (isset($found["customerId"]) ? $found["customerId"] : ""),
        "customerName" => $customerName !== "" ? $customerName : (isset($found["customerName"]) ? $found["customerName"] : ""),
        "customerPhone" => $customerPhone !== "" ? $customerPhone : (isset($found["customerPhone"]) ? $found["customerPhone"] : "")
    );
    if (array_key_exists("customerId", $body) && !$body["customerId"]) {
        $linkBody["customerId"] = "";
    }
    list($custId, $customerName, $customerPhone) = resolve_customer_link($customersFile, $linkBody, $found);
    if ($unpaid && $customerName === "") {
        send_json(400, array(
            "error" => "customer_required",
            "message" => "برای فاکتور بدهکار نام مشتری الزامی است"
        ));
    }
    if ($unpaid) $payments = array();

    $invoices = read_invoices($invoicesFile);
    $now = now_ms();
    $invoice = array(
        "id" => "inv-" . $now . "-" . mt_rand(1000, 9999),
        "number" => next_invoice_number($invoices),
        "orderId" => $orderId,
        "table" => parse_table_number(isset($found["table"]) ? $found["table"] : ""),
        "createdAt" => $now,
        "updatedAt" => $now,
        "cashier" => cashier_label($session),
        "customerName" => $customerName,
        "customerPhone" => $customerPhone,
        "couponCode" => $couponCode,
        "items" => $items,
        "subtotal" => $subtotal,
        "discountType" => $discountType,
        "discountValue" => $discountValue,
        "discountAmount" => $discountAmount,
        "tax" => $tax,
        "total" => $total,
        "payments" => $payments,
        "payMethod" => payments_label($payments),
        "status" => $unpaid ? "unpaid" : "paid",
        "history" => array(array("at" => $now, "action" => $unpaid ? "created" : "paid")),
        "refunds" => array()
    );
    apply_customer_link($invoice, $custId, $customerName, $customerPhone);
    if (!$unpaid) refresh_invoice_status($invoice);
    array_unshift($invoices, $invoice);
    if (count($invoices) > 5000) $invoices = array_slice($invoices, 0, 5000);
    write_json_file($invoicesFile, $invoices);

    if ($couponCode !== "") {
        $coupons = read_coupons($couponsFile);
        redeem_coupon($coupons, $couponCode);
        write_coupons($couponsFile, $coupons);
    }

    $found["status"] = "invoiced";
    $found["invoiceId"] = $invoice["id"];
    $found["updatedAt"] = $now;
    apply_customer_link($found, $custId, $customerName, $customerPhone);
    append_order_history($found, "invoiced", "invoiced");
    $orders[$foundIndex] = $found;
    write_json_file($ordersFile, $orders);
    $resFile = reservations_path_for($tablesFile);
    $reservations = cancel_reservations_after_invoice($resFile, $tablesFile, isset($found["table"]) ? $found["table"] : "");
    $layout = maybe_free_table($tablesFile, isset($found["table"]) ? $found["table"] : "", $orders);
    $payload = tables_api_payload($layout);
    $payload["order"] = $found;
    $payload["orders"] = $orders;
    $payload["invoice"] = $invoice;
    $payload["invoices"] = $invoices;
    $payload["reservations"] = $reservations;
    $payload["summary"] = invoice_summary_cards($invoices);
    send_json(201, $payload);
}

if ($route === "invoice-item" && $id !== "") {
    require_cashier($sessionsFile, $body);
    if ($method !== "PATCH" && $method !== "POST") send_json(405, array("error" => "method"));
    $invoices = read_invoices($invoicesFile);
    $found = null;
    $foundIndex = -1;
    foreach ($invoices as $i => $inv) {
        if (isset($inv["id"]) && $inv["id"] === $id) {
            $found = $inv;
            $foundIndex = $i;
            break;
        }
    }
    if ($foundIndex < 0) send_json(404, array("error" => "not_found"));
    $action = isset($body["action"]) ? (string) $body["action"] : "";
    $now = now_ms();

    if ($action === "pay") {
        if (isset($found["status"]) && $found["status"] === "cancelled") send_json(400, array("error" => "invoice_cancelled"));
        $payments = sanitize_payments(isset($body["payments"]) ? $body["payments"] : array());
        $total = intval(isset($found["total"]) ? $found["total"] : 0);
        if (payments_total($payments) !== $total) send_json(400, array("error" => "payment_mismatch"));
        $found["payments"] = $payments;
        $found["updatedAt"] = $now;
        append_invoice_history($found, "paid");
        refresh_invoice_status($found);
    } elseif ($action === "refund") {
        if (isset($found["status"]) && $found["status"] === "cancelled") send_json(400, array("error" => "invoice_cancelled"));
        $amount = isset($body["amount"]) ? intval(round(floatval($body["amount"]))) : 0;
        $paid = invoice_paid_amount($found);
        $already = invoice_refunded_amount($found);
        $remain = max(0, $paid - $already);
        if ($amount <= 0) $amount = $remain;
        if ($amount <= 0 || $amount > $remain) send_json(400, array("error" => "invalid_refund"));
        if (!isset($found["refunds"]) || !is_array($found["refunds"])) $found["refunds"] = array();
        $found["refunds"][] = array(
            "at" => $now,
            "amount" => $amount,
            "note" => clip_text((string) (isset($body["note"]) ? $body["note"] : ""), 200)
        );
        $found["updatedAt"] = $now;
        append_invoice_history($found, $amount >= $remain ? "refunded" : "partially_refunded");
        refresh_invoice_status($found);
    } elseif ($action === "cancel") {
        if (isset($found["status"]) && $found["status"] === "cancelled") {
            // already cancelled
        } else {
            $found["status"] = "cancelled";
            $found["updatedAt"] = $now;
            append_invoice_history($found, "cancelled");
        }
    } elseif ($action === "edit") {
        if (isset($found["status"]) && $found["status"] === "cancelled") send_json(400, array("error" => "invoice_cancelled"));
        if (array_key_exists("customerId", $body) || array_key_exists("customerName", $body) || array_key_exists("customerPhone", $body)) {
            list($custId, $nextCustomerName, $nextPhone) = resolve_customer_link($customersFile, $body, $found);
            if ((isset($found["status"]) ? $found["status"] : "") === "unpaid" && $nextCustomerName === "") {
                send_json(400, array(
                    "error" => "customer_required",
                    "message" => "برای فاکتور بدهکار نام مشتری الزامی است"
                ));
            }
            apply_customer_link($found, $custId, $nextCustomerName, $nextPhone);
        }
        if ((isset($found["status"]) ? $found["status"] : "") === "unpaid" && array_key_exists("discountType", $body)) {
            $subtotal = intval(isset($found["subtotal"]) ? $found["subtotal"] : 0);
            list($discountType, $discountValue, $discountAmount) = invoice_discount(
                $subtotal,
                isset($body["discountType"]) ? $body["discountType"] : "",
                isset($body["discountValue"]) ? $body["discountValue"] : 0
            );
            $found["discountType"] = $discountType;
            $found["discountValue"] = $discountValue;
            $found["discountAmount"] = $discountAmount;
            $found["total"] = max(0, $subtotal - $discountAmount + intval(isset($found["tax"]) ? $found["tax"] : 0));
        }
        $found["updatedAt"] = $now;
        append_invoice_history($found, "edited");
    } elseif ($action === "customer") {
        list($custId, $cname, $cphone) = resolve_customer_link($customersFile, $body, $found);
        apply_customer_link($found, $custId, $cname, $cphone);
        $found["updatedAt"] = $now;
        append_invoice_history($found, "customer");
    } else {
        send_json(400, array("error" => "invalid_action"));
    }

    $invoices[$foundIndex] = $found;
    write_json_file($invoicesFile, $invoices);
    send_json(200, array(
        "invoice" => $found,
        "invoices" => $invoices,
        "summary" => invoice_summary_cards($invoices)
    ));
}

// ── Payment terminals ───────────────────────────────────────────────
if ($route === "payment-terminals" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    send_json(200, array("terminals" => payment_sort_terminals(payment_read_list($paymentTerminalsFile))));
}

if ($route === "payment-terminals" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $terminals = payment_read_list($paymentTerminalsFile);
    $action = isset($body["action"]) ? (string) $body["action"] : "add";

    if ($action === "add") {
        $name = trim((string) (isset($body["name"]) ? $body["name"] : ""));
        if ($name === "") send_json(400, array("error" => "name_required"));
        if (!empty($body["isDefault"])) $terminals = payment_clear_defaults($terminals);
        $record = payment_normalize_terminal(array_merge($body, array("name" => $name)));
        $terminals[] = $record;
        payment_write_list($paymentTerminalsFile, $terminals);
        send_json(200, array("ok" => true, "terminal" => $record, "terminals" => payment_sort_terminals($terminals)));
    }

    if ($action === "update") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = payment_find_index($terminals, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($terminals[$idx]) ? $terminals[$idx] : array();
        $name = trim((string) (isset($body["name"]) ? $body["name"] : (isset($cur["name"]) ? $cur["name"] : "")));
        if ($name === "") send_json(400, array("error" => "name_required"));
        if (!empty($body["isDefault"])) $terminals = payment_clear_defaults($terminals, $id);
        $record = payment_normalize_terminal(array_merge($cur, $body, array("id" => $id, "name" => $name, "createdAt" => isset($cur["createdAt"]) ? $cur["createdAt"] : payment_now_ms())), $id);
        $terminals[$idx] = $record;
        payment_write_list($paymentTerminalsFile, $terminals);
        send_json(200, array("ok" => true, "terminal" => $record, "terminals" => payment_sort_terminals($terminals)));
    }

    if ($action === "set_default") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = payment_find_index($terminals, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $record = null;
        foreach ($terminals as $i => $row) {
            if (!is_array($row)) continue;
            $isTarget = $i === $idx;
            $terminals[$i] = payment_normalize_terminal(array_merge($row, array("isDefault" => $isTarget)));
            if ($isTarget) $record = $terminals[$i];
        }
        payment_write_list($paymentTerminalsFile, $terminals);
        send_json(200, array("ok" => true, "terminal" => $record, "terminals" => payment_sort_terminals($terminals)));
    }

    if ($action === "toggle") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = payment_find_index($terminals, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $cur = is_array($terminals[$idx]) ? $terminals[$idx] : array();
        $enabled = array_key_exists("isActive", $body) ? !!$body["isActive"] : (array_key_exists("enabled", $body) ? !!$body["enabled"] : empty($cur["isActive"]));
        $record = payment_normalize_terminal(array_merge($cur, array("isActive" => $enabled)), $id);
        $terminals[$idx] = $record;
        payment_write_list($paymentTerminalsFile, $terminals);
        send_json(200, array("ok" => true, "terminal" => $record, "terminals" => payment_sort_terminals($terminals)));
    }

    if ($action === "remove") {
        $id = trim((string) (isset($body["id"]) ? $body["id"] : ""));
        if ($id === "") send_json(400, array("error" => "id_required"));
        $idx = payment_find_index($terminals, $id);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        array_splice($terminals, $idx, 1);
        payment_write_list($paymentTerminalsFile, $terminals);
        send_json(200, array("ok" => true, "id" => $id, "terminals" => payment_sort_terminals($terminals)));
    }

    send_json(400, array("error" => "invalid_action"));
}

if ($route === "payment-agent" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $action = isset($body["action"]) ? (string) $body["action"] : "health";
    if ($action === "health") {
        $agent = payment_call_agent("health", array());
        if (is_array($agent)) send_json(200, $agent);
        send_json(200, array("ok" => true, "payment" => true, "providers" => payment_providers_meta(), "message" => "PHP payment domain ready (hardware via Local Agent)"));
    }
    if ($action === "providers") {
        send_json(200, array("ok" => true, "providers" => payment_providers_meta()));
    }
    if ($action === "discover") {
        $agent = payment_call_agent("discover", $body);
        if (is_array($agent)) send_json(200, $agent);
        send_json(200, array(
            "ok" => true,
            "devices" => array(),
            "message" => "USB/Bluetooth/LAN discovery requires the Local POS Agent on the cashier machine."
        ));
    }
    if ($action === "test") {
        $terminals = payment_read_list($paymentTerminalsFile);
        $tid = trim((string) (isset($body["terminalId"]) ? $body["terminalId"] : (isset($body["id"]) ? $body["id"] : "")));
        $idx = payment_find_index($terminals, $tid);
        if ($idx < 0) send_json(404, array("ok" => false, "error" => "TERMINAL_NOT_FOUND", "message" => "Terminal not found"));
        $terminal = $terminals[$idx];
        if (isset($terminal["provider"]) && $terminal["provider"] === "simulator") {
            send_json(200, array("ok" => true, "message" => "Simulator ready (no financial transaction)", "details" => array("provider" => "simulator")));
        }
        $agent = payment_call_agent("test", $body);
        if (is_array($agent)) send_json(!empty($agent["ok"]) ? 200 : 502, $agent);
        send_json(502, array(
            "ok" => false,
            "error" => "NOT_CONFIGURED",
            "message" => "Test connection requires Local POS Agent or a configured provider"
        ));
    }
    send_json(400, array("error" => "invalid_action"));
}

if ($route === "payment-item" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    $id = trim((string) $id);
    $payments = payment_read_list($paymentsFile);
    $idx = payment_find_index($payments, $id);
    if ($idx < 0) send_json(404, array("error" => "not_found"));
    send_json(200, array("payment" => payment_normalize_payment($payments[$idx])));
}

if ($route === "payments" && $method === "GET") {
    require_cashier($sessionsFile, $body);
    $payments = array();
    foreach (payment_read_list($paymentsFile) as $row) {
        if (is_array($row)) $payments[] = payment_normalize_payment($row);
    }
    usort($payments, function ($a, $b) {
        return intval($b["createdAt"]) - intval($a["createdAt"]);
    });
    send_json(200, array("payments" => $payments));
}

if ($route === "payments" && $method === "POST") {
    require_cashier($sessionsFile, $body);
    $action = isset($body["action"]) ? (string) $body["action"] : "sale";
    $payments = payment_read_list($paymentsFile);
    $terminals = payment_read_list($paymentTerminalsFile);

    if ($action === "list_by_invoice") {
        $inv = trim((string) (isset($body["invoiceId"]) ? $body["invoiceId"] : ""));
        $rows = array();
        foreach ($payments as $row) {
            if (is_array($row) && isset($row["invoiceId"]) && $row["invoiceId"] === $inv) {
                $rows[] = payment_normalize_payment($row);
            }
        }
        send_json(200, array("payments" => $rows));
    }

    if ($action === "attempts") {
        $pid = trim((string) (isset($body["paymentId"]) ? $body["paymentId"] : ""));
        $attempts = array();
        foreach (payment_read_list($paymentAttemptsFile) as $row) {
            if (is_array($row) && isset($row["paymentId"]) && $row["paymentId"] === $pid) {
                $attempts[] = payment_normalize_attempt($row);
            }
        }
        usort($attempts, function ($a, $b) {
            return intval($a["attemptNumber"]) - intval($b["attemptNumber"]);
        });
        send_json(200, array("attempts" => $attempts));
    }

    if ($action === "sale") {
        $pid = trim((string) (isset($body["paymentId"]) ? $body["paymentId"] : payment_new_id("pay_")));
        $idx = payment_find_index($payments, $pid);
        $existing = $idx >= 0 ? $payments[$idx] : null;
        if (is_array($existing)) {
            $payment = payment_normalize_payment($existing);
            if ($payment["status"] === "SUCCESS") {
                send_json(200, array(
                    "ok" => true,
                    "payment" => $payment,
                    "result" => array(
                        "success" => true,
                        "status" => "SUCCESS",
                        "paymentId" => $payment["id"],
                        "invoiceId" => $payment["invoiceId"],
                        "amount" => $payment["amount"],
                        "terminalId" => $payment["terminalId"],
                        "referenceNumber" => $payment["referenceNumber"],
                        "providerTransactionId" => $payment["providerTransactionId"],
                        "message" => "Idempotent replay",
                        "timestamp" => gmdate("c")
                    ),
                    "idempotent" => true
                ));
            }
            if (!payment_can_retry($payment)) {
                send_json(409, array(
                    "ok" => false,
                    "error" => "INQUIRY_REQUIRED",
                    "message" => "Payment already in flight or unknown — inquire before retry",
                    "payment" => $payment
                ));
            }
        }

        $amount = intval(isset($body["amount"]) ? $body["amount"] : 0);
        if ($amount <= 0) send_json(400, array("error" => "INVALID_AMOUNT", "message" => "Amount must be positive"));

        $tid = trim((string) (isset($body["terminalId"]) ? $body["terminalId"] : ""));
        $terminal = null;
        if ($tid !== "") {
            $tidx = payment_find_index($terminals, $tid);
            if ($tidx >= 0) $terminal = $terminals[$tidx];
        }
        if (!$terminal) {
            $station = trim((string) (isset($body["stationId"]) ? $body["stationId"] : ""));
            $terminal = payment_default_terminal($terminals, $station);
        }
        if (!$terminal) send_json(400, array("error" => "TERMINAL_NOT_FOUND", "message" => "No payment terminal configured"));

        $payment = payment_normalize_payment(array(
            "id" => $pid,
            "invoiceId" => isset($body["invoiceId"]) ? $body["invoiceId"] : "",
            "terminalId" => $terminal["id"],
            "provider" => $terminal["provider"],
            "amount" => $amount,
            "currency" => isset($body["currency"]) ? $body["currency"] : "IRT",
            "status" => "SENT_TO_TERMINAL",
            "merchantReference" => isset($body["merchantReference"]) ? $body["merchantReference"] : $pid,
            "createdAt" => is_array($existing) && isset($existing["createdAt"]) ? $existing["createdAt"] : payment_now_ms()
        ));
        if ($idx >= 0) $payments[$idx] = $payment;
        else $payments[] = $payment;
        payment_write_list($paymentsFile, $payments);

        $result = payment_run_sale($terminals, $payment, $body);
        if (isset($result["errorCode"]) && $result["errorCode"] === "TERMINAL_OFFLINE") {
            $payment = payment_apply_result($payment, array_merge($result, array("status" => "FAILED")));
        } elseif (isset($result["status"]) && $result["status"] === "UNKNOWN") {
            $payment = payment_apply_result($payment, $result);
        } else {
            $payment = payment_apply_result($payment, $result);
        }
        $pidx = payment_find_index($payments, $pid);
        if ($pidx >= 0) $payments[$pidx] = $payment;
        payment_write_list($paymentsFile, $payments);
        payment_append_attempt($paymentAttemptsFile, $pid, $payment["status"], array(
            "amount" => $amount,
            "terminalId" => $terminal["id"],
            "provider" => $terminal["provider"]
        ), array(
            "status" => isset($result["status"]) ? $result["status"] : null,
            "responseCode" => isset($result["responseCode"]) ? $result["responseCode"] : null,
            "errorCode" => isset($result["errorCode"]) ? $result["errorCode"] : (isset($result["error"]) ? $result["error"] : null),
            "message" => isset($result["message"]) ? $result["message"] : null,
            "referenceNumber" => isset($result["referenceNumber"]) ? $result["referenceNumber"] : null
        ));
        send_json(200, array(
            "ok" => true,
            "payment" => $payment,
            "result" => array(
                "success" => $payment["status"] === "SUCCESS",
                "status" => $payment["status"],
                "paymentId" => $payment["id"],
                "invoiceId" => $payment["invoiceId"],
                "amount" => $payment["amount"],
                "providerTransactionId" => $payment["providerTransactionId"],
                "referenceNumber" => $payment["referenceNumber"],
                "terminalId" => $payment["terminalId"],
                "responseCode" => $payment["responseCode"],
                "message" => isset($payment["message"]) ? $payment["message"] : (isset($result["message"]) ? $result["message"] : null),
                "timestamp" => isset($result["timestamp"]) ? $result["timestamp"] : gmdate("c"),
                "errorCode" => isset($result["errorCode"]) ? $result["errorCode"] : null
            )
        ));
    }

    if ($action === "inquiry") {
        $pid = trim((string) (isset($body["paymentId"]) ? $body["paymentId"] : ""));
        $idx = payment_find_index($payments, $pid);
        if ($idx < 0) send_json(404, array("error" => "not_found"));
        $payment = payment_normalize_payment($payments[$idx]);
        $provider = isset($payment["provider"]) ? $payment["provider"] : "";
        if ($provider === "simulator") {
            $result = payment_simulator_inquiry($pid, $payment);
        } else {
            $agent = payment_call_agent("inquiry", $body);
            $result = is_array($agent) ? $agent : array(
                "success" => false,
                "status" => "UNKNOWN",
                "paymentId" => $pid,
                "message" => "Inquiry requires Local POS Agent",
                "errorCode" => "AGENT_UNAVAILABLE"
            );
        }
        $payment = payment_apply_result($payment, $result);
        $payments[$idx] = $payment;
        payment_write_list($paymentsFile, $payments);
        payment_append_attempt($paymentAttemptsFile, $pid, "INQUIRY_" . $payment["status"], array("action" => "inquiry"), array(
            "status" => isset($result["status"]) ? $result["status"] : null,
            "message" => isset($result["message"]) ? $result["message"] : null,
            "referenceNumber" => isset($result["referenceNumber"]) ? $result["referenceNumber"] : null
        ));
        send_json(200, array(
            "ok" => true,
            "payment" => $payment,
            "result" => array(
                "success" => $payment["status"] === "SUCCESS",
                "status" => $payment["status"],
                "paymentId" => $payment["id"],
                "invoiceId" => $payment["invoiceId"],
                "amount" => $payment["amount"],
                "providerTransactionId" => $payment["providerTransactionId"],
                "referenceNumber" => $payment["referenceNumber"],
                "terminalId" => $payment["terminalId"],
                "responseCode" => $payment["responseCode"],
                "message" => $payment["message"],
                "timestamp" => isset($result["timestamp"]) ? $result["timestamp"] : gmdate("c")
            )
        ));
    }

    send_json(400, array("error" => "invalid_action"));
}

send_json(404, array("error" => "not_found"));
