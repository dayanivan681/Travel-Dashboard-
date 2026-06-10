"use client";

import { useState } from "react";
import { defaultItineraryDate } from "@/lib/automation";
import { useStore } from "@/lib/store";
import { Idea, IdeaCategory, IdeaStatus, Trip } from "@/lib/types";
import { fmtMoney, uid } from "@/lib/utils";
import { Badge, EmptyState, Field } from "@/components/ui";

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

      <div className="flex flex-wrap gap-1">
        {(["all", "new", "shortlisted", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            className={`btn text-xs ${filter === s ? "bg-ink-900 text-white" : "bg-white border border-ink-200 text-ink-600 hover:bg-ink-100"}`}
            onClick={() => setFilter(s)}
          >
            {s === "all" ? `All (${ideas.length})` : `${s} (${ideas.filter((i) => i.status === s).length})`}
          </button>
        ))}
      </div>

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
    </div>
  );
}
