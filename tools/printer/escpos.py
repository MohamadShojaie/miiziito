"""ESC/POS command generator. Independent of connection type."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional

from .persian import (
    display_width,
    fit_cell,
    has_persian,
    pad_columns,
    prepare_rtl_line,
    to_persian_digits,
)

ESC = 0x1B
GS = 0x1D
LF = 0x0A

CODE_PAGES = {
    "pc437": 0,
    "pc850": 2,
    "pc860": 3,
    "wpc1252": 16,
    "pc864": 37,
    "wpc1256": 50,
    "utf8": None,
}

CODE_PAGE_ENCODINGS = {
    "pc437": "cp437",
    "pc850": "cp850",
    "pc860": "cp860",
    "wpc1252": "cp1252",
    "pc864": "cp864",
    "wpc1256": "cp1256",
    "utf8": "utf-8",
}


def paper_cols(width: str | int | None) -> int:
    w = str(width or "80")
    return 32 if w == "58" else 48


def _clamp_size(width: int, height: int) -> int:
    width = max(1, min(8, int(width)))
    height = max(1, min(8, int(height)))
    return ((width - 1) << 4) | (height - 1)


def choose_code_page(preferred: str, sample_text: str = "") -> str:
    pref = str(preferred or "utf8").strip() or "utf8"
    if pref in CODE_PAGES and pref != "auto":
        return pref
    # UTF-8 keeps reshaped Persian presentation forms intact
    if has_persian(sample_text):
        return "utf8"
    return "utf8"


class EscPosBuilder:
    def __init__(
        self,
        paper_width: str = "80",
        code_page: str = "utf8",
        rtl: bool = True,
        persian_digits: bool = True,
    ):
        self.paper_width = "58" if str(paper_width) == "58" else "80"
        self.code_page = code_page if code_page in CODE_PAGES else "utf8"
        self.rtl = bool(rtl)
        self.persian_digits = bool(persian_digits)
        self._buf = bytearray()
        self.init()

    def _reshape(self) -> bool:
        # Presentation forms are not in CP1256/PC864 — only reshape for UTF-8
        return self.code_page not in ("wpc1256", "pc864")

    def _prep(self, text: str) -> str:
        s = str(text or "")
        if self.rtl and has_persian(s):
            return prepare_rtl_line(
                s,
                persian_digits=self.persian_digits and self._reshape(),
                reshape=self._reshape(),
            )
        if self.persian_digits and self._reshape() and any(ch.isdigit() for ch in s):
            return to_persian_digits(s)
        return s

    def _enc(self, text: str) -> bytes:
        enc = CODE_PAGE_ENCODINGS.get(self.code_page, "utf-8")
        try:
            return str(text or "").encode(enc)
        except LookupError:
            return str(text or "").encode("utf-8", errors="replace")
        except UnicodeEncodeError:
            return str(text or "").encode(enc, errors="replace")

    def raw(self, data: bytes | Iterable[int]) -> "EscPosBuilder":
        self._buf.extend(bytes(data))
        return self

    def init(self) -> "EscPosBuilder":
        self._buf.extend((ESC, 0x40))
        page = CODE_PAGES.get(self.code_page)
        if page is not None:
            self._buf.extend((ESC, 0x74, int(page) & 0xFF))
        # Slightly tighter line spacing for a cleaner ticket look
        self._buf.extend((ESC, 0x33, 28))
        return self

    def text(self, value: str, raw_text: bool = False) -> "EscPosBuilder":
        payload = str(value or "") if raw_text else self._prep(value)
        self._buf.extend(self._enc(payload))
        return self

    def bold(self, on: bool = True) -> "EscPosBuilder":
        return self.raw((ESC, 0x45, 1 if on else 0))

    def underline(self, mode: int = 1) -> "EscPosBuilder":
        return self.raw((ESC, 0x2D, max(0, min(2, int(mode)))))

    def align(self, side: str = "left") -> "EscPosBuilder":
        n = {"left": 0, "center": 1, "right": 2}.get(side, 0)
        return self.raw((ESC, 0x61, n))

    def font_size(self, width: int = 1, height: int = 1) -> "EscPosBuilder":
        return self.raw((GS, 0x21, _clamp_size(width, height)))

    def line_spacing(self, n: int = 30) -> "EscPosBuilder":
        return self.raw((ESC, 0x33, max(0, min(255, int(n)))))

    def newline(self, count: int = 1) -> "EscPosBuilder":
        self._buf.extend(bytes([LF]) * max(1, int(count)))
        return self

    def feed(self, lines: int = 3) -> "EscPosBuilder":
        return self.raw((ESC, 0x64, max(0, min(255, int(lines)))))

    def cut(self, partial: bool = True) -> "EscPosBuilder":
        return self.raw((GS, 0x56, 1 if partial else 0))

    def invert(self, on: bool = True) -> "EscPosBuilder":
        return self.raw((GS, 0x42, 1 if on else 0))

    def inverted_line(self, value: str, raw_text: bool = True) -> "EscPosBuilder":
        cols = paper_cols(self.paper_width)
        payload = str(value or "") if raw_text else self._prep(value)
        row = fit_cell(payload, cols, "left")
        self.align("left").invert(True)
        self.text(row, raw_text=True).newline()
        self.invert(False)
        return self

    def rule(self, char: str = "-") -> "EscPosBuilder":
        ch = (char or "-")[:1]
        cols = paper_cols(self.paper_width)
        return self.align("left").text(ch * cols, raw_text=True).newline()

    def separator(self, char: str = "-") -> "EscPosBuilder":
        return self.rule(char)

    def line(self, value: str = "") -> "EscPosBuilder":
        return self.text(value).newline()

    def columns(self, left: str, right: str, gap: int = 1) -> "EscPosBuilder":
        cols = paper_cols(self.paper_width)
        left_s = self._prep(left)
        right_s = self._prep(right)
        row = pad_columns(left_s, right_s, cols, gap=gap)
        return self.align("left").text(row, raw_text=True).newline()

    def item_row(
        self,
        name: str,
        qty: float | int = 1,
        unit_price: float = 0,
        amount: Optional[float] = None,
        discount: float = 0,
        show_price: bool = True,
    ) -> "EscPosBuilder":
        qty_n = float(qty or 0)
        qty_label = str(int(qty_n) if qty_n == int(qty_n) else qty_n)
        if not show_price:
            # Kitchen/bar: qty badge + item name only
            self.columns(f"×{qty_label}", str(name or "Item"))
            return self
        unit_n = float(unit_price or 0)
        total = float(amount) if amount is not None else qty_n * unit_n
        if discount:
            total = max(0.0, total - float(discount))
        label = f"{name} ×{qty_label}"
        self.columns(label, f"{total:,.0f}")
        if discount:
            self.columns("تخفیف", f"-{float(discount):,.0f}")
        return self

    def totals(
        self,
        subtotal: Optional[float] = None,
        tax: Optional[float] = None,
        discount: Optional[float] = None,
        total: Optional[float] = None,
        payment: Optional[str] = None,
    ) -> "EscPosBuilder":
        if subtotal is not None:
            self.columns("جمع جزء", f"{float(subtotal):,.0f}")
        if discount:
            self.columns("تخفیف", f"-{float(discount):,.0f}")
        if tax:
            self.columns("مالیات", f"{float(tax):,.0f}")
        if total is not None:
            self.bold(True).columns("جمع", f"{float(total):,.0f}").bold(False)
        if payment:
            self.columns("پرداخت", str(payment))
        return self

    def to_bytes(self) -> bytes:
        return bytes(self._buf)


def generate_receipt(data: Optional[dict] = None) -> bytes:
    data = data if isinstance(data, dict) else {}
    mode = str(data.get("mode") or data.get("ticketType") or "receipt").lower()
    if mode in ("station", "kitchen", "bar", "ticket"):
        return generate_station_ticket(data)
    return generate_invoice(data)


def _money(value) -> str:
    try:
        n = int(round(float(value or 0)))
    except (TypeError, ValueError):
        n = 0
    return f"{n:,}"


def _invoice_layout(paper: str) -> tuple[int, int, int, int, int]:
    cols = paper_cols(paper)
    if cols <= 32:
        # total qty unit name
        return cols, 9, 3, 8, 12
    return cols, 12, 4, 10, 22


def _gregorian_to_jalali_str(dt: datetime) -> str:
    gy, gm, gd = dt.year, dt.month, dt.day
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    jy = 0 if gy <= 1600 else 979
    gy2 = gy - (621 if gy <= 1600 else 1600)
    gy3 = gy2 + 1 if gm > 2 else gy2
    days = (
        365 * gy2
        + (gy3 + 3) // 4
        - (gy3 + 99) // 100
        + (gy3 + 399) // 400
        - 80
        + gd
        + g_d_m[gm - 1]
    )
    jy += 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    jy += (days - 1) // 365
    if days > 365:
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return f"{jy:04d}/{jm:02d}/{jd:02d}"


def generate_invoice(data: Optional[dict] = None) -> bytes:
    """Customer invoice in GILARDINO-style RTL thermal layout."""
    data = data if isinstance(data, dict) else {}
    paper = str(data.get("paperWidth") or "80")
    store_en = str(data.get("storeName") or data.get("storeNameEn") or "Cafe")
    store_fa = str(data.get("storeNameFa") or "").strip()
    sample = " ".join(
        [
            store_en,
            store_fa,
            str(data.get("customer") or ""),
            "شماره فاکتور قابل پرداخت مشتری",
        ]
    )
    code_page = choose_code_page(str(data.get("codePage") or "utf8"), sample)
    reshape = code_page not in ("wpc1256", "pc864")
    b = EscPosBuilder(
        paper_width=paper,
        code_page=code_page,
        rtl=True,
        persian_digits=False,  # keep ASCII digits like the reference receipt
    )
    cols, w_total, w_qty, w_unit, w_name = _invoice_layout(paper)
    side = 14 if cols >= 48 else 10
    mid = max(4, cols - side * 2)

    def cell(text: str, width: int, align: str = "left", rtl: bool = True) -> str:
        raw = str(text or "")
        if rtl and has_persian(raw):
            raw = prepare_rtl_line(raw, persian_digits=False, reshape=reshape)
        return fit_cell(raw, width, align)

    now = datetime.now()
    time_s = str(data.get("time") or "").strip()
    date_s = str(data.get("dateJalali") or data.get("date") or "").strip()
    when = str(data.get("datetime") or "").strip()
    if not time_s or not date_s:
        parsed = None
        if when:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
                try:
                    parsed = datetime.strptime(when[:19], fmt)
                    break
                except ValueError:
                    continue
        stamp = parsed or now
        if not time_s:
            time_s = stamp.strftime("%H:%M:%S")
        if not date_s:
            date_s = _gregorian_to_jalali_str(stamp)

    inv_no = str(data.get("receiptNumber") or "").strip() or "—"

    # Side boxes: time/date (left) + invoice number (right)
    b.align("left")
    b.invert(True).text(cell(time_s, side, "left", rtl=False), raw_text=True)
    b.invert(False).text(fit_cell("", mid, "center"), raw_text=True)
    b.invert(True).text(cell("شماره فاکتور", side, "right"), raw_text=True).newline()
    b.invert(False)

    b.invert(True).text(cell(date_s, side, "left", rtl=False), raw_text=True)
    b.invert(False).text(fit_cell("", mid, "center"), raw_text=True)
    b.invert(True).text(cell(inv_no, side, "right", rtl=False), raw_text=True).newline()
    b.invert(False)

    b.align("center").font_size(2, 2).bold(True)
    b.text(store_en, raw_text=True).newline()
    b.bold(False).font_size(1, 1)
    if store_fa and store_fa.lower() != store_en.lower():
        b.line(store_fa)
    b.rule("=")

    customer = str(data.get("customer") or "").strip()
    location = str(data.get("location") or "").strip()
    table = data.get("table")
    if not location and table is not None and str(table) != "":
        location = f"میز {table}"

    loc_line = f"مکان: {location}" if location else ""
    cust_line = f"مشتری: {customer}" if customer else "مشتری: —"
    half = cols // 2
    b.align("left")
    b.text(
        cell(loc_line, half, "left") + cell(cust_line, cols - half, "right"),
        raw_text=True,
    ).newline()
    b.rule("-")

    header = (
        cell("قیمت کل", w_total, "left")
        + cell("تعداد", w_qty, "center")
        + cell("فی", w_unit, "center")
        + cell("نام", w_name, "right")
    )
    b.inverted_line(header)

    items = data.get("items") if isinstance(data.get("items"), list) else []
    if not items:
        b.align("center").line("بدون آیتم")
    for row in items:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "آیتم").strip()
        qty_n = float(row.get("qty") or row.get("count") or 1)
        qty_label = str(int(qty_n) if qty_n == int(qty_n) else qty_n)
        unit = float(row.get("unitPrice") or row.get("price") or 0)
        amount = row.get("amount")
        if amount is None:
            amount = row.get("line")
        amount_n = float(amount) if amount is not None else qty_n * unit

        prepped_name = prepare_rtl_line(name, persian_digits=False, reshape=reshape)
        if display_width(prepped_name) > w_name:
            b.align("left").text(cell(name, cols, "right"), raw_text=True).newline()
            name_cell = " " * w_name
        else:
            name_cell = cell(name, w_name, "right")
        line = (
            cell(_money(amount_n), w_total, "left", rtl=False)
            + cell(qty_label, w_qty, "center", rtl=False)
            + cell(_money(unit), w_unit, "right", rtl=False)
            + name_cell
        )
        b.align("left").text(line, raw_text=True).newline()

        toppings = row.get("toppings") if isinstance(row.get("toppings"), list) else []
        for top in toppings:
            label = top.get("name") if isinstance(top, dict) else top
            if label:
                b.align("left").text(
                    cell(f"+ {label}", cols, "right"), raw_text=True
                ).newline()

    b.rule("-")

    def sum_row(label: str, value, invert: bool = False) -> None:
        row = cell(_money(value), 16, "left", rtl=False) + cell(
            label, cols - 16, "right"
        )
        if invert:
            b.inverted_line(row)
        else:
            b.align("left").text(row, raw_text=True).newline()

    if data.get("subtotal") is not None:
        sum_row("جمع کل", data.get("subtotal"))
    if data.get("discount"):
        sum_row("تخفیف", data.get("discount"))
    if data.get("tax"):
        sum_row("مالیات بر ارزش افزوده", data.get("tax"))

    total = data.get("total")
    if total is None:
        total = data.get("subtotal")
    currency = str(data.get("currency") or "تومان")
    b.newline()
    pay = cell(f"{_money(total)} {currency}", 22, "left", rtl=False) + cell(
        "قابل پرداخت", cols - 22, "right"
    )
    b.font_size(1, 2)
    b.inverted_line(pay)
    b.font_size(1, 1)

    payment = str(data.get("payment") or "").strip()
    if payment:
        b.align("left").text(
            cell(payment, cols // 2, "left", rtl=False)
            + cell("پرداخت", cols - cols // 2, "right"),
            raw_text=True,
        ).newline()

    b.rule("-")
    b.align("center")
    footer = str(data.get("footer") or "به امید دیدار مجدد").strip()
    b.line(footer)
    if store_fa:
        b.line(store_fa)
    phone = str(data.get("phone") or "").strip()
    if phone:
        b.line(f"تلفن: {phone}")
    address = str(data.get("address") or "").strip()
    if address:
        b.line(address)
    b.feed(int(data.get("feed") or 4))
    if data.get("cut", True):
        b.cut(partial=True)
    return b.to_bytes()


def generate_station_ticket(data: Optional[dict] = None) -> bytes:
    """Kitchen / bar ticket: ordered items only, no prices, Persian-friendly."""
    data = data if isinstance(data, dict) else {}
    paper = str(data.get("paperWidth") or "80")
    station = str(data.get("station") or data.get("subtitle") or "").lower()
    if "bar" in station or "بار" in str(data.get("subtitle") or ""):
        station_fa = "بار"
        station_en = "BAR"
    else:
        station_fa = "آشپزخانه"
        station_en = "KITCHEN"

    sample = f"{station_fa} {data.get('storeName') or ''}"
    code_page = choose_code_page(str(data.get("codePage") or "utf8"), sample)
    b = EscPosBuilder(paper_width=paper, code_page=code_page, rtl=True)

    # Header band
    b.align("center")
    b.separator("=")
    b.font_size(2, 2).bold(True)
    b.line(station_fa)
    b.bold(False).font_size(1, 1)
    b.line(station_en)
    b.separator("=")

    # Table emphasis
    table = data.get("table")
    if table is not None and str(table) != "":
        b.font_size(2, 2).bold(True)
        b.line(f"میز {table}")
        b.bold(False).font_size(1, 1)

    when = data.get("datetime") or datetime.now().strftime("%H:%M")
    # Prefer short time for kitchen tickets
    if " " in str(when) and ":" in str(when):
        when_short = str(when).split(" ")[-1][:5]
    else:
        when_short = str(when)
    b.line(f"ساعت {when_short}")
    b.separator("-")

    items = data.get("items") if isinstance(data.get("items"), list) else []
    if not items:
        b.align("center").line("بدون آیتم")
    else:
        for idx, row in enumerate(items):
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "آیتم").strip()
            qty_n = float(row.get("qty") or row.get("count") or 1)
            qty_label = str(int(qty_n) if qty_n == int(qty_n) else qty_n)

            # Modern kitchen line: big qty + name
            b.align("left")
            b.font_size(2, 2).bold(True)
            b.columns(f"×{qty_label}", name)
            b.bold(False).font_size(1, 1)

            toppings = row.get("toppings") if isinstance(row.get("toppings"), list) else []
            for top in toppings:
                label = top.get("name") if isinstance(top, dict) else top
                if label:
                    b.line(f"   + {label}")

            notes = row.get("notes") or row.get("note")
            if notes:
                b.line(f"   ! {notes}")

            if idx < len(items) - 1:
                b.newline()

    b.separator("=")
    b.align("center")
    footer = str(data.get("footer") or "سفارش جدید")
    b.line(footer)
    store = str(data.get("storeName") or "").strip()
    if store:
        b.line(store)
    b.feed(int(data.get("feed") or 4))
    if data.get("cut", True):
        b.cut(partial=True)
    return b.to_bytes()


def generate_test_receipt(
    connection_type: str = "network",
    paper_width: str = "80",
    code_page: str = "utf8",
    when: Optional[str] = None,
) -> bytes:
    stamp = when or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    kind = str(connection_type or "network").upper()
    sample = "تست پرینتر"
    page = choose_code_page(code_page or "wpc1256", sample)
    b = EscPosBuilder(paper_width=paper_width, code_page=page, rtl=True)
    b.align("center").separator("=")
    b.font_size(2, 2).line("تست پرینتر").font_size(1, 1)
    b.separator("=")
    b.line("اتصال موفق")
    b.line(f"نوع: {kind}")
    b.line(f"زمان: {stamp}")
    b.separator("=")
    b.feed(3).cut(True)
    return b.to_bytes()
