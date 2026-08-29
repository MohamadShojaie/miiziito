"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type Option = readonly [string, string];

export function CpSelect({
  label,
  value,
  options,
  disabled,
  className,
  onChange,
}: {
  label?: string;
  value: string;
  options: readonly Option[];
  disabled?: boolean;
  className?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const current =
    options.find(([v]) => v === value)?.[1] || options[0]?.[1] || "—";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = toggleRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, 140);
      const rtl = document.documentElement.dir === "rtl";
      let left = rtl ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const maxH = 240;
      const below = r.bottom + 6;
      const top =
        below + maxH > window.innerHeight - 8
          ? Math.max(8, r.top - maxH - 6)
          : below;
      setMenuStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 580,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`checkout-dd${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      {label ? <span className="checkout-field-label">{label}</span> : null}
      <button
        ref={toggleRef}
        type="button"
        className="checkout-dd-toggle"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="checkout-dd-menu is-ported"
              role="listbox"
              style={menuStyle}
            >
              {options.map(([v, text]) => (
                <button
                  key={v || "none"}
                  type="button"
                  role="option"
                  aria-selected={value === v}
                  className={value === v ? "is-active" : undefined}
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
