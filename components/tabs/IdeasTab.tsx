"use client";

import { useState } from "react";
import { aiRequest } from "@/lib/ai";
import { defaultItineraryDate } from "@/lib/automation";
import { useStore } from "@/lib/store";
import { Idea, IdeaCategory, IdeaStatus, Trip } from "@/lib/types";
import { fmtMoney, uid } from "@/lib/utils";
import { Badge, EmptyState, Field, Modal } from "@/components/ui";

interface GeneratedIdea {
  title: string;
  category: IdeaCategory;
  notes: string | null;
  estCost: number | null;
}

const CATEGORIES: IdeaCategory[] = ["place", "activity", "food", "stay", "transport", "other"];
const CATEGORY_EMOJI: Record<IdeaCategory, string> = {
  place: "📍",
  activity: "🎟️",
  food: "🍜",
  stay: "🏨",
  transport: "🚆",
  other: "💭",
};

const STATUS_TONE: Record<IdeaStatus, "gray" | "blue" | "green" | "red"> = {
  new: "gray",
  shortlisted: "blue",
  approved: "green",
  rejected: "red",
};

export function IdeasTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const ideas = data.ideas.filter((i) => i.tripId === trip.id);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<IdeaCategory>("place");
  const [url, setUrl] = useState("");
  const [estCost, setEstCost] = useState("");
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");

  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [suggestions, setSuggestions] = useState<GeneratedIdea[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const aiAvailable = data.settings.aiEnabled && data.settings.apiKey;

  const generate = async () => {
    setGenerating(true);
    setAiError("");
    try {
      const res = await aiRequest<{ ideas: GeneratedIdea[] }>(
        "generate-ideas",
        data.settings.apiKey,
        {
          trip: {
            name: trip.name,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            travelers: trip.travelers,
            budget: trip.budget,
            currency: trip.currency,
            notes: trip.notes,
          },
          profile: data.settings.profile,
          existingIdeas: ideas.map((i) => i.title),
          planned: [
            ...data.bookings
              .filter((b) => b.tripId === trip.id && b.status !== "cancelled")
              .map((b) => b.title),
            ...data.itinerary.filter((i) => i.tripId === trip.id).map((i) => i.title),
          ],
        }
      );
      setSuggestions(res.ideas);
      setPicked(new Set(res.ideas.map((_, i) => i)));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Couldn't generate ideas");
    } finally {
      setGenerating(false);
    }
  };

  const addPicked = () => {
    if (!suggestions) return;
    const fresh: Idea[] = suggestions
      .filter((_, i) => picked.has(i))
      .map((s) => ({
        id: uid(),
        tripId: trip.id,
        title: s.title,
        category: s.category,
        notes: s.notes || undefined,
        estCost: s.estCost ?? undefined,
        status: "new" as IdeaStatus,
        createdAt: new Date().toISOString(),
      }));
    if (fresh.length > 0) update((d) => ({ ...d, ideas: [...fresh, ...d.ideas] }));
    setSuggestions(null);
  };

  const add = () => {
    if (!title.trim()) return;
    const idea: Idea = {
      id: uid(),
      tripId: trip.id,
      title: title.trim(),
      category,
      url: url.trim() || undefined,
      estCost: estCost ? Number(estCost) : undefined,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    update((d) => ({ ...d, ideas: [idea, ...d.ideas] }));
    setTitle("");
    setUrl("");
    setEstCost("");
  };

  const setStatus = (id: string, status: IdeaStatus) =>
    update((d) => ({
      ...d,
      ideas: d.ideas.map((i) => (i.id === id ? { ...i, status } : i)),
    }));

  const remove = (id: string) =>
    update((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }));

  const toItinerary = (idea: Idea) => {
    update((d) => ({
      ...d,
      ideas: d.ideas.map((i) => (i.id === idea.id ? { ...i, status: "approved" as IdeaStatus } : i)),
      itinerary: [
        ...d.itinerary,
        {
          id: uid(),
          tripId: trip.id,
          date: defaultItineraryDate(trip),
          title: idea.title,
          type: idea.category === "food" ? ("restaurant" as const) : ("activity" as const),
          location: undefined,
          notes: idea.notes,
          done: false,
        },
      ],
    }));
  };

  const visible = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <Field label="New idea" className="min-w-48 flex-1">
          <input
            className="input"
            placeholder="TeamLab Planets, ramen at Ichiran, day trip to Nara…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </Field>
        <Field label="Category" className="w-28">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as IdeaCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Link" className="w-40">
          <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Est. cost" className="w-24">
          <input type="number" className="input" placeholder="—" value={estCost} onChange={(e) => setEstCost(e.target.value)} />
        </Field>
        <button className="btn-primary" onClick={add} disabled={!title.trim()}>
          Add
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {(["all", "new", "shortlisted", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            className={`btn text-xs ${filter === s ? "bg-ink-900 text-white" : "bg-white border border-ink-200 text-ink-600 hover:bg-ink-100"}`}
            onClick={() => setFilter(s)}
          >
            {s === "all" ? `All (${ideas.length})` : `${s} (${ideas.filter((i) => i.status === s).length})`}
          </button>
        ))}
        {aiAvailable && (
          <button className="btn-secondary ml-auto text-xs" onClick={generate} disabled={generating}>
            {generating ? "Thinking…" : "✨ Suggest ideas for this trip"}
          </button>
        )}
      </div>
      {aiError && <p className="text-sm text-red-600">{aiError}</p>}

      {visible.length === 0 ? (
        <EmptyState
          emoji="💡"
          title={ideas.length === 0 ? "Collect ideas as you find them" : "Nothing matches this filter"}
          hint={
            ideas.length === 0
              ? "Drop in places, restaurants, and activities from articles, friends, or social media. Shortlist the best, approve the winners, push them to the itinerary."
              : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((idea) => (
            <li key={idea.id} className="card flex flex-wrap items-center gap-2 p-3">
              <span className="text-lg">{CATEGORY_EMOJI[idea.category]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{idea.title}</span>
                  <Badge tone={STATUS_TONE[idea.status]}>{idea.status}</Badge>
                  {idea.estCost !== undefined && (
                    <span className="text-xs text-ink-400">~{fmtMoney(idea.estCost, trip.currency)}</span>
                  )}
                </div>
                {idea.url && (
                  <a href={idea.url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline">
                    {idea.url.replace(/^https?:\/\//, "").slice(0, 60)}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1">
                {idea.status !== "shortlisted" && idea.status !== "approved" && (
                  <button className="btn-ghost text-xs" onClick={() => setStatus(idea.id, "shortlisted")}>
                    ⭐ Shortlist
                  </button>
                )}
                {idea.status !== "approved" && (
                  <button className="btn-ghost text-xs" onClick={() => setStatus(idea.id, "approved")}>
                    ✓ Approve
                  </button>
                )}
                {idea.status !== "rejected" && (
                  <button className="btn-ghost text-xs" onClick={() => setStatus(idea.id, "rejected")}>
                    ✕ Pass
                  </button>
                )}
                {idea.status === "approved" && (
                  <button className="btn-secondary text-xs" onClick={() => toItinerary(idea)}>
                    → Itinerary
                  </button>
                )}
                <button className="btn-ghost text-xs text-red-500" onClick={() => remove(idea.id)}>
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {suggestions && (
        <Modal title="✨ Ideas for this trip" onClose={() => setSuggestions(null)} wide>
          <p className="mb-3 text-sm text-ink-500">
            Based on {trip.destination}, your dates, budget, and traveler profile.
            Uncheck anything that doesn&apos;t appeal.
          </p>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-ink-200 p-2.5">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.has(i)}
                  onChange={() => {
                    const next = new Set(picked);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    setPicked(next);
                  }}
                />
                <span className="text-lg">{CATEGORY_EMOJI[s.category] || "💭"}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.title}</span>
                    {s.estCost !== null && (
                      <span className="text-xs text-ink-400">~{fmtMoney(s.estCost, trip.currency)}</span>
                    )}
                  </div>
                  {s.notes && <p className="text-xs text-ink-500">{s.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSuggestions(null)}>
              Discard
            </button>
            <button className="btn-primary" onClick={addPicked} disabled={picked.size === 0}>
              Add {picked.size} idea{picked.size === 1 ? "" : "s"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
