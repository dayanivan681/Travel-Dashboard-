"use client";

import { useState } from "react";
import { aiRequest } from "@/lib/ai";
import { syncBookingToItinerary } from "@/lib/automation";
import { firebaseEnabled } from "@/lib/firebase";
import { connectGmail, fetchTripEmails, gmailConnected, TripEmail } from "@/lib/gmail";
import { useStore } from "@/lib/store";
import {
  Booking,
  BookingType,
  CapturedExpense,
  Expense,
  ParsedBooking,
  Trip,
} from "@/lib/types";
import { fmtDateTime, fmtMoney, todayStr, uid } from "@/lib/utils";
import { Badge, BOOKING_TYPE_EMOJI, Modal } from "@/components/ui";

interface ScanItem {
  email: TripEmail;
  kind: "booking" | "expense";
  booking?: ParsedBooking;
  expense?: CapturedExpense;
  duplicate: boolean;
  checked: boolean;
}

type Step = "connect" | "scanning" | "review" | "done";

// Scans the connected Gmail inbox for trip-related bookings, receipts, and
// schedule changes; the user reviews everything found before importing.
export function EmailSync({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { data, update } = useStore();
  const [step, setStep] = useState<Step>("connect");
  const [progress, setProgress] = useState("");
  const [items, setItems] = useState<ScanItem[]>([]);
  const [error, setError] = useState("");
  const [imported, setImported] = useState({ bookings: 0, expenses: 0 });

  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;
  const existingCodes = data.bookings
    .filter((b) => b.tripId === trip.id && b.confirmationCode)
    .map((b) => b.confirmationCode!.toUpperCase());

  const scan = async () => {
    setError("");
    setStep("scanning");
    try {
      setProgress("Connecting to Google…");
      const token = await connectGmail();
      setProgress("Searching your inbox…");
      const emails = await fetchTripEmails(token, trip, (done, total) =>
        setProgress(`Reading emails… ${done}/${total}`)
      );
      if (emails.length === 0) {
        setItems([]);
        setStep("review");
        return;
      }
      setProgress(`Analyzing ${emails.length} emails with AI…`);
      const res = await aiRequest<{
        results: Array<{
          emailIndex: number;
          kind: "booking" | "expense" | "skip";
          booking: Record<string, unknown> | null;
          expense: CapturedExpense | null;
        }>;
      }>("scan-emails", data.settings.apiKey, {
        emails,
        trip: {
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          travelers: trip.travelers,
          currency: trip.currency,
        },
        existingCodes,
      });
      const found: ScanItem[] = [];
      for (const r of res.results) {
        const email = emails[r.emailIndex];
        if (!email || r.kind === "skip") continue;
        if (r.kind === "booking" && r.booking) {
          const b = r.booking;
          const booking: ParsedBooking = {
            type: (b.type as BookingType) || "other",
            title: (b.title as string) || email.subject || "Imported booking",
          };
          for (const k of ["provider", "confirmationCode", "start", "end", "location", "notes"] as const) {
            if (b[k]) booking[k] = String(b[k]);
          }
          if (typeof b.cost === "number") booking.cost = b.cost;
          const duplicate = Boolean(
            booking.confirmationCode && existingCodes.includes(booking.confirmationCode.toUpperCase())
          );
          found.push({ email, kind: "booking", booking, duplicate, checked: !duplicate });
        } else if (r.kind === "expense" && r.expense) {
          found.push({ email, kind: "expense", expense: r.expense, duplicate: false, checked: true });
        }
      }
      setItems(found);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email scan failed");
      setStep("connect");
    }
  };

  const importChecked = () => {
    const selected = items.filter((i) => i.checked);
    let bookings = 0;
    let expenses = 0;
    update((d) => {
      let next = d;
      for (const item of selected) {
        if (item.kind === "booking" && item.booking) {
          const booking: Booking = {
            id: uid(),
            tripId: trip.id,
            type: item.booking.type,
            title: item.booking.title,
            provider: item.booking.provider,
            confirmationCode: item.booking.confirmationCode,
            start: item.booking.start,
            end: item.booking.end,
            location: item.booking.location,
            cost: item.booking.cost,
            status: "confirmed",
            paid: false,
            notes: item.booking.notes,
            rawText: item.email.body,
            createdAt: new Date().toISOString(),
          };
          next = {
            ...next,
            bookings: [...next.bookings, booking],
            itinerary: syncBookingToItinerary(next.itinerary, booking),
          };
          bookings++;
        } else if (item.kind === "expense" && item.expense) {
          const expense: Expense = {
            id: uid(),
            tripId: trip.id,
            date: item.expense.date || todayStr(),
            description: item.expense.description,
            category: item.expense.category,
            amount: item.expense.amount,
            currency: item.expense.currency || undefined,
          };
          next = { ...next, expenses: [...next.expenses, expense] };
          expenses++;
        }
      }
      return next;
    });
    setImported({ bookings, expenses });
    setStep("done");
  };

  const toggle = (idx: number) =>
    setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, checked: !x.checked } : x)));

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <Modal title="📬 Scan inbox" onClose={onClose} wide>
      {step === "connect" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">
            Travel OS searches your Gmail for bookings, flights, hotels, tickets,
            receipts, and schedule changes related to <strong>{trip.destination}</strong>,
            then extracts them with AI. Read-only — nothing in your inbox is changed,
            and you review everything before it's imported.
          </p>
          {!firebaseEnabled && (
            <p className="text-sm text-amber-700">
              Cloud features aren't configured for this deployment, so Gmail can't be connected.
            </p>
          )}
          {!aiAvailable && (
            <p className="text-sm text-amber-700">
              Inbox scanning needs AI extraction — enable AI and add your API key in Settings first.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => void scan()}
              disabled={!firebaseEnabled || !aiAvailable}
            >
              {gmailConnected() ? "Scan inbox" : "Connect Google & scan"}
            </button>
          </div>
        </div>
      )}

      {step === "scanning" && (
        <div className="space-y-3 py-8 text-center">
          <div className="text-3xl">📬</div>
          <p className="text-sm text-ink-500">{progress}</p>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">
              No new trip-related bookings or receipts found in your recent email.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-500">
                Found {items.length} item{items.length === 1 ? "" : "s"}. Uncheck anything
                you don't want, then import.
              </p>
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {items.map((item, i) => (
                  <li key={i} className={`card flex items-start gap-3 p-3 ${item.duplicate ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={item.checked}
                      onChange={() => toggle(i)}
                    />
                    <div className="min-w-0 flex-1">
                      {item.kind === "booking" && item.booking ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{BOOKING_TYPE_EMOJI[item.booking.type]}</span>
                            <span className="font-medium">{item.booking.title}</span>
                            <Badge tone="blue">booking</Badge>
                            {item.duplicate && <Badge tone="amber">already imported</Badge>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-500">
                            {item.booking.start && <span>🗓 {fmtDateTime(item.booking.start)}</span>}
                            {item.booking.location && <span>📍 {item.booking.location}</span>}
                            {item.booking.confirmationCode && (
                              <span className="font-mono">#{item.booking.confirmationCode}</span>
                            )}
                            {item.booking.cost !== undefined && (
                              <span>{fmtMoney(item.booking.cost, trip.currency)}</span>
                            )}
                          </div>
                        </>
                      ) : item.expense ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>🧾</span>
                            <span className="font-medium">{item.expense.description}</span>
                            <Badge tone="green">expense</Badge>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-500">
                            <span>{item.expense.category}</span>
                            <span>{fmtMoney(item.expense.amount, item.expense.currency || trip.currency)}</span>
                            {item.expense.date && <span>🗓 {item.expense.date}</span>}
                          </div>
                        </>
                      ) : null}
                      <div className="mt-1 truncate text-xs text-ink-400">
                        ✉️ {item.email.subject}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose}>
              {items.length === 0 ? "Close" : "Cancel"}
            </button>
            {items.length > 0 && (
              <button className="btn-primary" onClick={importChecked} disabled={checkedCount === 0}>
                Import {checkedCount} item{checkedCount === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-3 py-6 text-center">
          <div className="text-3xl">✅</div>
          <p className="text-sm text-ink-700">
            Imported {imported.bookings} booking{imported.bookings === 1 ? "" : "s"} and{" "}
            {imported.expenses} expense{imported.expenses === 1 ? "" : "s"}.
            {imported.bookings > 0 && " Bookings were also added to your itinerary."}
          </p>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
