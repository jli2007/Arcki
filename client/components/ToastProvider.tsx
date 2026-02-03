"use client";

import { createContext, useContext, useCallback, useState, ReactNode } from "react";
import { Cross2Icon, CheckCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";

type ToastVariant = "success" | "error" | "info";

interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface Toast extends ToastOptions {
  id: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  notify: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ title, description, variant = "info" }: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => removeToast(id), 3600);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-full max-w-xs flex-col gap-3">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { title, description, variant } = toast;

  const variantStyles =
    variant === "success"
      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-50"
      : variant === "error"
        ? "border-rose-400/50 bg-rose-500/20 text-rose-50"
        : "border-white/20 bg-black/70 text-white";

  const Icon = variant === "success" ? CheckCircledIcon : variant === "error" ? ExclamationTriangleIcon : null;

  return (
    <div className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${variantStyles}`}>
      {Icon ? <Icon width={20} height={20} /> : null}
      <div className="flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {description ? <p className="mt-1 text-xs text-white/80">{description}</p> : null}
      </div>
      <button
        onClick={onDismiss}
        className="mt-1 rounded-full p-1 text-white/60 transition-colors hover:text-white"
        aria-label="Dismiss notification"
      >
        <Cross2Icon width={14} height={14} />
      </button>
    </div>
  );
}
