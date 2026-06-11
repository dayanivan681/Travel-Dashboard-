"use client";

import { useState } from "react";
import { aiRequest } from "@/lib/ai";
import { syncBookingToItinerary } from "@/lib/automation";
import { useStore } from "@/lib/store";
import {
  Booking,
  CaptureResult,
  Expense,
  ExpenseCategory,
  Idea,
  IdeaCategory,
  ParsedBooking,
  Trip,
} from "@/lib/types";
import { todayStr, uid } from "@/lib/utils";
import { PreviewForm } from "./SmartImport";
import { Field, Modal } from "./ui";

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["lodging", "transport", "food", "activities", "shopping", "other"];
const IDEA_CATEGORIES: IdeaCategory[] = ["place", "activity", "food", "stay", "transport", "other"];

// Universal capture: paste anything — a confirmation email, a receipt, a
// recommendation from a friend, a quick note — and AI figures out what kind
// of record it is and routes it to the right place.
export function QuickCapture({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { data, update } = useStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  const organize = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await aiRequest<{ result: CaptureResult }>("capture", data.settings.apiKey, {
        rawText: text,
      });
      setResult(res.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't organize that");
    } finally {
      setLoading(false);
    }
  };

  const saveBooking = (b: ParsedBooking) => {
    const booking: Booking = {
      id: uid(),
      tripId: trip.id,
      type: b.type,
      title: b.title,
      provider: b.provider,
      confirmationCode: b.confirmationCode,
      start: b.start,
      end: b.end,
      location: b.location,
      cost: b.cost,
      status: "confirmed",
      paid: false,
      notes: b.notes,
      rawText: text,
      createdAt: new Date().toISOString(),
    };
    update((d) => ({
      ...d,
      bookings: [...d.bookings, booking],
      itinerary: syncBookingToItinerary(d.itinerary, booking),
    }));
    onClose();
  };

  const saveExpense = (e: { description: string; category: ExpenseCategory; amount: number; date: string }) => {
    const expense: Expense = {
      id: uid(),
      tripId: trip.id,
      date: e.date || todayStr(),
      description: e.description,
      category: e.category,
      amount: e.amount,
    };
    update((d) => ({ ...d, expenses: [...d.expenses, expense] }));
    onClose();
  };

  const saveIdea = (i: { title: string; category: IdeaCategory; notes: string; estCost?: number }) => {
    const idea: Idea = {
      id: uid(),
      tripId: trip.id,
      title: i.title,
      category: i.category,
      notes: i.notes || undefined,
      estCost: i.estCost,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    update((d) => ({ ...d, ideas: [idea, ...d.ideas] }));
    onClose();
  };

  const saveNote = (note: string) => {
    update((d) => ({
      ...d,
      trips: d.trips.map((t) =>
        t.id === trip.id ? { ...t, notes: t.notes ? `${t.notes}\n\n${note}` : note } : t
      ),
    }));
    onClose();
  };

  return (
    <Modal title="✨ Quick add" onClose={onClose} wide>
      {!result ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">
            Paste a confirmation email, a receipt, a recommendation, or just a
            note — AI figures out whether it&apos;s a booking, an expense, an
            idea, or a note, and pre-fills it for you.
          </p>
          <textarea
            className="input h-48 font-mono text-xs"
            placeholder="Paste anything here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={organize}
              disabled={!text.trim() || !aiAvailable || loading}
              title={aiAvailable ? "" : "Enable AI in Settings"}
            >
              {loading ? "Organizing…" : "✨ Organize"}
            </button>
          </div>
          {!aiAvailable && (
            <p className="text-xs text-ink-400">
              Quick add needs AI — enable it in Settings with an Anthropic API
              key.
            </p>
          )}
        </div>
      ) : result.kind === "booking" && result.booking ? (
        <PreviewForm initial={result.booking} onBack={() => setResult(null)} onSave={saveBooking} />
      ) : result.kind === "expense" && result.expense ? (
        <ExpenseForm
          initial={result.expense}
          currency={trip.currency}
          onBack={() => setResult(null)}
          onSave={saveExpense}
        />
      ) : result.kind === "idea" && result.idea ? (
        <IdeaForm initial={result.idea} onBack={() => setResult(null)} onSave={saveIdea} />
      ) : (
        <NoteForm initial={result.note || text} onBack={() => setResult(null)} onSave={saveNote} />
      )}
    </Modal>
  );
}

function ExpenseForm({
  initial,
  currency,
  onBack,
  onSave,
}: {
  initial: { description: string; category: ExpenseCategory; amount: number; date?: string | null };
  currency: string;
  onBack: () => void;
  onSave: (e: { description: string; category: ExpenseCategory; amount: number; date: string }) => void;
}) {
  const [description, setDescription] = useState(initial.description || "");
  const [category, setCategory] = useState<ExpenseCategory>(initial.category || "other");
  const [amount, setAmount] = useState(String(initial.amount ?? ""));
  const [date, setDate] = useState((initial.date || todayStr()).slice(0, 10));

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Looks like an expense ({currency}).</p>
      <Field label="Description">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Amount" className="col-span-1">
          <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-between pt-2">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn-primary"
          onClick={() => onSave({ description, category, amount: Number(amount) || 0, date })}
          disabled={!description.trim() || !amount}
        >
          Save expense
        </button>
      </div>
    </div>
  );
}

function IdeaForm({
  initial,
  onBack,
  onSave,
}: {
  initial: { title: string; category: IdeaCategory; notes?: string | null; estCost?: number | null };
  onBack: () => void;
  onSave: (i: { title: string; category: IdeaCategory; notes: string; estCost?: number }) => void;
}) {
  const [title, setTitle] = useState(initial.title || "");
  const [category, setCategory] = useState<IdeaCategory>(initial.category || "other");
  const [notes, setNotes] = useState(initial.notes || "");
  const [estCost, setEstCost] = useState(initial.estCost != null ? String(initial.estCost) : "");

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Looks like an idea worth saving.</p>
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as IdeaCategory)}>
            {IDEA_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Est. cost (optional)">
          <input type="number" className="input" value={estCost} onChange={(e) => setEstCost(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-between pt-2">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn-primary"
          onClick={() => onSave({ title, category, notes, estCost: estCost ? Number(estCost) : undefined })}
          disabled={!title.trim()}
        >
          Save idea
        </button>
      </div>
    </div>
  );
}

function NoteForm({ initial, onBack, onSave }: { initial: string; onBack: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initial);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">This will be added to your trip notes.</p>
      <textarea className="input h-32" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-between pt-2">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={() => onSave(note)} disabled={!note.trim()}>
          Add to notes
        </button>
      </div>
    </div>
  );
}
