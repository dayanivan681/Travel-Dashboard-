"use client";

import { useState } from "react";
import { aiRequest } from "@/lib/ai";
import { syncBookingToItinerary } from "@/lib/automation";
import { useStore } from "@/lib/store";
import { Booking, BookingStatus, ParsedBooking, Trip } from "@/lib/types";
import { fmtDateTime, fmtMoney, todayStr, uid } from "@/lib/utils";
import { EmailSync } from "@/components/EmailSync";
import { PreviewForm, SmartImport } from "@/components/SmartImport";
import { Badge, BOOKING_TYPE_EMOJI, EmptyState, Modal } from "@/components/ui";

const STATUS_TONE: Record<BookingStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  confirmed: "green",
  cancelled: "red",
};

interface ReviewFinding {
  severity: "urgent" | "warn" | "info";
  text: string;
  bookingTitle: string | null;
}

const FINDING_STYLE: Record<ReviewFinding["severity"], string> = {
  urgent: "border-red-200 bg-red-50 text-red-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function BookingsTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const bookings = data.bookings
    .filter((b) => b.tripId === trip.id)
    .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));

  const [importing, setImporting] = useState(false);
  const [scanningInbox, setScanningInbox] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [findings, setFindings] = useState<ReviewFinding[] | null>(null);
  const [reviewError, setReviewError] = useState("");
  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  const review = async () => {
    setReviewing(true);
    setReviewError("");
    try {
      const res = await aiRequest<{ findings: ReviewFinding[] }>(
        "review-bookings",
        data.settings.apiKey,
        {
          today: todayStr(),
          trip: {
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            travelers: trip.travelers,
            budget: trip.budget,
            currency: trip.currency,
          },
          bookings: bookings.map((b) => ({
            type: b.type,
            title: b.title,
            provider: b.provider,
            confirmationCode: b.confirmationCode,
            start: b.start,
            end: b.end,
            location: b.location,
            cost: b.cost,
            status: b.status,
            paid: b.paid,
          })),
        }
      );
      setFindings(res.findings);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  };

  const saveBooking = (parsed: ParsedBooking, rawText?: string) => {
    const booking: Booking = {
      id: uid(),
      tripId: trip.id,
      type: parsed.type,
      title: parsed.title,
      provider: parsed.provider,
      confirmationCode: parsed.confirmationCode,
      start: parsed.start,
      end: parsed.end,
      location: parsed.location,
      cost: parsed.cost,
      status: "confirmed",
      paid: false,
      notes: parsed.notes,
      rawText,
      createdAt: new Date().toISOString(),
    };
    update((d) => ({
      ...d,
      bookings: [...d.bookings, booking],
      itinerary: syncBookingToItinerary(d.itinerary, booking),
    }));
    setImporting(false);
    setAddingManual(false);
  };

  const patchBooking = (id: string, patch: Partial<Booking>) =>
    update((d) => {
      const bookings = d.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b));
      const updated = bookings.find((b) => b.id === id)!;
      return { ...d, bookings, itinerary: syncBookingToItinerary(d.itinerary, updated) };
    });

  const removeBooking = (id: string) =>
    update((d) => ({
      ...d,
      bookings: d.bookings.filter((b) => b.id !== id),
      itinerary: d.itinerary.filter((i) => i.bookingId !== id),
    }));

  const total = bookings
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + (b.cost || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-ink-500">
          {bookings.filter((b) => b.status !== "cancelled").length} bookings ·{" "}
          <span className="font-medium text-ink-800">{fmtMoney(total, trip.currency)}</span> committed
        </div>
        <div className="flex gap-2">
          {aiAvailable && bookings.length > 0 && (
            <button className="btn-secondary" onClick={review} disabled={reviewing}>
              {reviewing ? "Auditing…" : "✨ AI review"}
            </button>
          )}
          <button className="btn-secondary" onClick={() => setAddingManual(true)}>
            + Add manually
          </button>
          <button className="btn-secondary" onClick={() => setImporting(true)}>
            📥 Paste email
          </button>
          <button className="btn-primary" onClick={() => setScanningInbox(true)}>
            📬 Scan inbox
          </button>
        </div>
      </div>

      {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
      {findings && (
        <div className="card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">✨ Booking audit</h3>
            <button className="btn-ghost px-2 text-xs" onClick={() => setFindings(null)}>
              ✕
            </button>
          </div>
          {findings.length === 0 ? (
            <p className="text-sm text-emerald-700">
              ✓ Everything checks out — no gaps, conflicts, or missing details found.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {findings.map((f, i) => (
                <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${FINDING_STYLE[f.severity]}`}>
                  {f.bookingTitle && <span className="font-medium">{f.bookingTitle}: </span>}
                  {f.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {bookings.length === 0 ? (
        <EmptyState
          emoji="🎫"
          title="No bookings yet"
          hint="Paste any confirmation email and Travel OS extracts the flight, hotel, or reservation details automatically — and adds it to your itinerary."
        >
          <button className="btn-primary" onClick={() => setImporting(true)}>
            Import your first booking
          </button>
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className={`card p-3 ${b.status === "cancelled" ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl">{BOOKING_TYPE_EMOJI[b.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.title}</span>
                    <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
                    {b.paid ? <Badge tone="green">paid</Badge> : b.cost ? <Badge tone="gray">unpaid</Badge> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-500">
                    {b.start && <span>🗓 {fmtDateTime(b.start)}{b.end ? ` → ${fmtDateTime(b.end)}` : ""}</span>}
                    {b.location && <span>📍 {b.location}</span>}
                    {b.confirmationCode && <span className="font-mono">#{b.confirmationCode}</span>}
                    {b.provider && <span>{b.provider}</span>}
                  </div>
                </div>
                <div className="text-right">
                  {b.cost !== undefined && (
                    <div className="font-semibold">{fmtMoney(b.cost, trip.currency)}</div>
                  )}
                  <div className="mt-1 flex justify-end gap-1">
                    {b.status === "pending" && (
                      <button className="btn-ghost text-xs" onClick={() => patchBooking(b.id, { status: "confirmed" })}>
                        ✓ Confirm
                      </button>
                    )}
                    {b.cost !== undefined && !b.paid && b.status !== "cancelled" && (
                      <button className="btn-ghost text-xs" onClick={() => patchBooking(b.id, { paid: true })}>
                        💳 Mark paid
                      </button>
                    )}
                    {b.status !== "cancelled" ? (
                      <button className="btn-ghost text-xs" onClick={() => patchBooking(b.id, { status: "cancelled" })}>
                        Cancel
                      </button>
                    ) : (
                      <button className="btn-ghost text-xs text-red-500" onClick={() => removeBooking(b.id)}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {importing && (
        <SmartImport onClose={() => setImporting(false)} onParsed={saveBooking} />
      )}
      {scanningInbox && <EmailSync trip={trip} onClose={() => setScanningInbox(false)} />}
      {addingManual && (
        <Modal title="Add booking" onClose={() => setAddingManual(false)} wide>
          <PreviewForm
            initial={{ type: "hotel", title: "" }}
            onSave={(b) => saveBooking(b)}
          />
        </Modal>
      )}
    </div>
  );
}
