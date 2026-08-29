"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "info";

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function detectTone(message: string, tone?: ToastTone): ToastTone {
  if (tone) return tone;
  if (/خطا|ناموفق|اجازه|لازم/.test(message)) return "error";
  return "success";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<ToastTone>("success");
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setExiting(true);
    exitTimer.current = setTimeout(() => {
      setVisible(false);
      setExiting(false);
      setMessage("");
    }, 280);
  }, []);

  const showToast = useCallback(
    (msg: string, nextTone?: ToastTone) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setExiting(false);
      setTone(detectTone(msg, nextTone));
      setMessage(msg);
      setVisible(true);
      hideTimer.current = setTimeout(() => dismiss(), 3200);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  const icon =
    tone === "error" ? "!" : tone === "info" ? "i" : "✓";

  return (
    <ToastContext.Provider value={value}>
      {children}
      {visible || exiting || message ? (
        <div
          className={[
            "app-toast",
            `app-toast--${tone}`,
            visible && !exiting ? "is-visible" : "",
            exiting ? "is-exiting" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
          aria-live="polite"
          onClick={dismiss}
        >
          <span className="app-toast-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="app-toast-text">{message}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}
