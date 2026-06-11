"use client";

import { useEffect, useMemo, useState } from "react";
import { aiRequest } from "@/lib/ai";
import { buildReminders, PHASE_LABEL, PHASE_ORDER, tripPhase } from "@/lib/automation";
import { getSnapshotData, listSnapshots, SnapshotMeta } from "@/lib/backup";
import { useStore } from "@/lib/store";
import { CHECKLIST_TEMPLATES } from "@/lib/templates";
import { ChecklistItem, Trip, TripPhase } from "@/lib/types";
import { CURRENCIES, todayStr, uid } from "@/lib/utils";
import { ReminderList } from "@/components/Reminders";
import { TripCard } from "@/components/TripCard";
import { EmptyState, Field, Modal } from "@/components/ui";

export default function Dashboard() {
  const { data, hydrated } = useStore();
  const [creating, setCreating] = useState(false);

  const reminders = useMemo(() => buildReminders(data), [data]);

  const grouped = useMemo(() => {
    const groups = new Map<TripPhase, Trip[]>();
    for (const trip of data.trips) {
      const phase = tripPhase(trip, data.bookings);
      if (!groups.has(phase)) groups.set(phase, []);
      groups.get(phase)!.push(trip);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
    }
    return groups;
  }, [data]);

  if (!hydrated) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your trips</h1>
          <p className="text-sm text-ink-500">
            Everything for every trip — before, during, and after.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + New trip
        </button>
      </div>

      {data.trips.length > 0 && <DigestCard />}

      {reminders.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Needs attention
          </h2>
          <ReminderList reminders={reminders} showTrip limit={5} />
        </section>
      )}

      {data.trips.length === 0 && <RecoveryBanner />}

      {data.trips.length === 0 ? (
        <EmptyState
          emoji="🗺️"
          title="No trips yet"
          hint="Start with a destination you're dreaming about — you can add dates, ideas, and bookings as plans firm up."
        >
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Plan your first trip
          </button>
        </EmptyState>
      ) : (
        PHASE_ORDER.map((phase) => {
          const trips = grouped.get(phase);
          if (!trips || trips.length === 0) return null;
          return (
            <section key={phase}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
                {PHASE_LABEL[phase]}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {trips.map((t) => (
                  <TripCard key={t.id} trip={t} data={data} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {creating && <NewTripModal onClose={() => setCreating(false)} />}
    </div>
  );
}

// Shown only when the live data is empty: if an automatic snapshot still has
// trips in it, the data was probably lost rather than never created — offer
// one-click recovery.
function RecoveryBanner() {
  const { importJson } = useStore();
  const [snapshot, setSnapshot] = useState<SnapshotMeta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listSnapshots().then((snaps) => {
      const withTrips = snaps.find((s) => s.trips > 0);
      if (withTrips) setSnapshot(withTrips);
    });
  }, []);

  if (!snapshot) return null;

  const restore = async () => {
    const data = await getSnapshotData(snapshot.takenAt);
    if (!data) {
      setError("Couldn't read the snapshot — check Settings for older ones.");
      return;
    }
    const result = importJson(JSON.stringify(data));
    if (!result.ok) setError(result.error || "Restore failed.");
  };

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
      <div className="text-sm text-amber-900">
        <span className="font-medium">🛟 Found a recovery snapshot</span> from{" "}
        {new Date(snapshot.takenAt).toLocaleString()} with {snapshot.trips} trip
        {snapshot.trips === 1 ? "" : "s"} — your data may have been cleared.
        {error && <span className="block text-red-600">{error}</span>}
      </div>
      <button className="btn-primary" onClick={restore}>
        Restore it
      </button>
    </div>
  );
}

// AI morning-briefing digest across all trips: what's next, what needs
// action, budget standouts. Cached in settings until regenerated.
function DigestCard() {
  const { data, update } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;
  const digest = data.settings.digest;

  if (!aiAvailable && !digest) return null;

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const reminders = buildReminders(data).map((r) => `${r.tripName}: ${r.text}`);
      const trips = data.trips.map((t) => {
        const bookings = data.bookings.filter(
          (b) => b.tripId === t.id && b.status !== "cancelled"
        );
        const committed = bookings.reduce((s, b) => s + (b.cost || 0), 0);
        const spent = data.expenses
          .filter((e) => e.tripId === t.id)
          .reduce((s, e) => s + e.amount, 0);
        return {
          name: t.name,
          destination: t.destination,
          phase: tripPhase(t, data.bookings),
          startDate: t.startDate,
          endDate: t.endDate,
          budget: t.budget,
          currency: t.currency,
          committedPlusSpent: committed + spent,
          bookings: bookings.length,
          itineraryItems: data.itinerary.filter((i) => i.tripId === t.id).length,
        };
      });
      const res = await aiRequest<{ content: string }>("dashboard-digest", data.settings.apiKey, {
        today: todayStr(),
        trips,
        reminders,
      });
      update((d) => ({
        ...d,
        settings: {
          ...d.settings,
          digest: { content: res.content, generatedAt: new Date().toISOString() },
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the digest");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          ✨ Your briefing
        </h2>
        {aiAvailable && (
          <button className="btn-ghost text-xs" onClick={generate} disabled={loading}>
            {loading ? "Thinking…" : digest ? "Refresh" : "Generate"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {digest ? (
        <>
          <p className="whitespace-pre-line text-sm text-ink-700">{digest.content}</p>
          <p className="mt-2 text-xs text-ink-300">
            {new Date(digest.generatedAt).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-500">
          A short morning-briefing across all your trips: what&apos;s coming up,
          what needs action, and how budgets are tracking.
        </p>
      )}
    </section>
  );
}

function NewTripModal({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [emoji, setEmoji] = useState("🌍");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState(data.settings.homeCurrency);
  const [withTemplates, setWithTemplates] = useState(true);

  const EMOJIS = ["🌍", "🏝️", "🗼", "🗻", "🏜️", "🎿", "🏛️", "🌸", "🦁", "🛳️"];

  const submit = () => {
    if (!name.trim()) return;
    const trip: Trip = {
      id: uid(),
      name: name.trim(),
      destination: destination.trim() || name.trim(),
      emoji,
      startDate: startDate || undefined,
      endDate: endDate || startDate || undefined,
      travelers,
      currency,
      budget: budget ? Number(budget) : undefined,
      notes: "",
      tags: [],
      createdAt: new Date().toISOString(),
    };
    const checklist: ChecklistItem[] = withTemplates
      ? Object.values(CHECKLIST_TEMPLATES).flatMap((tpl) =>
          tpl.items.map((text) => ({
            id: uid(),
            tripId: trip.id,
            text,
            group: tpl.group,
            done: false,
            createdAt: new Date().toISOString(),
          }))
        )
      : [];
    update((d) => ({
      ...d,
      trips: [...d.trips, trip],
      checklist: [...d.checklist, ...checklist],
    }));
    onClose();
  };

  return (
    <Modal title="New trip" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Trip name">
          <input
            className="input"
            placeholder="Japan in spring"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Destination">
          <input
            className="input"
            placeholder="Tokyo & Kyoto"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                className={`rounded-lg p-1.5 text-xl ${e === emoji ? "bg-ink-200" : "hover:bg-ink-100"}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date (optional)">
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" className="input" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Travelers">
            <input
              type="number"
              min={1}
              className="input"
              value={travelers}
              onChange={(e) => setTravelers(Math.max(1, Number(e.target.value)))}
            />
          </Field>
          <Field label="Budget (optional)">
            <input
              type="number"
              min={0}
              className="input"
              placeholder="3000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
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
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={withTemplates}
            onChange={(e) => setWithTemplates(e.target.checked)}
          />
          Add starter checklists (documents, packing, pre-trip to-dos)
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim()}>
            Create trip
          </button>
        </div>
      </div>
    </Modal>
  );
}
