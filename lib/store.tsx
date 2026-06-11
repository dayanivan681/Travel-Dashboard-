"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./authContext";
import { autoSnapshot } from "./backup";
import {
  mergeBundleIntoData,
  pushTripBundle,
  subscribeToMyTrips,
  tripBundle,
} from "./cloudSync";
import { db } from "./firebase";
import { AppData, EMPTY_DATA, EMPTY_PROFILE } from "./types";

const STORAGE_KEY = "travel-os-data-v1";
// How long to wait after the last edit before pushing changed trips to the
// cloud — collapses bursts of keystrokes/toggles into one write.
const CLOUD_PUSH_DEBOUNCE_MS = 1500;

type Updater = (d: AppData) => AppData;

interface StoreValue {
  data: AppData;
  hydrated: boolean;
  update: (fn: Updater) => void;
  exportJson: () => string;
  importJson: (json: string) => { ok: boolean; error?: string };
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function migrate(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") return EMPTY_DATA;
  const d = raw as Partial<AppData>;
  return {
    ...EMPTY_DATA,
    ...d,
    version: 1,
    trips: d.trips ?? [],
    ideas: d.ideas ?? [],
    decisions: d.decisions ?? [],
    bookings: d.bookings ?? [],
    itinerary: d.itinerary ?? [],
    expenses: d.expenses ?? [],
    checklist: d.checklist ?? [],
    settings: {
      ...EMPTY_DATA.settings,
      ...(d.settings ?? {}),
      profile: { ...EMPTY_PROFILE, ...(d.settings?.profile ?? {}) },
    },
  };
}

// Removes every trace of a trip (used when a shared trip is unshared or
// deleted by its owner on another device).
function removeTrip(d: AppData, tripId: string): AppData {
  return {
    ...d,
    trips: d.trips.filter((t) => t.id !== tripId),
    ideas: d.ideas.filter((x) => x.tripId !== tripId),
    decisions: d.decisions.filter((x) => x.tripId !== tripId),
    bookings: d.bookings.filter((x) => x.tripId !== tripId),
    itinerary: d.itinerary.filter((x) => x.tripId !== tripId),
    expenses: d.expenses.filter((x) => x.tripId !== tripId),
    checklist: d.checklist.filter((x) => x.tripId !== tripId),
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const { user } = useAuth();

  // Trip ids whose latest change came from a remote snapshot — skip the next
  // outgoing push for them so we don't bounce the write straight back.
  const skipPushRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(migrate(JSON.parse(raw)));
    } catch {
      // corrupted storage — start fresh rather than crash
    }
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full / unavailable — keep running in memory
    }
    // Automatic recovery snapshot to IndexedDB, debounced so bursts of edits
    // collapse into one write.
    const t = setTimeout(() => void autoSnapshot(data), 3000);
    return () => clearTimeout(t);
  }, [data]);

  // Pull: subscribe to every trip the signed-in user can access, merging
  // remote changes (from this device or any shared traveler) into local data.
  useEffect(() => {
    if (!db || !user?.email) return;
    const email = user.email.toLowerCase();
    const unsub = subscribeToMyTrips(
      email,
      (bundle) => {
        skipPushRef.current.add(bundle.trip.id);
        setData((d) => mergeBundleIntoData(d, bundle));
      },
      (tripId) => {
        setData((d) => removeTrip(d, tripId));
      }
    );
    return unsub;
  }, [user]);

  // Claim: any local trip not yet shared to the cloud becomes owned by the
  // signed-in user, making it eligible for sync and sharing.
  useEffect(() => {
    if (!db || !user?.email || !hydratedRef.current) return;
    const email = user.email.toLowerCase();
    const hasUnclaimed = data.trips.some((t) => !t.memberEmails);
    if (!hasUnclaimed) return;
    setData((d) => ({
      ...d,
      trips: d.trips.map((t) =>
        t.memberEmails ? t : { ...t, ownerId: user.uid, memberEmails: [email] }
      ),
    }));
  }, [data.trips, user]);

  // Push: debounced — write any trip the user can edit back to Firestore
  // after local changes settle, unless the change just came from the cloud.
  useEffect(() => {
    if (!db || !user?.email || !hydratedRef.current) return;
    const email = user.email.toLowerCase();
    const t = setTimeout(() => {
      for (const trip of dataRef.current.trips) {
        if (!trip.memberEmails?.includes(email)) continue;
        if (skipPushRef.current.has(trip.id)) {
          skipPushRef.current.delete(trip.id);
          continue;
        }
        const bundle = tripBundle(dataRef.current, trip.id);
        if (bundle) void pushTripBundle(bundle);
      }
    }, CLOUD_PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, user]);

  const update = useCallback((fn: Updater) => {
    setData((d) => fn(d));
  }, []);

  const exportJson = useCallback(() => JSON.stringify(data, null, 2), [data]);

  const importJson = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.trips)) {
        return { ok: false, error: "That file doesn't look like a Travel OS export." };
      }
      setData(migrate(parsed));
      return { ok: true };
    } catch {
      return { ok: false, error: "Invalid JSON file." };
    }
  }, []);

  const resetAll = useCallback(() => setData(EMPTY_DATA), []);

  return (
    <StoreContext.Provider
      value={{ data, hydrated, update, exportJson, importJson, resetAll }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
