"use client";

import React, { useEffect } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`card anim-modal w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  hint,
  children,
}: {
  emoji: string;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-4xl">{emoji}</div>
      <div className="font-medium text-ink-800">{title}</div>
      {hint && <div className="max-w-sm text-sm text-ink-500">{hint}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  danger,
}: {
  value: number;
  max: number;
  danger?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div
        className={`h-full rounded-full transition-all ${
          danger ? "bg-red-500" : "bg-ink-700"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: "gray" | "green" | "blue" | "amber" | "red" | "purple";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    gray: "bg-ink-100 text-ink-600",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-sky-100 text-sky-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    purple: "bg-violet-100 text-violet-700",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export const BOOKING_TYPE_EMOJI: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  car: "🚗",
  train: "🚆",
  activity: "🎟️",
  restaurant: "🍽️",
  other: "📌",
  note: "📝",
};
