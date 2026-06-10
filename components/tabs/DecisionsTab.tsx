"use client";

import { useState } from "react";
import { syncBookingToItinerary } from "@/lib/automation";
import { useStore } from "@/lib/store";
import { Booking, Decision, DecisionOption, Trip } from "@/lib/types";
import { fmtMoney, uid } from "@/lib/utils";
import { Badge, EmptyState, Field, Modal } from "@/components/ui";

// Side-by-side comparison for anything with competing options: which flight,
// which neighborhood, which hotel. Decide once, convert the winner to a
// booking, move on.
export function DecisionsTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const decisions = data.decisions.filter((d) => d.tripId === trip.id);
  const [title, setTitle] = useState("");

  const add = () => {
    if (!title.trim()) return;
    const decision: Decision = {
      id: uid(),
      tripId: trip.id,
      title: title.trim(),
      status: "open",
      options: [],
      createdAt: new Date().toISOString(),
    };
    update((d) => ({ ...d, decisions: [decision, ...d.decisions] }));
    setTitle("");
  };

  return (
    <div className="space-y-4">
      <div className="card flex items-end gap-2 p-4">
        <Field label="What needs deciding?" className="flex-1">
          <input
            className="input"
            placeholder="Which hotel in Shinjuku? Fly or take the train to Kyoto?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </Field>
        <button className="btn-primary" onClick={add} disabled={!title.trim()}>
          Add decision
        </button>
      </div>

      {decisions.length === 0 ? (
        <EmptyState
          emoji="⚖️"
          title="No open decisions"
          hint="When you're torn between options — hotels, routes, dates — lay them out side by side with costs and pros/cons, then commit."
        />
      ) : (
        decisions.map((dec) => <DecisionCard key={dec.id} decision={dec} trip={trip} />)
      )}
    </div>
  );
}

function DecisionCard({ decision, trip }: { decision: Decision; trip: Trip }) {
  const { update } = useStore();
  const [adding, setAdding] = useState(false);

  const patch = (p: Partial<Decision>) =>
    update((d) => ({
      ...d,
      decisions: d.decisions.map((x) => (x.id === decision.id ? { ...x, ...p } : x)),
    }));

  const remove = () =>
    update((d) => ({ ...d, decisions: d.decisions.filter((x) => x.id !== decision.id) }));

  const decide = (optId: string) =>
    patch({ status: "decided", decidedOptionId: optId });

  const reopen = () => patch({ status: "open", decidedOptionId: undefined });

  const removeOption = (optId: string) =>
    patch({ options: decision.options.filter((o) => o.id !== optId) });

  const toBooking = (opt: DecisionOption) => {
    const booking: Booking = {
      id: uid(),
      tripId: trip.id,
      type: "other",
      title: opt.name,
      cost: opt.cost,
      status: "pending",
      paid: false,
      notes: `From decision: ${decision.title}`,
      createdAt: new Date().toISOString(),
    };
    update((d) => ({
      ...d,
      bookings: [...d.bookings, booking],
      itinerary: syncBookingToItinerary(d.itinerary, booking),
    }));
  };

  const winner = decision.options.find((o) => o.id === decision.decidedOptionId);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{decision.title}</h3>
          {decision.status === "decided" ? (
            <Badge tone="green">Decided{winner ? `: ${winner.name}` : ""}</Badge>
          ) : (
            <Badge tone="amber">Open</Badge>
          )}
        </div>
        <div className="flex gap-1">
          {decision.status === "decided" ? (
            <button className="btn-ghost text-xs" onClick={reopen}>
              Reopen
            </button>
          ) : (
            <button className="btn-secondary text-xs" onClick={() => setAdding(true)}>
              + Option
            </button>
          )}
          <button className="btn-ghost text-xs text-red-500" onClick={remove}>
            🗑
          </button>
        </div>
      </div>

      {decision.options.length === 0 ? (
        <p className="text-sm text-ink-400">No options yet — add the candidates you're comparing.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decision.options.map((opt) => {
            const isWinner = decision.decidedOptionId === opt.id;
            const dimmed = decision.status === "decided" && !isWinner;
            return (
              <div
                key={opt.id}
                className={`rounded-lg border p-3 ${
                  isWinner
                    ? "border-emerald-300 bg-emerald-50"
                    : dimmed
                      ? "border-ink-100 opacity-50"
                      : "border-ink-200"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="font-medium">{opt.name}</div>
                  {!dimmed && (
                    <button className="btn-ghost px-1 text-xs text-red-400" onClick={() => removeOption(opt.id)}>
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
                  {opt.cost !== undefined && <span>{fmtMoney(opt.cost, trip.currency)}</span>}
                  {opt.rating !== undefined && <span>{"★".repeat(opt.rating)}{"☆".repeat(5 - opt.rating)}</span>}
                </div>
                {opt.pros.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-emerald-700">
                    {opt.pros.map((p, i) => (
                      <li key={i}>+ {p}</li>
                    ))}
                  </ul>
                )}
                {opt.cons.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                    {opt.cons.map((c, i) => (
                      <li key={i}>− {c}</li>
                    ))}
                  </ul>
                )}
                {opt.url && (
                  <a href={opt.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-sky-600 hover:underline">
                    {opt.url}
                  </a>
                )}
                <div className="mt-3 flex gap-1">
                  {decision.status === "open" && (
                    <button className="btn-primary flex-1 text-xs" onClick={() => decide(opt.id)}>
                      Pick this
                    </button>
                  )}
                  {isWinner && (
                    <button className="btn-secondary flex-1 text-xs" onClick={() => toBooking(opt)}>
                      → Create booking
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddOptionModal
          onClose={() => setAdding(false)}
          onAdd={(opt) => {
            patch({ options: [...decision.options, opt] });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddOptionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (o: DecisionOption) => void;
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [rating, setRating] = useState(0);
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [url, setUrl] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      id: uid(),
      name: name.trim(),
      cost: cost ? Number(cost) : undefined,
      rating: rating || undefined,
      pros: pros.split(",").map((s) => s.trim()).filter(Boolean),
      cons: cons.split(",").map((s) => s.trim()).filter(Boolean),
      url: url.trim() || undefined,
    });
  };

  return (
    <Modal title="Add option" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Option name">
          <input className="input" placeholder="Hotel Gracery Shinjuku" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost">
            <input type="number" className="input" placeholder="—" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Rating">
            <div className="flex gap-0.5 pt-1 text-xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n === rating ? 0 : n)}>
                  {n <= rating ? "★" : "☆"}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Pros (comma-separated)">
          <input className="input" placeholder="great location, free breakfast" value={pros} onChange={(e) => setPros(e.target.value)} />
        </Field>
        <Field label="Cons (comma-separated)">
          <input className="input" placeholder="small rooms, no late checkout" value={cons} onChange={(e) => setCons(e.target.value)} />
        </Field>
        <Field label="Link">
          <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim()}>
            Add option
          </button>
        </div>
      </div>
    </Modal>
  );
}
