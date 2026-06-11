"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PHASE_LABEL, tripPhase } from "@/lib/automation";
import { useStore } from "@/lib/store";
import { Trip } from "@/lib/types";
import { CURRENCIES, fmtDate } from "@/lib/utils";
import { BookingsTab } from "@/components/tabs/BookingsTab";
import { BudgetTab } from "@/components/tabs/BudgetTab";
import { ChecklistTab } from "@/components/tabs/ChecklistTab";
import { DecisionsTab } from "@/components/tabs/DecisionsTab";
import { IdeasTab } from "@/components/tabs/IdeasTab";
import { ItineraryTab } from "@/components/tabs/ItineraryTab";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { Badge, Field, Modal } from "@/components/ui";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "ideas", label: "Ideas" },
  { key: "decisions", label: "Decisions" },
  { key: "bookings", label: "Bookings" },
  { key: "budget", label: "Budget" },
  { key: "itinerary", label: "Itinerary" },
  { key: "checklist", label: "Checklist" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function TripPage() {
  return (
    <Suspense>
      <TripPageInner />
    </Suspense>
  );
}

function TripPageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { data, hydrated } = useStore();
  const tripId = search.get("id");

  const requested = search.get("tab") as TabKey | null;
  const [tab, setTab] = useState<TabKey>(
    requested && TABS.some((t) => t.key === requested) ? requested : "overview"
  );
  const [editing, setEditing] = useState(false);

  if (!hydrated) return null;

  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-500">Trip not found.</p>
        <Link href="/" className="btn-primary mt-4 inline-flex">
          ← Back to trips
        </Link>
      </div>
    );
  }

  const phase = tripPhase(trip, data.bookings);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{trip.emoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{trip.name}</h1>
              <Badge tone={phase === "active" ? "green" : phase === "completed" ? "amber" : "blue"}>
                {PHASE_LABEL[phase]}
              </Badge>
            </div>
            <p className="text-sm text-ink-500">
              {trip.destination}
              {trip.startDate && ` · ${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`}
              {` · ${trip.travelers} traveler${trip.travelers > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          Edit trip
        </button>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-ink-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-ink-900 text-ink-900"
                : "text-ink-400 hover:text-ink-700"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab trip={trip} />}
      {tab === "ideas" && <IdeasTab trip={trip} />}
      {tab === "decisions" && <DecisionsTab trip={trip} />}
      {tab === "bookings" && <BookingsTab trip={trip} />}
      {tab === "budget" && <BudgetTab trip={trip} />}
      {tab === "itinerary" && <ItineraryTab trip={trip} />}
      {tab === "checklist" && <ChecklistTab trip={trip} />}

      {editing && (
        <EditTripModal
          trip={trip}
          onClose={() => setEditing(false)}
          onDeleted={() => router.push("/")}
        />
      )}
    </div>
  );
}

function EditTripModal({
  trip,
  onClose,
  onDeleted,
}: {
  trip: Trip;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { update } = useStore();
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.startDate || "");
  const [endDate, setEndDate] = useState(trip.endDate || "");
  const [travelers, setTravelers] = useState(trip.travelers);
  const [currency, setCurrency] = useState(trip.currency);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    update((d) => ({
      ...d,
      trips: d.trips.map((t) =>
        t.id === trip.id
          ? {
              ...t,
              name: name.trim() || t.name,
              destination: destination.trim() || t.destination,
              startDate: startDate || undefined,
              endDate: endDate || startDate || undefined,
              travelers,
              currency,
            }
          : t
      ),
    }));
    onClose();
  };

  const deleteTrip = () => {
    update((d) => ({
      ...d,
      trips: d.trips.filter((t) => t.id !== trip.id),
      ideas: d.ideas.filter((i) => i.tripId !== trip.id),
      decisions: d.decisions.filter((i) => i.tripId !== trip.id),
      bookings: d.bookings.filter((i) => i.tripId !== trip.id),
      itinerary: d.itinerary.filter((i) => i.tripId !== trip.id),
      expenses: d.expenses.filter((i) => i.tripId !== trip.id),
      checklist: d.checklist.filter((i) => i.tripId !== trip.id),
    }));
    onDeleted();
  };

  return (
    <Modal title="Edit trip" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Trip name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Destination">
          <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" className="input" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Travelers">
            <input
              type="number"
              min={1}
              className="input"
              value={travelers}
              onChange={(e) => setTravelers(Math.max(1, Number(e.target.value)))}
            />
          </Field>
          <Field label="Currency">
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex items-center justify-between pt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Delete everything?</span>
              <button className="btn-danger text-xs" onClick={deleteTrip}>
                Yes, delete
              </button>
              <button className="btn-ghost text-xs" onClick={() => setConfirmDelete(false)}>
                No
              </button>
            </div>
          ) : (
            <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete trip
            </button>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
