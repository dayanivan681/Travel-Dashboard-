"use client";

import { useMemo, useState } from "react";
import { aiRequest } from "@/lib/ai";
import { useStore } from "@/lib/store";
import { BookingType, ItineraryItem, Trip } from "@/lib/types";
import { dateRange, fmtDateShort, todayStr, uid } from "@/lib/utils";
import { BOOKING_TYPE_EMOJI, EmptyState, Field, Modal } from "@/components/ui";

type ItemType = BookingType | "note";
const TYPES: ItemType[] = ["activity", "restaurant", "flight", "hotel", "train", "car", "note", "other"];

interface AiPlanDay {
  date: string;
  items: Array<{
    startTime: string | null;
    title: string;
    type: string;
    location: string | null;
    notes: string | null;
  }>;
}

export function ItineraryTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const items = data.itinerary.filter((i) => i.tripId === trip.id);
  const today = todayStr();

  const [adding, setAdding] = useState<string | null>(null); // date being added to
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPlan, setAiPlan] = useState<AiPlanDay[] | null>(null);

  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  const days = useMemo(() => {
    if (trip.startDate && trip.endDate) return dateRange(trip.startDate, trip.endDate);
    // No dates: derive day list from whatever items exist.
    return [...new Set(items.map((i) => i.date))].sort();
  }, [trip.startDate, trip.endDate, items]);

  const byDay = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>();
    for (const i of items) {
      if (!map.has(i.date)) map.set(i.date, []);
      map.get(i.date)!.push(i);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
    }
    return map;
  }, [items]);

  const toggleDone = (id: string) =>
    update((d) => ({
      ...d,
      itinerary: d.itinerary.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    }));

  const remove = (id: string) =>
    update((d) => ({ ...d, itinerary: d.itinerary.filter((i) => i.id !== id) }));

  const suggest = async () => {
    setSuggesting(true);
    setAiError("");
    try {
      const plannedDates = [...byDay.keys()].filter((d) => (byDay.get(d)?.length || 0) > 0);
      const res = await aiRequest<{ plan: { days: AiPlanDay[] } }>(
        "suggest-itinerary",
        data.settings.apiKey,
        {
          trip: {
            name: trip.name,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            travelers: trip.travelers,
            notes: trip.notes,
          },
          ideas: data.ideas
            .filter((i) => i.tripId === trip.id && (i.status === "approved" || i.status === "shortlisted"))
            .map((i) => ({ title: i.title, category: i.category, notes: i.notes })),
          bookings: data.bookings
            .filter((b) => b.tripId === trip.id && b.status !== "cancelled")
            .map((b) => ({ type: b.type, title: b.title, start: b.start, end: b.end, location: b.location })),
          plannedDates,
        }
      );
      setAiPlan(res.plan.days);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

  const acceptPlan = () => {
    if (!aiPlan) return;
    const newItems: ItineraryItem[] = aiPlan.flatMap((day) =>
      day.items.map((it) => ({
        id: uid(),
        tripId: trip.id,
        date: day.date,
        startTime: it.startTime || undefined,
        title: it.title,
        type: (TYPES.includes(it.type as ItemType) ? it.type : "activity") as ItemType,
        location: it.location || undefined,
        notes: it.notes || undefined,
        done: false,
      }))
    );
    update((d) => ({ ...d, itinerary: [...d.itinerary, ...newItems] }));
    setAiPlan(null);
  };

  if (days.length === 0) {
    return (
      <EmptyState
        emoji="🗓️"
        title="Set trip dates to build a day-by-day plan"
        hint="Once the trip has dates, every day gets a slot here. Bookings land on the right day automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      {aiAvailable && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-500">
            Bookings appear automatically. Add your own plans per day.
          </p>
          <button className="btn-secondary" onClick={suggest} disabled={suggesting}>
            {suggesting ? "Thinking…" : "✨ AI: fill the empty days"}
          </button>
        </div>
      )}
      {aiError && <p className="text-sm text-red-600">{aiError}</p>}

      <div className="space-y-3">
        {days.map((day, idx) => {
          const list = byDay.get(day) || [];
          const isToday = day === today;
          return (
            <div key={day} className={`card p-3 ${isToday ? "border-emerald-300 ring-1 ring-emerald-200" : ""}`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Day {idx + 1} · {fmtDateShort(day)}
                  {isToday && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">today</span>}
                </h3>
                <button className="btn-ghost text-xs" onClick={() => setAdding(day)}>
                  + Add
                </button>
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-ink-300">Nothing planned</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((i) => (
                    <li key={i.id} className="group flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={i.done} onChange={() => toggleDone(i.id)} />
                      <span className="w-12 text-xs text-ink-400">{i.startTime || "—"}</span>
                      <span>{BOOKING_TYPE_EMOJI[i.type]}</span>
                      <span className={`flex-1 ${i.done ? "text-ink-400 line-through" : ""}`}>
                        {i.title}
                        {i.location && <span className="ml-1 text-xs text-ink-400">· {i.location}</span>}
                        {i.notes && <span className="ml-1 text-xs text-ink-400">— {i.notes}</span>}
                        {i.bookingId && <span className="ml-1 text-xs" title="Linked to a booking">🔗</span>}
                      </span>
                      {!i.bookingId && (
                        <button
                          className="btn-ghost px-1 text-xs text-red-400 opacity-0 group-hover:opacity-100"
                          onClick={() => remove(i.id)}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <AddItemModal
          date={adding}
          tripId={trip.id}
          onClose={() => setAdding(null)}
        />
      )}

      {aiPlan && (
        <Modal title="Suggested plan" onClose={() => setAiPlan(null)} wide>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {aiPlan.map((day) => (
              <div key={day.date}>
                <div className="text-sm font-semibold">{fmtDateShort(day.date)}</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {day.items.map((it, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-12 text-xs text-ink-400">{it.startTime || "—"}</span>
                      <span>{BOOKING_TYPE_EMOJI[it.type] || "📌"}</span>
                      <span>
                        {it.title}
                        {it.location && <span className="text-xs text-ink-400"> · {it.location}</span>}
                        {it.notes && <span className="block text-xs text-ink-400">{it.notes}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAiPlan(null)}>
              Discard
            </button>
            <button className="btn-primary" onClick={acceptPlan}>
              Add to itinerary
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddItemModal({
  date,
  tripId,
  onClose,
}: {
  date: string;
  tripId: string;
  onClose: () => void;
}) {
  const { update } = useStore();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType>("activity");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    const item: ItineraryItem = {
      id: uid(),
      tripId,
      date,
      startTime: startTime || undefined,
      title: title.trim(),
      type,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      done: false,
    };
    update((d) => ({ ...d, itinerary: [...d.itinerary, item] }));
    onClose();
  };

  return (
    <Modal title={`Add to ${fmtDateShort(date)}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="What">
          <input className="input" placeholder="Senso-ji temple" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time">
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Location">
          <input className="input" placeholder="Asakusa" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Notes">
          <input className="input" placeholder="Go early to beat crowds" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!title.trim()}>
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}
