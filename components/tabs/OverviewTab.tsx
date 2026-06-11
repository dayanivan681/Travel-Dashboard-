"use client";

import { useMemo, useState } from "react";
import { aiRequest } from "@/lib/ai";
import { buildReminders, tripPhase } from "@/lib/automation";
import { sumExpenses, useFxRates } from "@/lib/fx";
import { useStore } from "@/lib/store";
import { Expense, ExpenseCategory, Trip } from "@/lib/types";
import { daysBetween, fmtMoney, todayStr, uid } from "@/lib/utils";
import { ReminderList } from "@/components/Reminders";
import { BOOKING_TYPE_EMOJI, Field, ProgressBar } from "@/components/ui";

export function OverviewTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const phase = tripPhase(trip, data.bookings);
  const today = todayStr();

  const reminders = useMemo(
    () => buildReminders(data).filter((r) => r.tripId === trip.id),
    [data, trip.id]
  );

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
  const checklist = data.checklist.filter((c) => c.tripId === trip.id);
  const checklistDone = checklist.filter((c) => c.done).length;

  let countdown = "";
  if (phase === "active" && trip.startDate && trip.endDate) {
    countdown = `Day ${daysBetween(trip.startDate, today) + 1} of ${daysBetween(trip.startDate, trip.endDate) + 1}`;
  } else if (trip.startDate && trip.startDate > today) {
    countdown = `${daysBetween(today, trip.startDate)} days to go`;
  } else if (phase === "completed") {
    countdown = "Trip complete";
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">Timing</div>
          <div className="mt-1 text-lg font-semibold">{countdown || "No dates set"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">Budget</div>
          <div className="mt-1 text-lg font-semibold">
            {fmtMoney(committed + spent, trip.currency)}
            {trip.budget ? (
              <span className="text-sm font-normal text-ink-400"> / {fmtMoney(trip.budget, trip.currency)}</span>
            ) : null}
          </div>
          {trip.budget ? (
            <div className="mt-2">
              <ProgressBar value={committed + spent} max={trip.budget} danger={committed + spent > trip.budget} />
            </div>
          ) : null}
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-400">Ready?</div>
          <div className="mt-1 text-lg font-semibold">
            {bookings.length} bookings · {checklistDone}/{checklist.length} checked
          </div>
        </div>
      </div>

      <DestinationBriefing trip={trip} />

      {phase === "active" && <TodayPanel trip={trip} />}

      {reminders.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Needs attention
          </h3>
          <ReminderList reminders={reminders} />
        </section>
      )}

      <section className="card p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Trip notes
        </h3>
        <textarea
          className="input h-28"
          placeholder="Anything worth remembering — vibe, constraints, who's coming, links…"
          value={trip.notes}
          onChange={(e) =>
            update((d) => ({
              ...d,
              trips: d.trips.map((t) => (t.id === trip.id ? { ...t, notes: e.target.value } : t)),
            }))
          }
        />
      </section>

      {phase === "completed" && <RetroPanel trip={trip} />}
    </div>
  );
}

// AI-generated local-knowledge briefing (money, customs, plugs, weather,
// safety) for the destination — generated once and cached on the trip.
function DestinationBriefing({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  if (!aiAvailable && !trip.briefing) return null;

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await aiRequest<{ content: string }>("destination-briefing", data.settings.apiKey, {
        trip,
        profile: data.settings.profile,
      });
      update((d) => ({
        ...d,
        trips: d.trips.map((t) =>
          t.id === trip.id
            ? { ...t, briefing: { content: res.content, generatedAt: new Date().toISOString() } }
            : t
        ),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          ✨ Destination briefing
        </h3>
        {aiAvailable && (
          <button className="btn-ghost text-xs" onClick={generate} disabled={loading}>
            {loading ? "Generating…" : trip.briefing ? "Regenerate" : "Generate"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {trip.briefing ? (
        <p className="whitespace-pre-line text-sm text-ink-700">{trip.briefing.content}</p>
      ) : (
        <p className="text-sm text-ink-500">
          Get a quick local briefing for {trip.destination}: money & tipping,
          plug type, customs, weather, and getting around.
        </p>
      )}
    </section>
  );
}

// During the trip, Overview leads with what's happening right now: today's
// schedule plus one-tap expense capture.
function TodayPanel({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const today = todayStr();
  const items = data.itinerary
    .filter((i) => i.tripId === trip.id && i.date === today)
    .sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("food");

  const addExpense = () => {
    if (!desc.trim() || !amount) return;
    const exp: Expense = {
      id: uid(),
      tripId: trip.id,
      date: today,
      description: desc.trim(),
      category,
      amount: Number(amount),
    };
    update((d) => ({ ...d, expenses: [...d.expenses, exp] }));
    setDesc("");
    setAmount("");
  };

  const ratesToday = useFxRates();
  const spentToday = sumExpenses(
    data.expenses.filter((e) => e.tripId === trip.id && e.date === today),
    trip.currency,
    ratesToday
  );

  return (
    <section className="card border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">📍 Today</h3>
        <span className="text-sm text-ink-500">
          Spent today: <span className="font-medium text-ink-800">{fmtMoney(spentToday, trip.currency)}</span>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing scheduled today — free day!</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={i.done}
                onChange={() =>
                  update((d) => ({
                    ...d,
                    itinerary: d.itinerary.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)),
                  }))
                }
              />
              <span className="w-12 text-xs text-ink-400">{i.startTime || "—"}</span>
              <span>{BOOKING_TYPE_EMOJI[i.type]}</span>
              <span className={i.done ? "text-ink-400 line-through" : ""}>{i.title}</span>
              {i.location && <span className="text-xs text-ink-400">· {i.location}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-emerald-200/60 pt-3">
        <Field label="Quick expense" className="min-w-32 flex-1">
          <input className="input" placeholder="Lunch" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <Field label="Amount" className="w-24">
          <input type="number" className="input" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Category" className="w-32">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {(["food", "transport", "lodging", "activities", "shopping", "other"] as const).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <button className="btn-primary" onClick={addExpense} disabled={!desc.trim() || !amount}>
          Add
        </button>
      </div>
    </section>
  );
}

// Post-trip: capture what to keep and what to fix; optionally let the AI
// summarize lessons from the numbers. This is how trips improve over time.
function RetroPanel({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const [insights, setInsights] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  const setRetro = (patch: Partial<NonNullable<Trip["retro"]>>) =>
    update((d) => ({
      ...d,
      trips: d.trips.map((t) =>
        t.id === trip.id
          ? { ...t, retro: { wins: "", improvements: "", ...t.retro, ...patch } }
          : t
      ),
    }));

  const getInsights = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await aiRequest<{ insights: string }>("trip-insights", data.settings.apiKey, {
        trip,
        bookings: data.bookings.filter((b) => b.tripId === trip.id),
        expenses: data.expenses.filter((e) => e.tripId === trip.id),
        itinerary: data.itinerary.filter((i) => i.tripId === trip.id),
      });
      setInsights(res.insights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card p-4">
      <h3 className="mb-2 font-semibold">🔁 Trip retro — make the next one better</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What worked">
          <textarea
            className="input h-24"
            placeholder="Booking the hotel near the station saved us so much time…"
            value={trip.retro?.wins || ""}
            onChange={(e) => setRetro({ wins: e.target.value })}
          />
        </Field>
        <Field label="What to improve next time">
          <textarea
            className="input h-24"
            placeholder="Overpacked. Budget more for food. Book trains earlier…"
            value={trip.retro?.improvements || ""}
            onChange={(e) => setRetro({ improvements: e.target.value })}
          />
        </Field>
      </div>
      {aiAvailable && (
        <div className="mt-3">
          <button className="btn-secondary" onClick={getInsights} disabled={loading}>
            {loading ? "Analyzing…" : "✨ AI: analyze this trip"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {insights && (
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{insights}</pre>
          )}
        </div>
      )}
    </section>
  );
}
