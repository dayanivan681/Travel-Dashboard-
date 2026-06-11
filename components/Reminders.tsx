"use client";

import Link from "next/link";
import { Reminder } from "@/lib/types";

const SEV_STYLE: Record<Reminder["severity"], string> = {
  urgent: "border-red-200 bg-red-50 text-red-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const SEV_ICON: Record<Reminder["severity"], string> = {
  urgent: "⏰",
  warn: "⚠️",
  info: "💡",
};

export function ReminderList({
  reminders,
  showTrip,
  limit,
}: {
  reminders: Reminder[];
  showTrip?: boolean;
  limit?: number;
}) {
  const list = limit ? reminders.slice(0, limit) : reminders;
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      {list.map((r) => (
        <Link
          key={r.id}
          href={`/trip?id=${r.tripId}${r.tab ? `&tab=${r.tab}` : ""}`}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-opacity hover:opacity-80 ${SEV_STYLE[r.severity]}`}
        >
          <span>{SEV_ICON[r.severity]}</span>
          <span>
            {showTrip && <span className="font-medium">{r.tripName}: </span>}
            {r.text}
          </span>
        </Link>
      ))}
      {limit && reminders.length > limit && (
        <div className="text-xs text-ink-400">
          +{reminders.length - limit} more
        </div>
      )}
    </div>
  );
}
