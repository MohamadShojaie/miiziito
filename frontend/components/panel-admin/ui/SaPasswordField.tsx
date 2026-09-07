"use client";

import { useState } from "react";

export function SaPasswordField({
  id,
  value,
  onChange,
  autoComplete,
  required,
  placeholder,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="sa-password-field">
      <input
        id={id}
        className="sa-input"
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="sa-password-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "مخفی کردن رمز" : "نمایش رمز"}
        title={show ? "مخفی کردن رمز" : "نمایش رمز"}
        tabIndex={-1}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.7 11.7 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S2.7 16.9 1 12.5z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </div>
  );
}
