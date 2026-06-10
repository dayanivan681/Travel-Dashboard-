"use client";

import { useMemo, useState } from "react";
import { tripPhase } from "@/lib/automation";
import { useStore } from "@/lib/store";
import { Expense, ExpenseCategory, Trip } from "@/lib/types";
import { daysBetween, fmtDate, fmtMoney, todayStr, uid } from "@/lib/utils";
import { EmptyState, Field, ProgressBar } from "@/components/ui";

const CATEGORIES: ExpenseCategory[] = ["lodging", "transport", "food", "activities", "shopping", "other"];
const CAT_EMOJI: Record<ExpenseCategory, string> = {
  lodging: "🏨",
  transport: "🚕",
  food: "🍜",
  activities: "🎟️",
  shopping: "🛍️",
  other: "📦",
};

export function BudgetTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const phase = tripPhase(trip, data.bookings);

  const bookings = data.bookings.filter(
    (b) => b.tripId === trip.id && b.status !== "cancelled"
  );
  const expenses = data.expenses
    .filter((e) => e.tripId === trip.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const committed = bookings.reduce((s, b) => s + (b.cost || 0), 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const total = committed + spent;

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) || 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  // Per-day burn rate while the trip is running.
  let perDay: number | undefined;
  if (phase === "active" && trip.startDate) {
    const daysIn = daysBetween(trip.startDate, todayStr()) + 1;
    if (daysIn > 0) perDay = spent / daysIn;
  }

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [date, setDate] = useState(todayStr());

  const add = () => {
    if (!desc.trim() || !amount) return;
    const exp: Expense = {
      id: uid(),
      tripId: trip.id,
      date,
      description: desc.trim(),
      category,
      amount: Number(amount),
    };
    update((d) => ({ ...d, expenses: [...d.expenses, exp] }));
    setDesc("");
    setAmount("");
  };

  const remove = (id: string) =>
    update((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));

  const setBudget = (value: string) =>
    update((d) => ({
      ...d,
      trips: d.trips.map((t) =>
        t.id === trip.id ? { ...t, budget: value ? Number(value) : undefined } : t
      ),
    }));

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">Total so far</div>
            <div className="text-2xl font-bold">
              {fmtMoney(total, trip.currency)}
              {trip.budget ? (
                <span className="text-base font-normal text-ink-400"> / {fmtMoney(trip.budget, trip.currency)}</span>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-ink-500">
              {fmtMoney(committed, trip.currency)} committed (bookings) + {fmtMoney(spent, trip.currency)} spent
              {perDay !== undefined && (
                <span> · averaging {fmtMoney(perDay, trip.currency)}/day</span>
              )}
            </div>
          </div>
          <Field label="Trip budget">
            <input
              type="number"
              className="input w-32"
              placeholder="—"
              defaultValue={trip.budget ?? ""}
              onBlur={(e) => setBudget(e.target.value)}
            />
          </Field>
        </div>
        {trip.budget ? (
          <div className="mt-3">
            <ProgressBar value={total} max={trip.budget} danger={total > trip.budget} />
            <div className="mt-1 text-xs text-ink-400">
              {total > trip.budget
                ? `${fmtMoney(total - trip.budget, trip.currency)} over budget`
                : `${fmtMoney(trip.budget - total, trip.currency)} remaining`}
            </div>
          </div>
        ) : null}
      </div>

      {byCategory.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Spending by category
          </h3>
          <div className="space-y-2">
            {byCategory.map(([cat, amt]) => (
              <div key={cat} className="flex items-center gap-2 text-sm">
                <span className="w-6">{CAT_EMOJI[cat]}</span>
                <span className="w-24 capitalize text-ink-600">{cat}</span>
                <div className="flex-1">
                  <ProgressBar value={amt} max={byCategory[0][1]} />
                </div>
                <span className="w-24 text-right font-medium">{fmtMoney(amt, trip.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-2 p-4">
        <Field label="Expense" className="min-w-40 flex-1">
          <input
            className="input"
            placeholder="Taxi from airport"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </Field>
        <Field label="Amount" className="w-24">
          <input type="number" className="input" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Category" className="w-32">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date" className="w-36">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <button className="btn-primary" onClick={add} disabled={!desc.trim() || !amount}>
          Add
        </button>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          emoji="💸"
          title="No expenses logged"
          hint="Bookings count toward the budget automatically. Log day-to-day spending here (or from the Today panel during the trip)."
        />
      ) : (
        <ul className="card divide-y divide-ink-100">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span>{CAT_EMOJI[e.category]}</span>
              <span className="flex-1">{e.description}</span>
              <span className="text-xs text-ink-400">{fmtDate(e.date)}</span>
              <span className="w-24 text-right font-medium">{fmtMoney(e.amount, trip.currency)}</span>
              <button className="btn-ghost px-1 text-xs text-red-400" onClick={() => remove(e.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
