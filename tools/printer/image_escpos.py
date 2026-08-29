"""ESC/POS raster image encoding (GS v 0) with horizontal chunking.

Matches the frontend `escpos-image.ts` pipeline used for receipt bitmaps.
Industry practice (python-escpos, ESC-POS.NET): tall images are split into
strips of limited height; each strip is a separate GS v 0 command that the
printer concatenates into one continuous print.
"""

from __future__ import annotations

from typing import Iterable, List, Optional, Sequence, Tuple

ESC = 0x1B
GS = 0x1D

RECEIPT_IMAGE_WIDTH = 576
RECEIPT_IMAGE_HEIGHT = 0  # natural height; kept for API compatibility
DEFAULT_CHUNK_HEIGHT = 100


def _align_width(width: int) -> int:
    return max(8, ((max(1, int(width)) + 7) // 8) * 8)


def rgba_to_mono_rows(
    pixels: Sequence[Tuple[int, int, int, int]],
    width: int,
    height: int,
    threshold: int = 180,
) -> List[bytearray]:
    """Pack luminance < threshold as black bits (MSB left)."""
    row_bytes = (width + 7) // 8
    rows: List[bytearray] = []
    for y in range(height):
        row = bytearray(row_bytes)
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            if a < 16:
                lum = 255
            else:
                lum = int(0.299 * r + 0.587 * g + 0.114 * b + 0.5)
            if lum < threshold:
                row[x >> 3] |= 0x80 >> (x & 7)
        rows.append(row)
    return rows


def pad_rows_width(rows: List[bytearray], width: int) -> Tuple[List[bytearray], int]:
    aligned = _align_width(width)
    if aligned == width:
        return rows, width
    row_bytes = aligned // 8
    padded = []
    for src in rows:
        row = bytearray(row_bytes)
        row[: min(len(src), row_bytes)] = src[: min(len(src), row_bytes)]
        padded.append(row)
    return padded, aligned


def split_rows(rows: List[bytearray], chunk_height: int = DEFAULT_CHUNK_HEIGHT) -> List[List[bytearray]]:
    h = max(1, int(chunk_height))
    if not rows:
        return [[]]
    return [rows[y : y + h] for y in range(0, len(rows), h)]


def gs_v0(rows: List[bytearray], width: int) -> bytes:
    """GS v 0 raster bit image for one strip."""
    width_bytes = (width + 7) // 8
    height = len(rows)
    header = bytes(
        (
            GS,
            0x76,
            0x30,
            0x00,
            width_bytes & 0xFF,
            (width_bytes >> 8) & 0xFF,
            height & 0xFF,
            (height >> 8) & 0xFF,
        )
    )
    data = bytearray(width_bytes * height)
    for y, row in enumerate(rows):
        start = y * width_bytes
        data[start : start + width_bytes] = row[:width_bytes]
    return header + bytes(data)


def image_rows_to_escpos(
    rows: List[bytearray],
    width: int,
    *,
    chunk_height: int = DEFAULT_CHUNK_HEIGHT,
    feed: int = 4,
    cut: bool = True,
) -> bytes:
    rows, width = pad_rows_width(rows, width)
    out = bytearray()
    out.extend((ESC, 0x40))  # init
    out.extend((ESC, 0x61, 1))  # center
    for chunk in split_rows(rows, chunk_height):
        if not chunk:
            continue
        out.extend(gs_v0(chunk, width))
    out.extend((ESC, 0x64, max(0, min(255, int(feed)))))
    if cut:
        out.extend((GS, 0x56, 1))
    return bytes(out)


def pil_image_to_escpos(img, *, chunk_height: int = DEFAULT_CHUNK_HEIGHT, threshold: int = 180) -> bytes:
    """Convert a PIL Image to chunked ESC/POS raster bytes."""
    from PIL import Image

    if not isinstance(img, Image.Image):
        raise TypeError("PIL Image required")
    rgba = img.convert("RGBA")
    width, height = rgba.size
    pixels = list(rgba.getdata())
    rows = rgba_to_mono_rows(pixels, width, height, threshold=threshold)
    return image_rows_to_escpos(rows, width, chunk_height=chunk_height)
