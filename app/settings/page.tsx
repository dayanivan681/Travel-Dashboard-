"use client";

import { useEffect, useRef, useState } from "react";
import { aiRequest } from "@/lib/ai";
import { useAuth } from "@/lib/authContext";
import { getSnapshotData, listSnapshots, SnapshotMeta } from "@/lib/backup";
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
    update((d) => ({ ...d, settings: { ...d.settings, lastBackupAt: new Date().toISOString() } }));
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

      <CloudSyncSection />

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">🧳 Traveler profile</h2>
        <p className="text-sm text-ink-500">
          Used to personalize AI itinerary suggestions and destination
          briefings — pace, interests, dietary needs, and travel style.
        </p>
        <Field label="Pace">
          <select
            className="input w-40"
            value={settings.profile.pace}
            onChange={(e) =>
              setSettings({ profile: { ...settings.profile, pace: e.target.value as typeof settings.profile.pace } })
            }
          >
            <option value="relaxed">Relaxed</option>
            <option value="balanced">Balanced</option>
            <option value="packed">Packed</option>
          </select>
        </Field>
        <Field label="Interests (comma-separated)">
          <input
            className="input"
            placeholder="food, art, hiking, nightlife"
            value={settings.profile.interests.join(", ")}
            onChange={(e) =>
              setSettings({
                profile: {
                  ...settings.profile,
                  interests: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </Field>
        <Field label="Dietary needs">
          <input
            className="input"
            placeholder="vegetarian, no shellfish…"
            value={settings.profile.dietary}
            onChange={(e) => setSettings({ profile: { ...settings.profile, dietary: e.target.value } })}
          />
        </Field>
        <Field label="Travel style">
          <input
            className="input"
            placeholder="boutique hotels, avoid tourist traps, love local markets…"
            value={settings.profile.travelStyle}
            onChange={(e) => setSettings({ profile: { ...settings.profile, travelStyle: e.target.value } })}
          />
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
        <p className="text-xs text-ink-400">
          {settings.lastBackupAt
            ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleString()}`
            : "No backup taken yet — export one to keep your trips safe."}
        </p>
      </section>

      <SnapshotsSection />
    </div>
  );
}

// Cloud sync status. Sign-in itself happens via the account menu in the
// header — this section just explains what it does and shows current state.
function CloudSyncSection() {
  const { user, authReady, firebaseEnabled } = useAuth();
  const { data, hydrated } = useStore();

  if (!firebaseEnabled) return null;

  const synced = hydrated ? data.trips.filter((t) => t.memberEmails).length : 0;

  return (
    <section className="card space-y-2 p-5">
      <h2 className="font-semibold">☁️ Cloud sync &amp; sharing</h2>
      {!authReady ? null : user ? (
        <>
          <p className="text-sm text-ink-500">
            Signed in as <span className="font-medium text-ink-700">{user.email}</span>. Your
            trips sync automatically across devices — {synced} of {data.trips.length} trip
            {data.trips.length === 1 ? "" : "s"} synced so far.
          </p>
          <p className="text-sm text-ink-500">
            Open any trip and use <span className="font-medium">👥 Share</span> to invite up to
            5 travelers by email — they&apos;ll see and edit the same trip once they sign in.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-500">
          Sign in (top right) to back up your trips to the cloud, sync them across devices, and
          share a trip with up to 5 travelers.
        </p>
      )}
    </section>
  );
}

// Automatic recovery snapshots, written to IndexedDB as you work. Restoring
// replaces the current data with the snapshot's contents.
function SnapshotsSection() {
  const { importJson } = useStore();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = () => listSnapshots().then(setSnapshots);
  useEffect(() => {
    refresh();
  }, []);

  const restore = async (takenAt: string) => {
    const data = await getSnapshotData(takenAt);
    setConfirming(null);
    if (!data) {
      setMessage("Couldn't read that snapshot.");
      return;
    }
    const result = importJson(JSON.stringify(data));
    setMessage(
      result.ok
        ? `Restored snapshot from ${new Date(takenAt).toLocaleString()}.`
        : result.error || "Restore failed."
    );
  };

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">🛟 Automatic snapshots</h2>
      <p className="text-sm text-ink-500">
        Travel OS quietly saves recovery snapshots in this browser as you
        work. If something goes wrong — a bad import, an accidental delete —
        restore from here. (Clearing all browser data removes these too;
        the export above is the off-device backup.)
      </p>
      {snapshots.length === 0 ? (
        <p className="text-sm text-ink-400">
          No snapshots yet — they appear automatically once you have trip data.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {snapshots.slice(0, 8).map((s) => (
            <li key={s.takenAt} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium">{new Date(s.takenAt).toLocaleString()}</div>
                <div className="text-xs text-ink-400">
                  {s.trips} trip{s.trips === 1 ? "" : "s"} · {s.bookings} booking
                  {s.bookings === 1 ? "" : "s"} · {s.expenses} expense{s.expenses === 1 ? "" : "s"}
                </div>
              </div>
              {confirming === s.takenAt ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Replace current data?</span>
                  <button className="btn-danger text-xs" onClick={() => restore(s.takenAt)}>
                    Yes, restore
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => setConfirming(null)}>
                    No
                  </button>
                </span>
              ) : (
                <button className="btn-secondary text-xs" onClick={() => setConfirming(s.takenAt)}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && <p className="text-sm text-ink-600">{message}</p>}
    </section>
  );
}
