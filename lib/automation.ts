import {
  AppData,
  Booking,
  ItineraryItem,
  Reminder,
  Trip,
  TripPhase,
} from "./types";
import { addDays, daysBetween, fmtDateShort, todayStr, uid } from "./utils";

// ---------------------------------------------------------------------------
// Trip phase — computed, never stored. The trip moves through its lifecycle
// automatically as dates pass and bookings are confirmed.
// ---------------------------------------------------------------------------

export function tripPhase(trip: Trip, bookings: Booking[]): TripPhase {
  const today = todayStr();
  if (trip.endDate && trip.endDate < today) return "completed";
  if (trip.startDate && trip.startDate <= today && (!trip.endDate || trip.endDate >= today)) {
    return "active";
  }
  const hasConfirmed = bookings.some(
    (b) => b.tripId === trip.id && b.status === "confirmed"
  );
  if (hasConfirmed) return "booked";
  if (trip.startDate) return "planning";
  return "idea";
}

export const PHASE_LABEL: Record<TripPhase, string> = {
  idea: "Dreaming",
  planning: "Planning",
  booked: "Booked",
  active: "In progress",
  completed: "Completed",
};

export const PHASE_ORDER: TripPhase[] = [
  "active",
  "booked",
  "planning",
  "idea",
  "completed",
];

// ---------------------------------------------------------------------------
// Reminders — recomputed from current data on every render. Nothing to
// schedule or clear; fix the underlying thing and the reminder disappears.
// ---------------------------------------------------------------------------

export function buildReminders(data: AppData): Reminder[] {
  const out: Reminder[] = [];
  const today = todayStr();

  for (const trip of data.trips) {
    const phase = tripPhase(trip, data.bookings);
    const bookings = data.bookings.filter(
      (b) => b.tripId === trip.id && b.status !== "cancelled"
    );
    const push = (severity: Reminder["severity"], text: string, tab?: string) =>
      out.push({ id: uid(), tripId: trip.id, tripName: trip.name, severity, text, tab });

    // Flight check-in within 48h
    for (const b of bookings) {
      if (b.type !== "flight" || !b.start) continue;
      const d = daysBetween(today, b.start.slice(0, 10));
      if (d >= 0 && d <= 1) {
        push("urgent", `Check in for ${b.title} (departs ${fmtDateShort(b.start.slice(0, 10))})`, "bookings");
      }
    }

    // Any booking starting in the next 3 days
    for (const b of bookings) {
      if (b.type === "flight" || !b.start) continue;
      const d = daysBetween(today, b.start.slice(0, 10));
      if (d >= 0 && d <= 3) {
        push("info", `Upcoming: ${b.title} on ${fmtDateShort(b.start.slice(0, 10))}`, "bookings");
      }
    }

    if (trip.startDate && phase !== "completed") {
      const untilTrip = daysBetween(today, trip.startDate);

      // Unpaid bookings close to departure
      if (untilTrip >= 0 && untilTrip <= 14) {
        const unpaid = bookings.filter((b) => !b.paid && b.cost);
        if (unpaid.length > 0) {
          push("warn", `${unpaid.length} unpaid booking${unpaid.length > 1 ? "s" : ""} — trip starts in ${untilTrip} day${untilTrip === 1 ? "" : "s"}`, "bookings");
        }
      }

      // Documents checklist incomplete close to departure
      if (untilTrip >= 0 && untilTrip <= 14) {
        const docs = data.checklist.filter(
          (c) => c.tripId === trip.id && c.group === "documents" && !c.done
        );
        if (docs.length > 0) {
          push("warn", `${docs.length} document item${docs.length > 1 ? "s" : ""} unchecked`, "checklist");
        }
      }

      // No itinerary a week out
      if (untilTrip >= 0 && untilTrip <= 7) {
        const items = data.itinerary.filter((i) => i.tripId === trip.id);
        if (items.length === 0) {
          push("info", "Trip starts soon and the itinerary is empty", "itinerary");
        }
      }

      // Pending (unconfirmed) bookings as the trip nears
      if (untilTrip >= 0 && untilTrip <= 21) {
        const pending = bookings.filter((b) => b.status === "pending");
        if (pending.length > 0) {
          push("info", `${pending.length} booking${pending.length > 1 ? "s" : ""} still pending confirmation`, "bookings");
        }
      }
    }

    // Budget overrun
    if (trip.budget) {
      const committed = bookings.reduce((s, b) => s + (b.cost || 0), 0);
      const spent = data.expenses
        .filter((e) => e.tripId === trip.id)
        .reduce((s, e) => s + e.amount, 0);
      if (committed + spent > trip.budget) {
        push("warn", `Over budget: committed + spent exceeds ${trip.currency} ${trip.budget.toLocaleString()}`, "budget");
      }
    }

    // Open decisions before the trip
    if (phase === "planning" || phase === "booked") {
      const open = data.decisions.filter(
        (d) => d.tripId === trip.id && d.status === "open" && d.options.length > 1
      );
      if (open.length > 0) {
        push("info", `${open.length} decision${open.length > 1 ? "s" : ""} waiting on a call`, "decisions");
      }
    }

    // Post-trip retro
    if (phase === "completed" && !trip.retro) {
      push("info", "Trip wrapped — capture what worked and what to improve", "overview");
    }
  }

  // Backup hygiene — a global reminder (empty tripId links to Settings).
  if (data.trips.length > 0) {
    const last = data.settings.lastBackupAt;
    const sinceBackup = last ? daysBetween(last.slice(0, 10), today) : Infinity;
    if (sinceBackup > 14) {
      out.push({
        id: uid(),
        tripId: "",
        tripName: "Travel OS",
        severity: "info",
        text: last
          ? `No backup in ${sinceBackup} days — export one from Settings`
          : "Your trips live only in this browser — export a backup from Settings",
      });
    }
  }

  const sevRank = { urgent: 0, warn: 1, info: 2 };
  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}

// ---------------------------------------------------------------------------
// Booking → itinerary sync. Every booking with a date gets a linked itinerary
// item; edits to the booking refresh it, cancelling removes it.
// ---------------------------------------------------------------------------

export function syncBookingToItinerary(
  itinerary: ItineraryItem[],
  booking: Booking
): ItineraryItem[] {
  const rest = itinerary.filter((i) => i.bookingId !== booking.id);
  if (booking.status === "cancelled" || !booking.start) return rest;

  const date = booking.start.slice(0, 10);
  const startTime = booking.start.length > 10 ? booking.start.slice(11, 16) : undefined;
  const existing = itinerary.find((i) => i.bookingId === booking.id);

  const item: ItineraryItem = {
    id: existing?.id || uid(),
    tripId: booking.tripId,
    date,
    startTime,
    title: booking.title,
    type: booking.type,
    location: booking.location,
    bookingId: booking.id,
    notes: booking.confirmationCode ? `Conf: ${booking.confirmationCode}` : undefined,
    done: existing?.done || false,
  };

  // Hotels also get a check-out entry on the end date.
  const items = [item];
  if (booking.type === "hotel" && booking.end) {
    const outDate = booking.end.slice(0, 10);
    if (outDate !== date) {
      const existingOut = itinerary.find(
        (i) => i.bookingId === booking.id && i.date !== date
      );
      items.push({
        id: existingOut?.id || uid(),
        tripId: booking.tripId,
        date: outDate,
        startTime: booking.end.length > 10 ? booking.end.slice(11, 16) : undefined,
        title: `Check out · ${booking.title}`,
        type: "hotel",
        location: booking.location,
        bookingId: booking.id,
        done: existingOut?.done || false,
      });
    }
  }

  return [...rest, ...items];
}

// Suggested default date for promoting an idea onto the itinerary.
export function defaultItineraryDate(trip: Trip): string {
  const today = todayStr();
  if (trip.startDate && trip.startDate >= today) return trip.startDate;
  if (trip.startDate && trip.endDate && trip.endDate >= today) return today;
  return trip.startDate || addDays(today, 7);
}
