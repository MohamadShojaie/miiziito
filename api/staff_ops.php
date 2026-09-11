<?php
/** Staff ops: employees, attendance, checklists — used by api/index.php */

function default_staff_sections() {
    return array(
        array("id" => "waiter", "name" => "سالن", "access" => "tasks", "active" => true),
        array("id" => "kitchen", "name" => "آشپزخانه", "access" => "tasks", "active" => true),
        array("id" => "bar", "name" => "بار", "access" => "tasks", "active" => true),
        array("id" => "cashier", "name" => "صندوق", "access" => "pos", "active" => true),
    );
}

function default_staff_ops_data() {
    return array(
        "sections" => default_staff_sections(),
        "employees" => array(),
        "templates" => array(),
        "runs" => array(),
        "attendance" => array(),
    );
}

function sanitize_section_id($raw) {
    $value = preg_replace('/[^a-zA-Z0-9_-]/', '', trim((string) $raw));
    return substr((string) $value, 0, 40);
}

function normalize_staff_section($raw, $knownIds = null) {
    $value = sanitize_section_id($raw);
    if (is_array($knownIds)) {
        $ids = array();
        foreach ($knownIds as $id) {
            $sid = sanitize_section_id($id);
            if ($sid !== "") $ids[] = $sid;
        }
        if ($value !== "" && in_array($value, $ids, true)) return $value;
        return count($ids) > 0 ? $ids[0] : "waiter";
    }
    return $value !== "" ? $value : "waiter";
}

function new_staff_id($prefix) {
    $hex = bin2hex(function_exists("random_bytes") ? random_bytes(6) : openssl_random_pseudo_bytes(6));
    return $prefix . "_" . $hex;
}

function normalize_staff_section_def($raw, $fallbackId = "") {
    if (!is_array($raw)) $raw = array();
    $id = sanitize_section_id(isset($raw["id"]) ? $raw["id"] : $fallbackId);
    $name = trim((string) (isset($raw["name"]) ? $raw["name"] : ""));
    if (function_exists("clip_text")) $name = clip_text($name, 80);
    else $name = substr($name, 0, 80);
    if ($id === "" && $name !== "") $id = new_staff_id("sec");
    $access = (isset($raw["access"]) && (string) $raw["access"] === "pos") ? "pos" : "tasks";
    return array(
        "id" => $id,
        "name" => $name,
        "access" => $access,
        "active" => !isset($raw["active"]) || !!$raw["active"],
    );
}

function resolve_section_access($data, $sectionId) {
    $sid = sanitize_section_id($sectionId);
    if (is_array($data) && isset($data["sections"]) && is_array($data["sections"])) {
        foreach ($data["sections"] as $row) {
            if (!is_array($row)) continue;
            if (sanitize_section_id(isset($row["id"]) ? $row["id"] : "") === $sid) {
                return (isset($row["access"]) && (string) $row["access"] === "pos") ? "pos" : "tasks";
            }
        }
    }
    return $sid === "cashier" ? "pos" : "tasks";
}

function staff_ops_hash_password($password) {
    if (function_exists("lumiere_sa_hash_password")) {
        return lumiere_sa_hash_password($password);
    }
    $salt = bin2hex(function_exists("random_bytes") ? random_bytes(16) : openssl_random_pseudo_bytes(16));
    $digest = hash_pbkdf2("sha256", (string) $password, $salt, 120000, 0, false);
    return "pbkdf2$" . $salt . "$" . $digest;
}

function staff_ops_verify_password($password, $stored) {
    if (function_exists("lumiere_sa_verify_password")) {
        return lumiere_sa_verify_password($password, $stored);
    }
    $parts = explode("$", (string) $stored, 3);
    if (count($parts) !== 3 || $parts[0] !== "pbkdf2") return false;
    $digest = hash_pbkdf2("sha256", (string) $password, $parts[1], 120000, 0, false);
    return hash_equals($parts[2], $digest);
}

function tehran_today() {
    try {
        $tz = new DateTimeZone("Asia/Tehran");
        $dt = new DateTime("now", $tz);
        return $dt->format("Y-m-d");
    } catch (Exception $e) {
        return date("Y-m-d");
    }
}

function normalize_staff_employee($raw, $fallbackId = "", $keepHash = "", $keepPlain = "", $knownIds = null) {
    if (!is_array($raw)) $raw = array();
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : $fallbackId));
    if ($id === "") $id = new_staff_id("emp");
    $name = trim((string) (isset($raw["name"]) ? $raw["name"] : ""));
    if (function_exists("clip_text")) $name = clip_text($name, 80);
    else $name = substr($name, 0, 80);
    $hash = trim((string) (isset($raw["passwordHash"]) ? $raw["passwordHash"] : ""));
    if ($hash === "") $hash = trim((string) $keepHash);
    $plain = trim((string) (isset($raw["passwordPlain"]) ? $raw["passwordPlain"] : ""));
    if ($plain === "") $plain = trim((string) $keepPlain);
    if (function_exists("clip_text")) $plain = clip_text($plain, 120);
    else $plain = substr($plain, 0, 120);
    return array(
        "id" => $id,
        "name" => $name,
        "passwordHash" => $hash,
        "passwordPlain" => $plain,
        "section" => normalize_staff_section(isset($raw["section"]) ? $raw["section"] : "waiter", $knownIds),
        "active" => !isset($raw["active"]) || !!$raw["active"],
    );
}

function normalize_staff_template_items($raw) {
    $items = array();
    if (!is_array($raw)) return $items;
    foreach ($raw as $row) {
        if (!is_array($row)) continue;
        $id = trim((string) (isset($row["id"]) ? $row["id"] : ""));
        if ($id === "") $id = new_staff_id("ti");
        $label = trim((string) (isset($row["label"]) ? $row["label"] : ""));
        if ($label === "") continue;
        if (function_exists("clip_text")) $label = clip_text($label, 160);
        else $label = substr($label, 0, 160);
        $items[] = array("id" => $id, "label" => $label);
    }
    return $items;
}

function normalize_staff_template($raw, $fallbackId = "", $knownIds = null) {
    if (!is_array($raw)) $raw = array();
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : $fallbackId));
    if ($id === "") $id = new_staff_id("tpl");
    $title = trim((string) (isset($raw["title"]) ? $raw["title"] : ""));
    if (function_exists("clip_text")) $title = clip_text($title, 120);
    else $title = substr($title, 0, 120);
    return array(
        "id" => $id,
        "section" => normalize_staff_section(isset($raw["section"]) ? $raw["section"] : "waiter", $knownIds),
        "title" => $title,
        "items" => normalize_staff_template_items(isset($raw["items"]) ? $raw["items"] : array()),
        "active" => !isset($raw["active"]) || !!$raw["active"],
    );
}

function normalize_staff_run_items($raw) {
    $items = array();
    if (!is_array($raw)) return $items;
    foreach ($raw as $row) {
        if (!is_array($row)) continue;
        $id = trim((string) (isset($row["id"]) ? $row["id"] : ""));
        $label = trim((string) (isset($row["label"]) ? $row["label"] : ""));
        if ($id === "" || $label === "") continue;
        $item = array(
            "id" => $id,
            "label" => function_exists("clip_text") ? clip_text($label, 160) : substr($label, 0, 160),
            "done" => !empty($row["done"]),
        );
        if ($item["done"] && isset($row["doneAt"])) $item["doneAt"] = intval($row["doneAt"]);
        $items[] = $item;
    }
    return $items;
}

function normalize_staff_run($raw, $fallbackId = "", $knownIds = null) {
    if (!is_array($raw)) $raw = array();
    $id = trim((string) (isset($raw["id"]) ? $raw["id"] : $fallbackId));
    if ($id === "") $id = new_staff_id("run");
    $status = trim((string) (isset($raw["status"]) ? $raw["status"] : "open"));
    if (!in_array($status, array("open", "submitted", "approved", "rejected"), true)) $status = "open";
    $out = array(
        "id" => $id,
        "date" => substr(trim((string) (isset($raw["date"]) ? $raw["date"] : "")), 0, 16),
        "employeeId" => trim((string) (isset($raw["employeeId"]) ? $raw["employeeId"] : "")),
        "templateId" => trim((string) (isset($raw["templateId"]) ? $raw["templateId"] : "")),
        "section" => normalize_staff_section(isset($raw["section"]) ? $raw["section"] : "waiter", $knownIds),
        "items" => normalize_staff_run_items(isset($raw["items"]) ? $raw["items"] : array()),
        "status" => $status,
    );
    if (!empty($raw["submittedAt"])) $out["submittedAt"] = intval($raw["submittedAt"]);
    if (!empty($raw["reviewedAt"])) $out["reviewedAt"] = intval($raw["reviewedAt"]);
    $note = trim((string) (isset($raw["reviewNote"]) ? $raw["reviewNote"] : ""));
    if ($note !== "") {
        $out["reviewNote"] = function_exists("clip_text") ? clip_text($note, 400) : substr($note, 0, 400);
    }
    return $out;
}

function normalize_attendance_day($raw) {
    if (!is_array($raw)) $raw = array();
    $date = substr(trim((string) (isset($raw["date"]) ? $raw["date"] : "")), 0, 16);
    $marks = array();
    if (isset($raw["marks"]) && is_array($raw["marks"])) {
        foreach ($raw["marks"] as $row) {
            if (!is_array($row)) continue;
            $eid = trim((string) (isset($row["employeeId"]) ? $row["employeeId"] : ""));
            if ($eid === "") continue;
            $marks[] = array(
                "employeeId" => $eid,
                "status" => (isset($row["status"]) && (string) $row["status"] === "absent") ? "absent" : "present",
                "at" => isset($row["at"]) ? intval($row["at"]) : 0,
                "by" => (isset($row["by"]) && (string) $row["by"] === "self") ? "self" : "manager",
            );
        }
    }
    return array("date" => $date, "marks" => $marks);
}

function normalize_staff_ops_data($raw) {
    $base = default_staff_ops_data();
    if (!is_array($raw)) return $base;
    $sections = array();
    $seen = array();
    if (isset($raw["sections"]) && is_array($raw["sections"])) {
        foreach ($raw["sections"] as $row) {
            if (!is_array($row)) continue;
            $item = normalize_staff_section_def($row);
            if ($item["id"] === "" || $item["name"] === "" || isset($seen[$item["id"]])) continue;
            $seen[$item["id"]] = true;
            $sections[] = $item;
        }
    }
    if (count($sections) === 0) $sections = default_staff_sections();
    $knownIds = array();
    foreach ($sections as $s) $knownIds[] = $s["id"];
    $employees = array();
    if (isset($raw["employees"]) && is_array($raw["employees"])) {
        foreach ($raw["employees"] as $row) {
            $item = normalize_staff_employee($row, "", "", "", $knownIds);
            if ($item["name"] !== "" && $item["passwordHash"] !== "") $employees[] = $item;
        }
    }
    $templates = array();
    if (isset($raw["templates"]) && is_array($raw["templates"])) {
        foreach ($raw["templates"] as $row) {
            $item = normalize_staff_template($row, "", $knownIds);
            if ($item["title"] !== "") $templates[] = $item;
        }
    }
    $runs = array();
    if (isset($raw["runs"]) && is_array($raw["runs"])) {
        foreach ($raw["runs"] as $row) {
            $item = normalize_staff_run($row, "", $knownIds);
            if ($item["id"] !== "" && $item["employeeId"] !== "" && $item["templateId"] !== "") $runs[] = $item;
        }
    }
    $attendance = array();
    if (isset($raw["attendance"]) && is_array($raw["attendance"])) {
        foreach ($raw["attendance"] as $row) {
            $day = normalize_attendance_day($row);
            if ($day["date"] !== "") $attendance[] = $day;
        }
    }
    $base["sections"] = $sections;
    $base["employees"] = $employees;
    $base["templates"] = $templates;
    $base["runs"] = $runs;
    $base["attendance"] = $attendance;
    return $base;
}

function read_staff_ops($staffOpsFile) {
    return normalize_staff_ops_data(read_json_file($staffOpsFile, default_staff_ops_data()));
}

function write_staff_ops($staffOpsFile, $data) {
    write_json_file($staffOpsFile, normalize_staff_ops_data($data));
}

function public_staff_ops($data) {
    $data = normalize_staff_ops_data($data);
    $employees = array();
    foreach ($data["employees"] as $emp) {
        $employees[] = array(
            "id" => $emp["id"],
            "name" => $emp["name"],
            "section" => $emp["section"],
            "active" => $emp["active"],
            "password" => isset($emp["passwordPlain"]) ? (string) $emp["passwordPlain"] : "",
        );
    }
    return array(
        "sections" => $data["sections"],
        "employees" => $employees,
        "templates" => $data["templates"],
        "runs" => $data["runs"],
        "attendance" => $data["attendance"],
    );
}

function filter_staff_ops_for_employee($data, $employeeId, $section, $date = "") {
    $pub = public_staff_ops($data);
    $employeeId = trim((string) $employeeId);
    $section = normalize_staff_section($section);
    $date = trim((string) $date);
    if ($date === "") $date = tehran_today();
    $emps = array();
    foreach ($pub["employees"] as $e) {
        if ((string) $e["id"] !== $employeeId) continue;
        unset($e["password"]);
        $emps[] = $e;
    }
    $tpls = array();
    foreach ($pub["templates"] as $t) {
        if ((string) $t["section"] === $section) $tpls[] = $t;
    }
    $runs = array();
    foreach ($pub["runs"] as $r) {
        if ((string) $r["employeeId"] !== $employeeId) continue;
        $runs[] = $r;
    }
    $att = array();
    foreach ($pub["attendance"] as $a) {
        if ((string) $a["date"] !== $date) continue;
        $marks = array();
        foreach ($a["marks"] as $m) {
            if ((string) $m["employeeId"] === $employeeId) $marks[] = $m;
        }
        $att[] = array("date" => $date, "marks" => $marks);
    }
    $pub["employees"] = $emps;
    $pub["templates"] = $tpls;
    $pub["runs"] = $runs;
    $pub["attendance"] = $att;
    return $pub;
}

function find_staff_list_index($list, $id) {
    if (!is_array($list)) return -1;
    $id = trim((string) $id);
    if ($id === "") return -1;
    foreach ($list as $i => $row) {
        if (!is_array($row)) continue;
        if ((string) (isset($row["id"]) ? $row["id"] : "") === $id) return $i;
    }
    return -1;
}

function find_staff_employee_by_password($data, $password) {
    if (!is_array($data) || !isset($data["employees"]) || !is_array($data["employees"])) return null;
    foreach ($data["employees"] as $emp) {
        if (!is_array($emp) || (isset($emp["active"]) && !$emp["active"])) continue;
        $stored = isset($emp["passwordHash"]) ? (string) $emp["passwordHash"] : "";
        if ($stored !== "" && staff_ops_verify_password($password, $stored)) return $emp;
    }
    return null;
}

function staff_password_taken($data, $password, $excludeId = "") {
    $excludeId = trim((string) $excludeId);
    if (!is_array($data) || !isset($data["employees"])) return false;
    foreach ($data["employees"] as $emp) {
        if (!is_array($emp)) continue;
        if ($excludeId !== "" && (string) (isset($emp["id"]) ? $emp["id"] : "") === $excludeId) continue;
        if (isset($emp["active"]) && !$emp["active"]) continue;
        $stored = isset($emp["passwordHash"]) ? (string) $emp["passwordHash"] : "";
        if ($stored !== "" && staff_ops_verify_password($password, $stored)) return true;
    }
    return false;
}

function ensure_staff_runs_for_date($staffOpsFile, $data, $date, $employeeId = "") {
    $date = trim((string) $date);
    if ($date === "") $date = tehran_today();
    $employeeId = trim((string) $employeeId);
    $existing = array();
    foreach ($data["runs"] as $r) {
        if (!is_array($r)) continue;
        $key = (string) $r["employeeId"] . "|" . (string) $r["templateId"] . "|" . (string) $r["date"];
        $existing[$key] = true;
    }
    $changed = false;
    foreach ($data["employees"] as $emp) {
        if (!is_array($emp) || (isset($emp["active"]) && !$emp["active"])) continue;
        $eid = (string) $emp["id"];
        if ($employeeId !== "" && $eid !== $employeeId) continue;
        $section = normalize_staff_section($emp["section"]);
        foreach ($data["templates"] as $tpl) {
            if (!is_array($tpl) || (isset($tpl["active"]) && !$tpl["active"])) continue;
            if (normalize_staff_section($tpl["section"]) !== $section) continue;
            $tid = (string) $tpl["id"];
            $key = $eid . "|" . $tid . "|" . $date;
            if (isset($existing[$key])) continue;
            $items = array();
            foreach ($tpl["items"] as $it) {
                if (!is_array($it)) continue;
                $items[] = array(
                    "id" => (string) $it["id"],
                    "label" => (string) $it["label"],
                    "done" => false,
                );
            }
            $data["runs"][] = array(
                "id" => new_staff_id("run"),
                "date" => $date,
                "employeeId" => $eid,
                "templateId" => $tid,
                "section" => $section,
                "items" => $items,
                "status" => "open",
            );
            $existing[$key] = true;
            $changed = true;
        }
    }
    if ($changed) {
        write_staff_ops($staffOpsFile, $data);
        return read_staff_ops($staffOpsFile);
    }
    return $data;
}

function session_is_manager($session) {
    if (!$session || !is_array($session)) return false;
    $role = isset($session["role"]) ? (string) $session["role"] : "";
    return $role === "manager" || $role === "cashier" || $role === "dev";
}

function session_is_pos($session) {
    if (session_is_manager($session)) return true;
    if (!$session || !is_array($session)) return false;
    if (!(isset($session["role"]) && (string) $session["role"] === "employee")) return false;
    $access = isset($session["sectionAccess"]) ? trim((string) $session["sectionAccess"]) : "";
    if ($access === "pos" || $access === "tasks") return $access === "pos";
    return sanitize_section_id(isset($session["section"]) ? $session["section"] : "") === "cashier";
}

function session_employee_id($session) {
    if (!$session || !is_array($session)) return "";
    return trim((string) (isset($session["employeeId"]) ? $session["employeeId"] : ""));
}
