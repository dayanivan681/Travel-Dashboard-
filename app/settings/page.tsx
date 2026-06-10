"use client";

import { useRef, useState } from "react";
import { aiRequest } from "@/lib/ai";
import { useStore } from "@/lib/store";
import { CURRENCIES } from "@/lib/utils";
import { Field } from "@/components/ui";

export default function SettingsPage() {
  const { data, hydrated, update, exportJson, importJson, resetAll } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  if (!hydrated) return null;

  const { settings } = data;
  const setSettings = (patch: Partial<typeof settings>) =>
    update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const testKey = async () => {
    setTestState("testing");
    setTestMessage("");
    try {
      const res = await aiRequest<{ ok: boolean; model: string }>("test", settings.apiKey);
      setTestState("ok");
      setTestMessage(`Connected — using ${res.model}`);
    } catch (e) {
      setTestState("fail");
      setTestMessage(e instanceof Error ? e.message : "Connection failed");
    }
  };

  const doExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `travel-os-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    const text = await file.text();
    const result = importJson(text);
    setImportMessage(result.ok ? "Imported successfully." : result.error || "Import failed.");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Preferences</h2>
        <Field label="Home currency">
          <select
            className="input w-40"
            value={settings.homeCurrency}
            onChange={(e) => setSettings({ homeCurrency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">✨ AI features (optional)</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.aiEnabled}
              onChange={(e) => setSettings({ aiEnabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <p className="text-sm text-ink-500">
          With an Anthropic API key, Travel OS can parse messy confirmation
          emails, draft day-by-day itineraries from your saved ideas, and
          analyze finished trips for lessons. Your key is stored only in this
          browser and sent directly to the Claude API per request.
        </p>
        <Field label="Anthropic API key">
          <input
            type="password"
            className="input"
            placeholder="sk-ant-…"
            value={settings.apiKey}
            onChange={(e) => {
              setSettings({ apiKey: e.target.value });
              setTestState("idle");
            }}
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            className="btn-secondary"
            onClick={testKey}
            disabled={!settings.apiKey || testState === "testing"}
          >
            {testState === "testing" ? "Testing…" : "Test connection"}
          </button>
          {testMessage && (
            <span className={`text-sm ${testState === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {testMessage}
            </span>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-ink-500">
          Everything lives in this browser. Export a backup anytime; import it
          on another device to move your trips over.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={doExport}>
            ⬇️ Export backup
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            ⬆️ Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = "";
            }}
          />
          {confirmReset ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-red-600">Erase everything?</span>
              <button
                className="btn-danger text-xs"
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                }}
              >
                Yes, erase
              </button>
              <button className="btn-ghost text-xs" onClick={() => setConfirmReset(false)}>
                No
              </button>
            </span>
          ) : (
            <button className="btn-danger" onClick={() => setConfirmReset(true)}>
              Reset all data
            </button>
          )}
        </div>
        {importMessage && <p className="text-sm text-ink-600">{importMessage}</p>}
      </section>
    </div>
  );
}
