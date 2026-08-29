"""Persian / Arabic helpers for ESC/POS thermal printers.

Most cheap thermal printers print LTR and do not reshape Arabic letters.
We reshape presentation forms, apply a simple RTL reverse, then encode
(prefer Windows-1256 when requested).
"""

from __future__ import annotations

import re
import unicodedata

# Isolated, Final, Initial, Medial — common Arabic/Persian letters
_FORMS = {
    "\u0627": ("\ufe8d", "\ufe8e", "\ufe8d", "\ufe8e"),  # ا
    "\u0622": ("\ufe81", "\ufe82", "\ufe81", "\ufe82"),  # آ
    "\u0623": ("\ufe83", "\ufe84", "\ufe83", "\ufe84"),  # أ
    "\u0625": ("\ufe87", "\ufe88", "\ufe87", "\ufe88"),  # إ
    "\u0621": ("\ufe80", "\ufe80", "\ufe80", "\ufe80"),  # ء
    "\u0628": ("\ufe8f", "\ufe90", "\ufe91", "\ufe92"),  # ب
    "\u067e": ("\ufb56", "\ufb57", "\ufb58", "\ufb59"),  # پ
    "\u062a": ("\ufe95", "\ufe96", "\ufe97", "\ufe98"),  # ت
    "\u062b": ("\ufe99", "\ufe9a", "\ufe9b", "\ufe9c"),  # ث
    "\u062c": ("\ufe9d", "\ufe9e", "\ufe9f", "\ufea0"),  # ج
    "\u0686": ("\ufb7a", "\ufb7b", "\ufb7c", "\ufb7d"),  # چ
    "\u062d": ("\ufea1", "\ufea2", "\ufea3", "\ufea4"),  # ح
    "\u062e": ("\ufea5", "\ufea6", "\ufea7", "\ufea8"),  # خ
    "\u062f": ("\ufea9", "\ufeaa", "\ufea9", "\ufeaa"),  # د
    "\u0630": ("\ufeab", "\ufeac", "\ufeab", "\ufeac"),  # ذ
    "\u0631": ("\ufead", "\ufeae", "\ufead", "\ufeae"),  # ر
    "\u0632": ("\ufeaf", "\ufeb0", "\ufeaf", "\ufeb0"),  # ز
    "\u0698": ("\ufb8a", "\ufb8b", "\ufb8a", "\ufb8b"),  # ژ
    "\u0633": ("\ufeb1", "\ufeb2", "\ufeb3", "\ufeb4"),  # س
    "\u0634": ("\ufeb5", "\ufeb6", "\ufeb7", "\ufeb8"),  # ش
    "\u0635": ("\ufeb9", "\ufeba", "\ufebb", "\ufebc"),  # ص
    "\u0636": ("\ufebd", "\ufebe", "\ufebf", "\ufec0"),  # ض
    "\u0637": ("\ufec1", "\ufec2", "\ufec3", "\ufec4"),  # ط
    "\u0638": ("\ufec5", "\ufec6", "\ufec7", "\ufec8"),  # ظ
    "\u0639": ("\ufec9", "\ufeca", "\ufecb", "\ufecc"),  # ع
    "\u063a": ("\ufecd", "\ufece", "\ufecf", "\ufed0"),  # غ
    "\u0641": ("\ufed1", "\ufed2", "\ufed3", "\ufed4"),  # ف
    "\u0642": ("\ufed5", "\ufed6", "\ufed7", "\ufed8"),  # ق
    "\u06a9": ("\ufb8e", "\ufb8f", "\ufb90", "\ufb91"),  # ک
    "\u0643": ("\ufed9", "\ufeda", "\ufedb", "\ufedc"),  # ك
    "\u06af": ("\ufb92", "\ufb93", "\ufb94", "\ufb95"),  # گ
    "\u0644": ("\ufedd", "\ufede", "\ufedf", "\ufee0"),  # ل
    "\u0645": ("\ufee1", "\ufee2", "\ufee3", "\ufee4"),  # م
    "\u0646": ("\ufee5", "\ufee6", "\ufee7", "\ufee8"),  # ن
    "\u0648": ("\ufee9", "\ufeea", "\ufee9", "\ufeea"),  # و
    "\u0647": ("\ufeeb", "\ufeec", "\ufeed", "\ufeee"),  # ه
    "\u06cc": ("\ufbfc", "\ufbfd", "\ufbfe", "\ufbff"),  # ی
    "\u064a": ("\ufef1", "\ufef2", "\ufef3", "\ufef4"),  # ي
    "\u0629": ("\ufe93", "\ufe94", "\ufe93", "\ufe94"),  # ة
    "\u0649": ("\ufeef", "\ufef0", "\ufeef", "\ufef0"),  # ى
}

_DUAL_CONNECTING = set(_FORMS.keys()) - {
    "\u0627",
    "\u0622",
    "\u0623",
    "\u0625",
    "\u0621",
    "\u062f",
    "\u0630",
    "\u0631",
    "\u0632",
    "\u0698",
    "\u0648",
    "\u0629",
    "\u0649",
}

_ARABIC_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+")
_LATIN_RE = re.compile(r"[A-Za-z0-9]+")


def has_persian(text: str) -> bool:
    return bool(_ARABIC_RE.search(str(text or "")))


def to_persian_digits(text: str) -> str:
    table = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
    return str(text or "").translate(table)


def _connects_to_next(ch: str) -> bool:
    return ch in _DUAL_CONNECTING


def _connects_to_prev(ch: str) -> bool:
    return ch in _FORMS


def reshape_arabic(text: str) -> str:
    """Convert Arabic/Persian letters to presentation forms (connected glyphs)."""
    chars = list(str(text or ""))
    out: list[str] = []
    n = len(chars)
    for i, ch in enumerate(chars):
        forms = _FORMS.get(ch)
        if not forms:
            out.append(ch)
            continue
        prev = chars[i - 1] if i > 0 else ""
        nxt = chars[i + 1] if i + 1 < n else ""
        join_prev = _connects_to_next(prev) and _connects_to_prev(ch)
        join_next = _connects_to_next(ch) and _connects_to_prev(nxt)
        if join_prev and join_next:
            out.append(forms[3])  # medial
        elif join_prev:
            out.append(forms[1])  # final
        elif join_next:
            out.append(forms[2])  # initial
        else:
            out.append(forms[0])  # isolated
    return "".join(out)


def _reverse_preserving_latin_runs(text: str) -> str:
    """Reverse RTL visual order but keep Latin/digit runs readable LTR."""
    parts: list[str] = []
    i = 0
    s = str(text or "")
    while i < len(s):
        m = _LATIN_RE.match(s, i)
        if m:
            parts.append(m.group(0))
            i = m.end()
            continue
        parts.append(s[i])
        i += 1
    # Reverse token list for RTL printer stream
    return "".join(reversed(parts))


def prepare_rtl_line(text: str, persian_digits: bool = True, reshape: bool = True) -> str:
    """Prepare one print line for thermal printers (reshape + RTL)."""
    s = str(text or "")
    if persian_digits:
        s = to_persian_digits(s)
    if not has_persian(s):
        return s
    s = unicodedata.normalize("NFC", s)
    if reshape:

        def _reshape_run(m: re.Match) -> str:
            return reshape_arabic(m.group(0))

        s = _ARABIC_RE.sub(_reshape_run, s)
    return _reverse_preserving_latin_runs(s)


def display_width(text: str) -> int:
    """Approximate monospace width (presentation forms count as 1)."""
    w = 0
    for ch in str(text or ""):
        if unicodedata.east_asian_width(ch) in ("F", "W"):
            w += 2
        elif unicodedata.category(ch).startswith("M"):
            continue
        else:
            w += 1
    return w


def fit_cell(text: str, width: int, align: str = "left") -> str:
    """Pad or trim a cell to an exact display width."""
    s = str(text or "")
    width = max(0, int(width))
    while display_width(s) > width and s:
        s = s[:-1]
    pad = width - display_width(s)
    if pad <= 0:
        return s
    if align == "right":
        return (" " * pad) + s
    if align == "center":
        left = pad // 2
        return (" " * left) + s + (" " * (pad - left))
    return s + (" " * pad)


def pad_columns(left: str, right: str, cols: int, gap: int = 1) -> str:
    """Build a fixed-width row. left/right should already be prepared for print."""
    left_s = str(left or "")
    right_s = str(right or "")
    space = cols - display_width(left_s) - display_width(right_s)
    space = max(gap, space)
    row = left_s + (" " * space) + right_s
    while display_width(row) > cols and row:
        row = row[:-1]
    return row
