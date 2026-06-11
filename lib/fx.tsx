"use client";

import { useEffect, useState } from "react";
import { Expense } from "./types";

// Live exchange rates (USD-based cross rates) from the free open.er-api.com
// endpoint, cached in localStorage for 24h. Everything degrades gracefully:
// with no rates (offline, blocked), foreign amounts are treated 1:1 and the
// UI simply shows the original currency.

const FX_KEY = "travel-os-fx-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type FxRates = Record<string, number> | null;

interface CachedRates {
  fetchedAt: number;
  rates: Record<string, number>;
}

let inFlight: Promise<FxRates> | null = null;

async function loadRates(): Promise<FxRates> {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CachedRates;
      if (Date.now() - cached.fetchedAt < MAX_AGE_MS && cached.rates?.USD) {
        return cached.rates;
      }
    }
  } catch {
    // bad cache — refetch
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json?.result === "success" && json.rates) {
      const cached: CachedRates = { fetchedAt: Date.now(), rates: json.rates };
      try {
        localStorage.setItem(FX_KEY, JSON.stringify(cached));
      } catch {
        // storage full — keep in memory only
      }
      return json.rates;
    }
  } catch {
    // offline or blocked — fall through
  }
  return null;
}

export function useFxRates(): FxRates {
  const [rates, setRates] = useState<FxRates>(null);
  useEffect(() => {
    let alive = true;
    inFlight = inFlight || loadRates();
    inFlight.then((r) => alive && setRates(r));
    return () => {
      alive = false;
    };
  }, []);
  return rates;
}

export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: FxRates
): number {
  if (!from || from === to) return amount;
  if (!rates || !rates[from] || !rates[to]) return amount;
  return amount * (rates[to] / rates[from]);
}

// Sum expenses in the trip's currency. Expenses without an explicit currency
// are assumed to already be in the trip currency.
export function sumExpenses(
  expenses: Expense[],
  tripCurrency: string,
  rates: FxRates
): number {
  return expenses.reduce(
    (s, e) => s + convertAmount(e.amount, e.currency || tripCurrency, tripCurrency, rates),
    0
  );
}
