// Gmail integration for automatic booking/receipt import. Reuses the Firebase
// Google sign-in popup with the gmail.readonly scope added; the resulting
// OAuth access token is used to call the Gmail REST API directly from the
// browser (read-only — no email is ever modified). The token lives for about
// an hour and is cached in sessionStorage; reconnecting is one popup click.
//
// Requires the Gmail API to be enabled in the Google Cloud project that backs
// the Firebase app (console.cloud.google.com → APIs & Services → Gmail API).
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "./firebase";
import { Trip } from "./types";

const TOKEN_KEY = "travel-os-gmail-token";
const TOKEN_TTL_MS = 50 * 60 * 1000; // Google access tokens last ~60 min
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_EMAILS = 25;

export interface TripEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

function cachedToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw);
    return typeof token === "string" && Date.now() < exp ? token : null;
  } catch {
    return null;
  }
}

export function gmailConnected(): boolean {
  return cachedToken() !== null;
}

// Opens the Google popup requesting read-only Gmail access and returns an
// OAuth access token. Also signs the user into the app if they weren't.
export async function connectGmail(): Promise<string> {
  if (!auth) throw new Error("Cloud features aren't configured for this deployment.");
  const existing = cachedToken();
  if (existing) return existing;

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
  const result = await signInWithPopup(auth, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error("Google didn't grant Gmail access. Please try again.");
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + TOKEN_TTL_MS }));
  } catch {
    // sessionStorage unavailable — token just won't be cached
  }
  return token;
}

export function disconnectGmail(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function gmailFetch(token: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    disconnectGmail();
    throw new Error("Gmail access expired. Click Connect to re-authorize.");
  }
  if (res.status === 403) {
    throw new Error(
      "Gmail API is not enabled for this app. Enable the Gmail API in the Google Cloud console for the Firebase project, then try again."
    );
  }
  if (!res.ok) throw new Error(`Gmail request failed (${res.status}).`);
  return res.json();
}

// YYYY-MM-DD → Gmail's YYYY/MM/DD query date format.
function gmailDate(iso: string): string {
  return iso.replaceAll("-", "/");
}

// Search window: bookings are usually made in the months before the trip,
// receipts during it. Without trip dates, just look at the recent past.
function searchQuery(trip: Trip): string {
  const keywords =
    '(booking OR reservation OR confirmation OR itinerary OR "e-ticket" OR eticket OR receipt OR invoice OR "check-in" OR "schedule change")';
  let window = "newer_than:90d";
  if (trip.startDate) {
    const start = new Date(trip.startDate + "T00:00:00");
    start.setMonth(start.getMonth() - 9);
    const after = start.toISOString().slice(0, 10);
    const endBase = trip.endDate || trip.startDate;
    const end = new Date(endBase + "T00:00:00");
    end.setDate(end.getDate() + 7);
    const before = end.toISOString().slice(0, 10);
    window = `after:${gmailDate(after)} before:${gmailDate(before)}`;
  }
  return `${keywords} ${window} -in:spam -in:trash -category:promotions -category:social`;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function decodeBase64Url(data: string): string {
  try {
    const b64 = data.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script, head").forEach((el) => el.remove());
  return (doc.body?.textContent || "").replace(/\s{3,}/g, "\n").trim();
}

// Prefer the plain-text part; fall back to stripped HTML.
function extractBody(part: GmailPart): { text: string; html: string } {
  let text = "";
  let html = "";
  const walk = (p: GmailPart) => {
    if (p.body?.data) {
      if (p.mimeType === "text/plain" && !text) text = decodeBase64Url(p.body.data);
      if (p.mimeType === "text/html" && !html) html = decodeBase64Url(p.body.data);
    }
    p.parts?.forEach(walk);
  };
  walk(part);
  return { text, html };
}

// Searches the user's inbox for travel-related emails in the trip's window
// and returns their decoded text bodies, ready for AI classification.
export async function fetchTripEmails(
  token: string,
  trip: Trip,
  onProgress?: (done: number, total: number) => void
): Promise<TripEmail[]> {
  const q = encodeURIComponent(searchQuery(trip));
  const list = await gmailFetch(token, `/messages?q=${q}&maxResults=${MAX_EMAILS}`);
  const ids = ((list.messages as Array<{ id: string }> | undefined) || []).map((m) => m.id);
  const emails: TripEmail[] = [];
  for (let i = 0; i < ids.length; i++) {
    const msg = await gmailFetch(token, `/messages/${ids[i]}?format=full`);
    const payload = msg.payload as (GmailPart & { headers?: Array<{ name: string; value: string }> }) | undefined;
    if (!payload) continue;
    const header = (name: string) =>
      payload.headers?.find((h) => h.name.toLowerCase() === name)?.value || "";
    const { text, html } = extractBody(payload);
    const body = (text || stripHtml(html)).slice(0, 6000);
    if (body.trim()) {
      emails.push({
        id: ids[i],
        subject: header("subject"),
        from: header("from"),
        date: header("date"),
        body,
      });
    }
    onProgress?.(i + 1, ids.length);
  }
  return emails;
}
