"use client";

import { useState } from "react";
import { aiRequest } from "@/lib/ai";
import { parseBookingText } from "@/lib/parser";
import { useStore } from "@/lib/store";
import { SAMPLE_CONFIRMATION } from "@/lib/templates";
import { BookingType, ParsedBooking } from "@/lib/types";
import { Field, Modal } from "./ui";

const TYPES: BookingType[] = ["flight", "hotel", "car", "train", "activity", "restaurant", "other"];

// Paste any confirmation email / booking text → structured booking.
// Rule-based parsing always works offline; AI parsing (if configured) handles
// the messy cases. The user always reviews before saving.
export function SmartImport({
  onParsed,
  onClose,
}: {
  onParsed: (b: ParsedBooking, rawText: string) => void;
  onClose: () => void;
}) {
  const { data } = useStore();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedBooking | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");

  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  const runRules = () => {
    setError("");
    setPreview(parseBookingText(text));
  };

  const runAi = async () => {
    setError("");
    setAiLoading(true);
    try {
      const res = await aiRequest<{ booking: Record<string, unknown> }>(
        "parse-booking",
        data.settings.apiKey,
        { rawText: text }
      );
      const b = res.booking;
      // Drop nulls so the preview form shows clean empty fields.
      const clean: ParsedBooking = {
        type: (b.type as BookingType) || "other",
        title: (b.title as string) || "Imported booking",
      };
      for (const k of ["provider", "confirmationCode", "start", "end", "location", "notes"] as const) {
        if (b[k]) clean[k] = String(b[k]);
      }
      if (typeof b.cost === "number") clean.cost = b.cost;
      setPreview(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI parsing failed");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal title="Import a booking" onClose={onClose} wide>
      {!preview ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">
            Paste a confirmation email or any booking text. Travel OS extracts
            the details — you review before saving.
          </p>
          <textarea
            className="input h-48 font-mono text-xs"
            placeholder="Paste your confirmation email here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="btn-ghost text-xs" onClick={() => setText(SAMPLE_CONFIRMATION)}>
              Try a sample email
            </button>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={runRules} disabled={!text.trim()}>
                Quick parse
              </button>
              <button
                className="btn-primary"
                onClick={runAi}
                disabled={!text.trim() || !aiAvailable || aiLoading}
                title={aiAvailable ? "" : "Enable AI in Settings"}
              >
                {aiLoading ? "Parsing…" : "✨ Parse with AI"}
              </button>
            </div>
          </div>
          {!aiAvailable && (
            <p className="text-xs text-ink-400">
              Tip: enable AI in Settings for much better extraction on messy emails.
            </p>
          )}
        </div>
      ) : (
        <PreviewForm
          initial={preview}
          onBack={() => setPreview(null)}
          onSave={(b) => onParsed(b, text)}
        />
      )}
    </Modal>
  );
}

export function PreviewForm({
  initial,
  onBack,
  onSave,
}: {
  initial: ParsedBooking;
  onBack?: () => void;
  onSave: (b: ParsedBooking) => void;
}) {
  const [b, setB] = useState<ParsedBooking>(initial);
  const set = (patch: Partial<ParsedBooking>) => setB((x) => ({ ...x, ...patch }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className="input" value={b.type} onChange={(e) => set({ type: e.target.value as BookingType })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Provider">
          <input className="input" value={b.provider || ""} onChange={(e) => set({ provider: e.target.value })} />
        </Field>
      </div>
      <Field label="Title">
        <input className="input" value={b.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start (date or date+time)">
          <input
            className="input"
            placeholder="2026-03-14T11:35"
            value={b.start || ""}
            onChange={(e) => set({ start: e.target.value })}
          />
        </Field>
        <Field label="End">
          <input
            className="input"
            placeholder="2026-03-18"
            value={b.end || ""}
            onChange={(e) => set({ end: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Confirmation #">
          <input className="input" value={b.confirmationCode || ""} onChange={(e) => set({ confirmationCode: e.target.value })} />
        </Field>
        <Field label="Location / route">
          <input className="input" value={b.location || ""} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Cost">
          <input
            type="number"
            className="input"
            value={b.cost ?? ""}
            onChange={(e) => set({ cost: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Field>
      </div>
      <Field label="Notes">
        <input className="input" value={b.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <div className="flex justify-between pt-2">
        {onBack ? (
          <button className="btn-secondary" onClick={onBack}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button className="btn-primary" onClick={() => onSave(b)} disabled={!b.title.trim()}>
          Save booking
        </button>
      </div>
    </div>
  );
}
