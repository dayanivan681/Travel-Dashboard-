"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppData, EMPTY_DATA, EMPTY_PROFILE } from "./types";

const STORAGE_KEY = "travel-os-data-v1";

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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

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
  }, [data]);

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
