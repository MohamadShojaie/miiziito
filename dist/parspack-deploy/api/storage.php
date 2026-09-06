<?php
/**
 * PostgreSQL storage layer for Miiziito.
 * When MIIZIITO_DATABASE_URL (or DATABASE_URL) is set, JSON collections are
 * stored in Postgres. Otherwise the caller falls back to JSON files.
 */

function lumiere_load_db_config() {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;
    $file = dirname(__DIR__) . "/data/db.local.php";
    if (is_file($file)) {
        require $file;
    }
}

function lumiere_db_url() {
    lumiere_load_db_config();
    $url = getenv("MIIZIITO_DATABASE_URL");
    if ($url === false || $url === "") {
        $url = getenv("LUMIERE_DATABASE_URL");
    }
    if ($url === false || $url === "") {
        $url = getenv("DATABASE_URL");
    }
    return ($url !== false && $url !== "") ? (string) $url : "";
}

function lumiere_db_enabled() {
    if (lumiere_db_url() === "") return false;
    return extension_loaded("pdo_pgsql");
}

/** True only when Postgres is configured and a live connection works. */
function lumiere_db_operational() {
    if (!lumiere_db_enabled()) return false;
    return lumiere_db_pdo() !== null;
}

function lumiere_db_pdo_reset() {
    $GLOBALS["__lumiere_pdo"] = null;
    $GLOBALS["__lumiere_pdo_failed_at"] = time();
}

function lumiere_db_pdo() {
    if (!isset($GLOBALS["__lumiere_pdo"])) $GLOBALS["__lumiere_pdo"] = null;
    if (!isset($GLOBALS["__lumiere_pdo_failed_at"])) $GLOBALS["__lumiere_pdo_failed_at"] = 0;

    if ($GLOBALS["__lumiere_pdo"] !== null) {
        return $GLOBALS["__lumiere_pdo"];
    }
    // Brief backoff after a failed connect, then retry (no permanent latch).
    if ($GLOBALS["__lumiere_pdo_failed_at"] > 0
        && (time() - $GLOBALS["__lumiere_pdo_failed_at"]) < 3) {
        return null;
    }
    if (!lumiere_db_enabled()) return null;

    $url = lumiere_db_url();
    $parts = parse_url($url);
    if (!$parts || empty($parts["host"])) {
        $GLOBALS["__lumiere_pdo_failed_at"] = time();
        return null;
    }

    $host = $parts["host"];
    $port = isset($parts["port"]) ? intval($parts["port"]) : 5432;
    $user = isset($parts["user"]) ? urldecode($parts["user"]) : "";
    $pass = isset($parts["pass"]) ? urldecode($parts["pass"]) : "";
    $db = isset($parts["path"]) ? ltrim($parts["path"], "/") : "lumiere";
    if ($db === "") $db = "lumiere";

    $dsn = "pgsql:host=" . $host . ";port=" . $port . ";dbname=" . $db;
    if (!empty($parts["query"])) {
        $query = array();
        parse_str($parts["query"], $query);
        foreach (array("sslmode", "sslcert", "sslkey", "sslrootcert", "options") as $opt) {
            if (!empty($query[$opt]) && is_string($query[$opt])) {
                $dsn .= ";" . $opt . "=" . $query[$opt];
            }
        }
    }

    try {
        $GLOBALS["__lumiere_pdo"] = new PDO($dsn, $user, $pass, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ));
        $GLOBALS["__lumiere_pdo_failed_at"] = 0;
        $GLOBALS["__lumiere_pdo_last_error"] = "";
    } catch (Exception $e) {
        $GLOBALS["__lumiere_pdo"] = null;
        $GLOBALS["__lumiere_pdo_failed_at"] = time();
        $GLOBALS["__lumiere_pdo_last_error"] = (string) $e->getMessage();
        return null;
    }
    return $GLOBALS["__lumiere_pdo"];
}

function lumiere_storage_map($file) {
    $file = str_replace("\\", "/", (string) $file);
    if (preg_match('#/data/tenants/([^/]+)/(orders|invoices|tables|menu-overrides|reservations|sessions)\\.json$#', $file, $m)) {
        return array(
            "sandbox" => "tenant:" . $m[1],
            "collection" => $m[2] === "menu-overrides" ? "menu_overrides" : $m[2],
        );
    }
    if (preg_match('#/data/(dev[0-9]*)/(orders|invoices|tables|menu-overrides|reservations|payment_terminals|payments|payment_attempts)\\.json$#', $file, $m)) {
        return array(
            "sandbox" => $m[1],
            "collection" => $m[2] === "menu-overrides" ? "menu_overrides" : $m[2],
        );
    }
    if (preg_match('#/data/(orders|invoices|tables|menu-overrides|reservations|payment_terminals|payments|payment_attempts)\\.json$#', $file, $m)) {
        return array(
            "sandbox" => "",
            "collection" => $m[1] === "menu-overrides" ? "menu_overrides" : $m[1],
        );
    }
    if (preg_match('#/data/sessions\\.json$#', $file)) {
        return array("sandbox" => "", "collection" => "sessions");
    }
    return null;
}

function lumiere_storage_sandbox_from_files($ordersFile, $tablesFile, $invoicesFile = "") {
    foreach (array($ordersFile, $tablesFile, $invoicesFile) as $file) {
        if ($file === "") continue;
        $map = lumiere_storage_map($file);
        if ($map) return $map["sandbox"];
    }
    return "";
}

function lumiere_storage_touch($pdo, $sandboxId) {
    $stmt = $pdo->prepare("INSERT INTO change_log (sandbox_id) VALUES (:sandbox)");
    $stmt->execute(array("sandbox" => $sandboxId));
    // Bound growth: keep recent change_log rows per sandbox.
    $prune = $pdo->prepare(
        "DELETE FROM change_log
         WHERE sandbox_id = :sandbox1
           AND id < COALESCE(
             (SELECT id FROM change_log WHERE sandbox_id = :sandbox2 ORDER BY id DESC OFFSET 2000 LIMIT 1),
             0
           )"
    );
    try {
        $prune->execute(array("sandbox1" => $sandboxId, "sandbox2" => $sandboxId));
    } catch (Exception $e) {
        // Non-fatal; stamp still recorded.
    }
}

function lumiere_storage_read($file, $default) {
    $map = lumiere_storage_map($file);
    if (!$map) return null;
    $pdo = lumiere_db_pdo();
    if (!$pdo) return null;

    try {
        $stmt = $pdo->prepare(
            "SELECT data FROM collections WHERE sandbox_id = :sandbox AND name = :name"
        );
        $stmt->execute(array(
            "sandbox" => $map["sandbox"],
            "name" => $map["collection"],
        ));
        $row = $stmt->fetch();
        if (!$row) return $default;
        $data = json_decode($row["data"], true);
        return $data !== null ? $data : $default;
    } catch (Exception $e) {
        lumiere_db_pdo_reset();
        return null;
    }
}

function lumiere_storage_write($file, $data) {
    $map = lumiere_storage_map($file);
    if (!$map) return false;
    $pdo = lumiere_db_pdo();
    if (!$pdo) return false;

    try {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare(
            "INSERT INTO collections (sandbox_id, name, data, updated_at)
             VALUES (:sandbox, :name, CAST(:data AS jsonb), now())
             ON CONFLICT (sandbox_id, name)
             DO UPDATE SET data = EXCLUDED.data, updated_at = now()"
        );
        $stmt->execute(array(
            "sandbox" => $map["sandbox"],
            "name" => $map["collection"],
            "data" => $json,
        ));
        lumiere_storage_touch($pdo, $map["sandbox"]);
        return true;
    } catch (Exception $e) {
        lumiere_db_pdo_reset();
        return false;
    }
}

function lumiere_storage_live_stamp($sandboxId) {
    $pdo = lumiere_db_pdo();
    if (!$pdo) return 0;

    try {
        // PDO pgsql does not reliably support reusing the same named parameter twice.
        $stmt = $pdo->prepare(
            "SELECT GREATEST(
                COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) * 1000 FROM collections WHERE sandbox_id = :sandbox1), 0),
                COALESCE((SELECT EXTRACT(EPOCH FROM MAX(happened_at)) * 1000 FROM change_log WHERE sandbox_id = :sandbox2), 0)
             ) AS stamp"
        );
        $stmt->execute(array(
            "sandbox1" => $sandboxId,
            "sandbox2" => $sandboxId,
        ));
        $row = $stmt->fetch();
        return $row ? intval($row["stamp"]) : 0;
    } catch (Exception $e) {
        lumiere_db_pdo_reset();
        return 0;
    }
}

function lumiere_storage_health() {
    if (!lumiere_db_enabled()) {
        return array("database" => "json_files");
    }
    $pdo = lumiere_db_pdo();
    if (!$pdo) {
        $detail = "connection_failed";
        if (!extension_loaded("pdo_pgsql")) {
            $detail = "pdo_pgsql_missing";
        } elseif (lumiere_db_url() === "") {
            $detail = "database_url_missing";
        }
        return array(
            "database" => "error",
            "detail" => $detail,
            "pdo_pgsql" => extension_loaded("pdo_pgsql"),
            "url_set" => lumiere_db_url() !== "",
            "hint" => isset($GLOBALS["__lumiere_pdo_last_error"])
                ? (string) $GLOBALS["__lumiere_pdo_last_error"]
                : "",
        );
    }
    try {
        $pdo->query("SELECT 1");
        return array("database" => "postgresql", "ok" => true);
    } catch (Exception $e) {
        lumiere_db_pdo_reset();
        return array("database" => "error", "detail" => "query_failed");
    }
}
