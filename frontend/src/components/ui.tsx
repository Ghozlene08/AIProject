"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/* ---------- Boutons ---------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50",
  ghost: "text-muted hover:bg-brand-50 hover:text-brand-700",
  danger: "bg-danger-500 text-white hover:bg-danger-600",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-[15px]",
        size === "lg" && "h-14 px-6 text-lg",
        BTN[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Cartes ---------- */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cx("rounded-2xl border border-line bg-white shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, subtitle }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-brand-600">{icon}</span>}
        <div>
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-900 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badges ---------- */

type Tone = "brand" | "ok" | "warn" | "danger" | "muted" | "violet";
const TONE: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700",
  ok: "bg-ok-50 text-ok-600",
  warn: "bg-warn-50 text-warn-600",
  danger: "bg-danger-50 text-danger-600",
  muted: "bg-slate-100 text-slate-600",
  violet: "bg-violet-50 text-violet-500",
};

export function Badge({ tone = "brand", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function IconBubble({ tone = "brand", children, size = "md" }: { tone?: Tone; children: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "sm" && "h-8 w-8",
        size === "md" && "h-10 w-10",
        size === "lg" && "h-12 w-12 rounded-2xl",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Formulaires ---------- */

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "pr-8", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "h-auto min-h-24 py-2.5", props.className)} />;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-slate-300",
      )}
    >
      <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-600">
      {children}
    </div>
  );
}

/* ---------- États ---------- */

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <IconBubble size="lg">{icon}</IconBubble>
      <p className="mt-4 font-bold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = "md", tone = "brand" }: { name: string; size?: "sm" | "md" | "lg" | "xl"; tone?: "brand" | "violet" | "ok" }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        tone === "brand" && "bg-gradient-to-br from-brand-100 to-brand-200 text-brand-800",
        tone === "violet" && "bg-violet-50 text-violet-500",
        tone === "ok" && "bg-ok-50 text-ok-600",
        size === "sm" && "h-8 w-8 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg",
        size === "xl" && "h-20 w-20 text-2xl",
      )}
    >
      {letters}
    </span>
  );
}

/* ---------- Fenêtre modale ---------- */

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border-0 bg-white p-0 text-ink shadow-pop backdrop:bg-brand-900/40 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="text-lg font-extrabold text-brand-900">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-brand-50" aria-label="Fermer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Onglets ---------- */

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-brand-50 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            "rounded-lg px-4 py-1.5 text-sm font-bold transition-colors",
            value === it.value ? "bg-white text-brand-700 shadow-sm" : "text-muted hover:text-brand-700",
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="ml-1.5 text-xs opacity-70">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
