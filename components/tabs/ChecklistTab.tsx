"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { CHECKLIST_TEMPLATES } from "@/lib/templates";
import { ChecklistGroup, ChecklistItem, Trip } from "@/lib/types";
import { uid } from "@/lib/utils";
import { Field, ProgressBar } from "@/components/ui";

const GROUPS: Array<{ key: ChecklistGroup; label: string; emoji: string }> = [
  { key: "documents", label: "Documents & money", emoji: "🛂" },
  { key: "todo", label: "To-dos", emoji: "✅" },
  { key: "packing", label: "Packing", emoji: "🎒" },
];

export function ChecklistTab({ trip }: { trip: Trip }) {
  const { data, update } = useStore();
  const items = data.checklist.filter((c) => c.tripId === trip.id);
  const done = items.filter((c) => c.done).length;

  const [text, setText] = useState("");
  const [group, setGroup] = useState<ChecklistGroup>("todo");

  const add = () => {
    if (!text.trim()) return;
    const item: ChecklistItem = {
      id: uid(),
      tripId: trip.id,
      text: text.trim(),
      group,
      done: false,
      createdAt: new Date().toISOString(),
    };
    update((d) => ({ ...d, checklist: [...d.checklist, item] }));
    setText("");
  };

  const toggle = (id: string) =>
    update((d) => ({
      ...d,
      checklist: d.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    }));

  const remove = (id: string) =>
    update((d) => ({ ...d, checklist: d.checklist.filter((c) => c.id !== id) }));

  const applyTemplate = (key: string) => {
    const tpl = CHECKLIST_TEMPLATES[key];
    if (!tpl) return;
    const existing = new Set(items.map((i) => i.text.toLowerCase()));
    const fresh = tpl.items
      .filter((t) => !existing.has(t.toLowerCase()))
      .map((t) => ({
        id: uid(),
        tripId: trip.id,
        text: t,
        group: tpl.group,
        done: false,
        createdAt: new Date().toISOString(),
      }));
    if (fresh.length > 0) {
      update((d) => ({ ...d, checklist: [...d.checklist, ...fresh] }));
    }
  };

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="card p-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium">Trip readiness</span>
            <span className="text-ink-500">
              {done}/{items.length}
            </span>
          </div>
          <ProgressBar value={done} max={items.length} />
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-2 p-4">
        <Field label="New item" className="min-w-48 flex-1">
          <input
            className="input"
            placeholder="Buy JR Pass before departure"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </Field>
        <Field label="List" className="w-40">
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value as ChecklistGroup)}>
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn-primary" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-ink-500">
        <span className="py-1">Templates:</span>
        {Object.entries(CHECKLIST_TEMPLATES).map(([key, tpl]) => (
          <button key={key} className="btn-secondary text-xs" onClick={() => applyTemplate(key)}>
            + {tpl.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {GROUPS.map(({ key, label, emoji }) => {
          const list = items.filter((i) => i.group === key);
          return (
            <div key={key} className="card p-4">
              <h3 className="mb-2 text-sm font-semibold">
                {emoji} {label}
                <span className="ml-1 font-normal text-ink-400">
                  {list.filter((i) => i.done).length}/{list.length}
                </span>
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-ink-300">Empty</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((i) => (
                    <li key={i.id} className="group flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={i.done}
                        onChange={() => toggle(i.id)}
                      />
                      <span className={`flex-1 ${i.done ? "text-ink-400 line-through" : ""}`}>
                        {i.text}
                      </span>
                      <button
                        className="btn-ghost px-1 text-xs text-red-400 opacity-0 group-hover:opacity-100"
                        onClick={() => remove(i.id)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
