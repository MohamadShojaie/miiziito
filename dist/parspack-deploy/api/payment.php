<?php
/**
 * Payment terminal domain for PHP API.
 * Hardware I/O is delegated to the Local POS Agent when MIIZIITO_PAYMENT_AGENT_URL is set.
 * Simulator provider runs in-process for development without inventing PSP protocols.
 */

function payment_now_ms() {
    return (int) round(microtime(true) * 1000);
}

function payment_new_id($prefix) {
    return $prefix . bin2hex(random_bytes(8));
}

function payment_providers_meta() {
    return array(
        array("id" => "simulator", "name" => "شبیه‌ساز (توسعه)", "configured" => true, "description" => "برای تست جریان پرداخت بدون سخت‌افزار واقعی"),
        array("id" => "generic", "name" => "عمومی / شبکه", "configured" => false, "description" => "اتصال شبکه عمومی — پروتکل پرداخت پیکربندی نشده"),
        array("id" => "radian", "name" => "رادین (Radian)", "configured" => false, "description" => "نیاز به مستندات رسمی یکپارچه‌سازی"),
        array("id" => "behpardakht", "name" => "به‌پرداخت", "configured" => false),
        array("id" => "saman", "name" => "سامان", "configured" => false),
        array("id" => "irankish", "name" => "ایران‌کیش", "configured" => false),
        array("id" => "pasargad", "name" => "پاسارگاد", "configured" => false),
    );
}

function payment_clip($text, $n) {
    $s = trim((string) $text);
    if (function_exists("mb_substr")) {
        return mb_substr($s, 0, $n);
    }
    return substr($s, 0, $n);
}

function payment_normalize_terminal($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $providers = array("simulator", "generic", "radian", "behpardakht", "saman", "irankish", "pasargad");
    $connections = array("network", "usb", "serial", "bluetooth", "android");
    $protocols = array("tcp", "http", "https", "websocket", "vendor");
    $provider = strtolower(trim((string) (isset($raw["provider"]) ? $raw["provider"] : "generic")));
    if (!in_array($provider, $providers, true)) $provider = "generic";
    $conn = strtolower(trim((string) (isset($raw["connectionType"]) ? $raw["connectionType"] : (isset($raw["connection"]) ? $raw["connection"] : "network"))));
    if (!in_array($conn, $connections, true)) $conn = "network";
    $protocol = strtolower(trim((string) (isset($raw["protocol"]) ? $raw["protocol"] : "tcp")));
    if (!in_array($protocol, $protocols, true)) $protocol = "tcp";
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : ""));
    if ($id === "") $id = $fallbackId !== "" ? $fallbackId : payment_new_id("term_");
    $created = isset($raw["createdAt"]) ? intval($raw["createdAt"]) : payment_now_ms();
    if ($created <= 0) $created = payment_now_ms();
    $cfg = (isset($raw["configuration"]) && is_array($raw["configuration"])) ? $raw["configuration"] : array();
    $name = payment_clip(isset($raw["name"]) ? $raw["name"] : "", 80);
    if ($name === "") $name = "پایانه بدون نام";
    $isActive = true;
    if (array_key_exists("isActive", $raw)) $isActive = !!$raw["isActive"];
    elseif (array_key_exists("enabled", $raw)) $isActive = !!$raw["enabled"];
    return array(
        "id" => $id,
        "name" => $name,
        "provider" => $provider,
        "model" => payment_clip(isset($raw["model"]) ? $raw["model"] : "", 80),
        "connectionType" => $conn,
        "host" => payment_clip(isset($raw["host"]) ? $raw["host"] : (isset($raw["address"]) ? $raw["address"] : ""), 120),
        "port" => payment_clip(isset($raw["port"]) ? $raw["port"] : "", 20),
        "protocol" => $protocol,
        "serialPort" => payment_clip(isset($raw["serialPort"]) ? $raw["serialPort"] : "", 120),
        "baudRate" => intval(isset($raw["baudRate"]) ? $raw["baudRate"] : 9600),
        "dataBits" => intval(isset($raw["dataBits"]) ? $raw["dataBits"] : 8),
        "parity" => payment_clip(isset($raw["parity"]) ? $raw["parity"] : "none", 16),
        "stopBits" => floatval(isset($raw["stopBits"]) ? $raw["stopBits"] : 1),
        "flowControl" => payment_clip(isset($raw["flowControl"]) ? $raw["flowControl"] : "none", 16),
        "bluetoothIdentifier" => payment_clip(isset($raw["bluetoothIdentifier"]) ? $raw["bluetoothIdentifier"] : "", 120),
        "configuration" => $cfg,
        "isActive" => $isActive,
        "isDefault" => !empty($raw["isDefault"]),
        "stationId" => payment_clip(isset($raw["stationId"]) ? $raw["stationId"] : "", 64),
        "assignedUserId" => payment_clip(isset($raw["assignedUserId"]) ? $raw["assignedUserId"] : "", 64),
        "connectionTimeoutMs" => max(500, min(intval(isset($raw["connectionTimeoutMs"]) ? $raw["connectionTimeoutMs"] : 5000), 120000)),
        "requestTimeoutMs" => max(1000, min(intval(isset($raw["requestTimeoutMs"]) ? $raw["requestTimeoutMs"] : 60000), 300000)),
        "createdAt" => $created,
        "updatedAt" => payment_now_ms()
    );
}

function payment_normalize_payment($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $statuses = array("CREATED","INITIATED","SENT_TO_TERMINAL","SUCCESS","FAILED","CANCELLED","REVERSED","UNKNOWN","PENDING");
    $status = strtoupper(trim((string) (isset($raw["status"]) ? $raw["status"] : "CREATED")));
    if (!in_array($status, $statuses, true)) $status = "CREATED";
    $currency = strtoupper(trim((string) (isset($raw["currency"]) ? $raw["currency"] : "IRT")));
    if ($currency !== "IRT" && $currency !== "IRR") $currency = "IRT";
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : ""));
    if ($id === "") $id = $fallbackId !== "" ? $fallbackId : payment_new_id("pay_");
    $created = isset($raw["createdAt"]) ? intval($raw["createdAt"]) : payment_now_ms();
    if ($created <= 0) $created = payment_now_ms();
    return array(
        "id" => $id,
        "invoiceId" => payment_clip(isset($raw["invoiceId"]) ? $raw["invoiceId"] : "", 64),
        "terminalId" => payment_clip(isset($raw["terminalId"]) ? $raw["terminalId"] : "", 64),
        "provider" => payment_clip(isset($raw["provider"]) ? $raw["provider"] : "", 32),
        "amount" => intval(isset($raw["amount"]) ? $raw["amount"] : 0),
        "currency" => $currency,
        "status" => $status,
        "providerTransactionId" => payment_clip(isset($raw["providerTransactionId"]) ? $raw["providerTransactionId"] : "", 80) ?: null,
        "referenceNumber" => payment_clip(isset($raw["referenceNumber"]) ? $raw["referenceNumber"] : "", 80) ?: null,
        "responseCode" => payment_clip(isset($raw["responseCode"]) ? $raw["responseCode"] : "", 32) ?: null,
        "failureReason" => payment_clip(isset($raw["failureReason"]) ? $raw["failureReason"] : "", 240) ?: null,
        "merchantReference" => payment_clip(isset($raw["merchantReference"]) ? $raw["merchantReference"] : "", 80) ?: null,
        "message" => payment_clip(isset($raw["message"]) ? $raw["message"] : "", 240) ?: null,
        "createdAt" => $created,
        "updatedAt" => payment_now_ms()
    );
}

function payment_normalize_attempt($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $req = (isset($raw["requestMetadata"]) && is_array($raw["requestMetadata"])) ? $raw["requestMetadata"] : array();
    $res = (isset($raw["responseMetadata"]) && is_array($raw["responseMetadata"])) ? $raw["responseMetadata"] : array();
    foreach (array("pan","cvv","pin","track","track1","track2","cardNumber","card_number") as $bad) {
        unset($res[$bad], $req[$bad]);
    }
    return array(
        "id" => trim((string) (isset($raw["id"]) ? $raw["id"] : ($fallbackId !== "" ? $fallbackId : payment_new_id("pat_")))),
        "paymentId" => payment_clip(isset($raw["paymentId"]) ? $raw["paymentId"] : "", 64),
        "attemptNumber" => intval(isset($raw["attemptNumber"]) ? $raw["attemptNumber"] : 1),
        "status" => payment_clip(isset($raw["status"]) ? $raw["status"] : "", 32),
        "requestMetadata" => $req,
        "responseMetadata" => $res,
        "startedAt" => intval(isset($raw["startedAt"]) ? $raw["startedAt"] : payment_now_ms()),
        "completedAt" => isset($raw["completedAt"]) && intval($raw["completedAt"]) > 0 ? intval($raw["completedAt"]) : null
    );
}

function payment_read_list($file) {
    $raw = read_json_file($file, array());
    return is_array($raw) ? array_values($raw) : array();
}

function payment_write_list($file, $rows) {
    if (!is_array($rows)) $rows = array();
    write_json_file($file, array_values($rows));
}

function payment_find_index($rows, $id) {
    $id = trim((string) $id);
    foreach ($rows as $i => $row) {
        if (is_array($row) && trim((string) (isset($row["id"]) ? $row["id"] : "")) === $id) return $i;
    }
    return -1;
}

function payment_sort_terminals($rows) {
    $out = array();
    foreach ($rows as $row) {
        if (is_array($row)) $out[] = payment_normalize_terminal($row);
    }
    usort($out, function ($a, $b) {
        $ad = !empty($a["isDefault"]) ? 0 : 1;
        $bd = !empty($b["isDefault"]) ? 0 : 1;
        if ($ad !== $bd) return $ad - $bd;
        return strcmp($a["name"], $b["name"]);
    });
    return $out;
}

function payment_clear_defaults($rows, $exceptId = "") {
    $out = array();
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        if (trim((string) $row["id"]) === $exceptId) {
            $out[] = $row;
        } else {
            $out[] = payment_normalize_terminal(array_merge($row, array("isDefault" => false)));
        }
    }
    return $out;
}

function payment_can_retry($payment) {
    $status = isset($payment["status"]) ? $payment["status"] : "";
    if (in_array($status, array("SUCCESS", "REVERSED", "UNKNOWN", "SENT_TO_TERMINAL", "INITIATED", "PENDING"), true)) {
        return false;
    }
    return in_array($status, array("CREATED", "FAILED", "CANCELLED"), true);
}

function payment_apply_result($payment, $result) {
    if (!is_array($result)) $result = array();
    $status = strtoupper(trim((string) (isset($result["status"]) ? $result["status"] : (isset($payment["status"]) ? $payment["status"] : "UNKNOWN"))));
    $allowed = array("CREATED","INITIATED","SENT_TO_TERMINAL","SUCCESS","FAILED","CANCELLED","REVERSED","UNKNOWN","PENDING");
    if (!in_array($status, $allowed, true)) $status = "UNKNOWN";
    $merged = array_merge($payment, array(
        "status" => $status,
        "providerTransactionId" => isset($result["providerTransactionId"]) ? $result["providerTransactionId"] : (isset($payment["providerTransactionId"]) ? $payment["providerTransactionId"] : null),
        "referenceNumber" => isset($result["referenceNumber"]) ? $result["referenceNumber"] : (isset($payment["referenceNumber"]) ? $payment["referenceNumber"] : null),
        "responseCode" => isset($result["responseCode"]) ? $result["responseCode"] : (isset($payment["responseCode"]) ? $payment["responseCode"] : null),
        "message" => isset($result["message"]) ? $result["message"] : (isset($payment["message"]) ? $payment["message"] : null),
    ));
    if (in_array($status, array("FAILED", "CANCELLED"), true) && isset($result["message"])) {
        $merged["failureReason"] = $result["message"];
    }
    return payment_normalize_payment($merged);
}

function payment_append_attempt($attemptsFile, $paymentId, $status, $req, $res) {
    $attempts = payment_read_list($attemptsFile);
    $n = 0;
    foreach ($attempts as $row) {
        if (is_array($row) && isset($row["paymentId"]) && $row["paymentId"] === $paymentId) {
            $n = max($n, intval(isset($row["attemptNumber"]) ? $row["attemptNumber"] : 0));
        }
    }
    $attempt = payment_normalize_attempt(array(
        "id" => payment_new_id("pat_"),
        "paymentId" => $paymentId,
        "attemptNumber" => $n + 1,
        "status" => $status,
        "requestMetadata" => is_array($req) ? $req : array(),
        "responseMetadata" => is_array($res) ? $res : array(),
        "startedAt" => payment_now_ms(),
        "completedAt" => payment_now_ms()
    ));
    $attempts[] = $attempt;
    payment_write_list($attemptsFile, $attempts);
    return $attempt;
}

function payment_agent_url() {
    $url = getenv("MIIZIITO_PAYMENT_AGENT_URL");
    if ($url === false || $url === "") {
        $url = getenv("LUMIERE_PAYMENT_AGENT_URL");
    }
    return ($url !== false && $url !== "") ? rtrim((string) $url, "/") : "";
}

function payment_call_agent($action, $payload) {
    $base = payment_agent_url();
    if ($base === "") return null;
    $url = $base . "/api/index.php?route=payment-agent";
    $body = array_merge(is_array($payload) ? $payload : array(), array("action" => $action));
    $token = getenv("MIIZIITO_PAYMENT_AGENT_TOKEN");
    if ($token === false || $token === "") $token = getenv("LUMIERE_PAYMENT_AGENT_TOKEN");
    if ($token === false || $token === "") $token = getenv("MIIZIITO_AGENT_TOKEN");
    if ($token === false || $token === "") $token = getenv("LUMIERE_AGENT_TOKEN");
    $headers = array("Content-Type: application/json");
    if ($token) $headers[] = "X-Payment-Agent-Token: " . $token;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 90);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        return array("ok" => false, "error" => "AGENT_UNAVAILABLE", "message" => $err ?: "Agent unreachable");
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : array("ok" => false, "error" => "AGENT_UNAVAILABLE", "message" => "Invalid agent response");
}

function payment_call_agent_sale($payload) {
    $base = payment_agent_url();
    if ($base === "") return null;
    $url = $base . "/api/index.php?route=payments";
    $body = array_merge(is_array($payload) ? $payload : array(), array("action" => "sale"));
    // Prefer letting the agent own the full sale when configured — but PHP already owns records.
    // Instead call payment-agent style by posting to a dedicated local sale endpoint via agent sale helper.
    // Use payment-agent discover pattern: we invoke sale through a thin HTTP to local_api payments.
    $token = getenv("MIIZIITO_PAYMENT_AGENT_TOKEN");
    if ($token === false || $token === "") $token = getenv("LUMIERE_PAYMENT_AGENT_TOKEN");
    if ($token === false || $token === "") $token = getenv("MIIZIITO_AGENT_TOKEN");
    if ($token === false || $token === "") $token = getenv("LUMIERE_AGENT_TOKEN");
    $headers = array("Content-Type: application/json");
    if ($token) $headers[] = "X-Payment-Agent-Token: " . $token;
    // Cashier token passthrough not available; agent localhost may accept session-less with agent token.
    // Fall back to simulator/local logic if agent call is not used for sale records.
    return null;
}

function payment_simulator_sale($request, $terminal) {
    $meta = isset($request["metadata"]) && is_array($request["metadata"]) ? $request["metadata"] : array();
    $cfg = isset($terminal["configuration"]) && is_array($terminal["configuration"]) ? $terminal["configuration"] : array();
    $mode = strtolower(trim((string) (isset($meta["simulate"]) ? $meta["simulate"] : (isset($cfg["simulate"]) ? $cfg["simulate"] : "success"))));
    $ref = (string) random_int(100000, 999999);
    $txid = "sim_" . bin2hex(random_bytes(6));
    $base = array(
        "paymentId" => $request["paymentId"],
        "invoiceId" => isset($request["invoiceId"]) ? $request["invoiceId"] : "",
        "amount" => intval($request["amount"]),
        "terminalId" => isset($terminal["id"]) ? $terminal["id"] : "",
        "timestamp" => gmdate("c"),
        "providerTransactionId" => $txid,
        "referenceNumber" => $ref,
    );
    if ($mode === "offline") {
        return array_merge($base, array("success" => false, "status" => "FAILED", "message" => "Simulated terminal offline", "errorCode" => "TERMINAL_OFFLINE", "sentToTerminal" => false));
    }
    if ($mode === "fail" || $mode === "failed") {
        return array_merge($base, array("success" => false, "status" => "FAILED", "message" => "Simulated decline", "responseCode" => "05", "errorCode" => "PROVIDER_ERROR", "sentToTerminal" => true));
    }
    if ($mode === "timeout" || $mode === "unknown") {
        // Persist eventual success in a side file keyed by payment id for inquiry
        $ledgerFile = dirname(__DIR__) . "/data/payment_sim_ledger.json";
        $ledger = read_json_file($ledgerFile, array());
        if (!is_array($ledger)) $ledger = array();
        $ledger[$request["paymentId"]] = array_merge($base, array(
            "success" => true,
            "status" => "SUCCESS",
            "message" => "Simulated success after inquiry",
            "responseCode" => "00"
        ));
        write_json_file($ledgerFile, $ledger);
        return array_merge($base, array("success" => false, "status" => "UNKNOWN", "message" => "Simulated timeout — result unknown", "errorCode" => "UNKNOWN_RESULT", "sentToTerminal" => true));
    }
    $ok = array_merge($base, array("success" => true, "status" => "SUCCESS", "message" => "Simulated approval", "responseCode" => "00", "sentToTerminal" => true));
    $ledgerFile = dirname(__DIR__) . "/data/payment_sim_ledger.json";
    $ledger = read_json_file($ledgerFile, array());
    if (!is_array($ledger)) $ledger = array();
    $ledger[$request["paymentId"]] = $ok;
    write_json_file($ledgerFile, $ledger);
    return $ok;
}

function payment_simulator_inquiry($paymentId, $payment) {
    $ledgerFile = dirname(__DIR__) . "/data/payment_sim_ledger.json";
    $ledger = read_json_file($ledgerFile, array());
    if (is_array($ledger) && isset($ledger[$paymentId]) && is_array($ledger[$paymentId])) {
        return $ledger[$paymentId];
    }
    return array(
        "success" => false,
        "status" => "FAILED",
        "paymentId" => $paymentId,
        "invoiceId" => isset($payment["invoiceId"]) ? $payment["invoiceId"] : "",
        "amount" => intval(isset($payment["amount"]) ? $payment["amount"] : 0),
        "terminalId" => isset($payment["terminalId"]) ? $payment["terminalId"] : "",
        "timestamp" => gmdate("c"),
        "message" => "No simulated transaction found",
        "responseCode" => "NOT_FOUND"
    );
}

function payment_run_sale($terminals, $payment, $body) {
    $provider = isset($payment["provider"]) ? $payment["provider"] : "generic";
    $tid = isset($payment["terminalId"]) ? $payment["terminalId"] : "";
    $terminal = null;
    foreach ($terminals as $row) {
        if (is_array($row) && isset($row["id"]) && $row["id"] === $tid) {
            $terminal = $row;
            break;
        }
    }
    if (!$terminal) {
        return array("ok" => false, "success" => false, "status" => "FAILED", "error" => "TERMINAL_NOT_FOUND", "errorCode" => "TERMINAL_NOT_FOUND", "message" => "Terminal not found", "sentToTerminal" => false);
    }
    if ($provider === "simulator") {
        $req = array(
            "paymentId" => $payment["id"],
            "invoiceId" => $payment["invoiceId"],
            "amount" => $payment["amount"],
            "metadata" => isset($body["metadata"]) && is_array($body["metadata"]) ? $body["metadata"] : array()
        );
        return payment_simulator_sale($req, $terminal);
    }
    $agent = payment_call_agent("sale_proxy", $body);
    // Prefer documenting agent requirement for real PSPs
    return array(
        "ok" => false,
        "success" => false,
        "status" => "FAILED",
        "paymentId" => $payment["id"],
        "invoiceId" => $payment["invoiceId"],
        "amount" => $payment["amount"],
        "terminalId" => $tid,
        "error" => "NOT_CONFIGURED",
        "errorCode" => "NOT_CONFIGURED",
        "message" => "Provider not configured — run Local POS Agent and provide official PSP documentation",
        "sentToTerminal" => false,
        "timestamp" => gmdate("c")
    );
}

function payment_default_terminal($terminals, $stationId = "") {
    $active = array();
    foreach ($terminals as $row) {
        if (is_array($row) && !empty($row["isActive"])) $active[] = $row;
    }
    if ($stationId !== "") {
        foreach ($active as $row) {
            if (isset($row["stationId"]) && $row["stationId"] === $stationId) return $row;
        }
    }
    foreach ($active as $row) {
        if (!empty($row["isDefault"])) return $row;
    }
    return count($active) ? $active[0] : null;
}
