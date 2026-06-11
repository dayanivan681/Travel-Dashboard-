"use client";

import Link from "next/link";
import { PHASE_LABEL, tripPhase } from "@/lib/automation";
import { sumExpenses, useFxRates } from "@/lib/fx";
import { AppData, Trip, TripPhase } from "@/lib/types";
import { daysBetween, fmtDate, fmtMoney, todayStr } from "@/lib/utils";
import { Badge, ProgressBar } from "./ui";

const PHASE_TONE: Record<TripPhase, "gray" | "blue" | "green" | "amber" | "purple"> = {
  idea: "gray",
  planning: "blue",
  booked: "purple",
  active: "green",
  completed: "amber",
};

// Soft accent tint for the emoji tile, keyed by phase.
const PHASE_TILE: Record<TripPhase, string> = {
  idea: "bg-ink-100",
  planning: "bg-sky-50",
  booked: "bg-violet-50",
  active: "bg-emerald-50",
  completed: "bg-amber-50",
};

export function TripCard({ trip, data }: { trip: Trip; data: AppData }) {
  const phase = tripPhase(trip, data.bookings);
  const rates = useFxRates();
  const bookings = data.bookings.filter(
    (b) => b.tripId === trip.id && b.status !== "cancelled"
  );
  const committed = bookings.reduce((s, b) => s + (b.cost || 0), 0);
  const spent = sumExpenses(
    data.expenses.filter((e) => e.tripId === trip.id),
    trip.currency,
    rates
  );
  const total = committed + spent;

  const today = todayStr();
  let timing = "";
  if (phase === "active" && trip.startDate && trip.endDate) {
    timing = `Day ${daysBetween(trip.startDate, today) + 1} of ${
      daysBetween(trip.startDate, trip.endDate) + 1
    }`;
  } else if (trip.startDate && trip.startDate > today) {
    const d = daysBetween(today, trip.startDate);
    timing = `in ${d} day${d === 1 ? "" : "s"}`;
  }

  return (
    <Link
      href={`/trip?id=${trip.id}`}
      className="card block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${PHASE_TILE[phase]}`}>
            {trip.emoji}
          </span>
          <div>
            <div className="font-semibold leading-tight">{trip.name}</div>
            <div className="text-sm text-ink-500">{trip.destination}</div>
          </div>
        </div>
        <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-ink-500">
        <span>
          {trip.startDate ? `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}` : "No dates yet"}
        </span>
        {timing && <span className="font-medium text-ink-700">{timing}</span>}
      </div>

      {trip.budget ? (
        <div className="mt-3 space-y-1">
          <ProgressBar value={total} max={trip.budget} danger={total > trip.budget} />
          <div className="flex justify-between text-xs text-ink-400">
            <span>{fmtMoney(total, trip.currency)} of {fmtMoney(trip.budget, trip.currency)}</span>
            <span>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-ink-400">
          {bookings.length} booking{bookings.length === 1 ? "" : "s"} ·{" "}
          {data.ideas.filter((i) => i.tripId === trip.id).length} ideas
        </div>
      )}
    </Link>
  );
}
