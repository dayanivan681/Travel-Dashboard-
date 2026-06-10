import { BookingType, ParsedBooking } from "./types";

// Rule-based extraction of booking details from pasted confirmation emails /
// text. Works fully offline; the optional AI parser (see /api/ai) handles the
// messy cases. Heuristics are deliberately conservative: a field is only
// filled when there's a confident match, and the raw text is always kept on
// the booking for reference.

const TYPE_KEYWORDS: Array<{ type: BookingType; words: RegExp }> = [
  {
    type: "flight",
    words:
      /\b(flight|airline|airways|air lines|departure|boarding|gate|terminal|nonstop|layover|e-?ticket)\b/i,
  },
  {
    type: "hotel",
    words:
      /\b(hotel|hostel|resort|check-?in|check-?out|room type|nights?|guests?|airbnb|suite)\b/i,
  },
  {
    type: "car",
    words: /\b(car rental|rental car|pick-?up location|vehicle|hertz|avis|enterprise|sixt)\b/i,
  },
  {
    type: "train",
    words: /\b(train|rail|amtrak|eurostar|coach \d|seat \d+[a-z]?|platform)\b/i,
  },
  {
    type: "restaurant",
    words: /\b(reservation|table for|party of|dining|restaurant|opentable|resy)\b/i,
  },
  {
    type: "activity",
    words: /\b(tour|ticket|admission|tickets?|event|experience|museum|show|concert)\b/i,
  },
];

const MONTHS =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

// Matches "Mar 14, 2026", "14 March 2026", "2026-03-14", "03/14/2026",
// optionally followed by a time like "11:35 AM" or "14:30".
const DATE_RE = new RegExp(
  `\\b(?:(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}\\s+(?:${MONTHS})\\.?,?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4})(?:[,\\s]+(?:at\\s+)?\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm)?)?`,
  "g"
);

function normalizeDate(raw: string): string | undefined {
  const timeMatch = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  const datePart = raw.replace(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/, "").replace(/[,\s]+(at)?\s*$/i, "").trim();

  let d: Date | null = null;
  const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (iso) {
    d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else if (us) {
    d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
  } else {
    const t = Date.parse(datePart.replace(/(\d)(st|nd|rd|th)/, "$1"));
    if (!isNaN(t)) d = new Date(t);
  }
  if (!d || isNaN(d.getTime())) return undefined;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (!timeMatch) return `${y}-${m}-${day}`;

  let h = Number(timeMatch[1]);
  const min = timeMatch[2];
  const mer = timeMatch[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${y}-${m}-${day}T${String(h).padStart(2, "0")}:${min}`;
}

export function parseBookingText(text: string): ParsedBooking {
  const result: ParsedBooking = { type: "other", title: "" };

  // --- type ---
  let bestScore = 0;
  for (const { type, words } of TYPE_KEYWORDS) {
    const matches = text.match(new RegExp(words.source, "gi"));
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      bestScore = score;
      result.type = type;
    }
  }

  // --- confirmation code ---
  // The label match is case-insensitive but the code itself must be genuinely
  // uppercase/digits in the source text, or we'd capture ordinary words.
  const confRe =
    /(?:confirmation(?:\s+(?:code|number|no\.?))?|booking\s+(?:ref(?:erence)?|code|number|id)|record\s+locator|reservation\s+(?:code|number)|PNR|itinerary\s+(?:number|#)|order\s+(?:number|#)|ref)\s*[:#-]?\s*([A-Za-z0-9]{5,10})\b/gi;
  let confMatch: RegExpExecArray | null;
  while ((confMatch = confRe.exec(text))) {
    if (/^[A-Z0-9]+$/.test(confMatch[1]) && /\d|[A-Z]{5,}/.test(confMatch[1])) {
      result.confirmationCode = confMatch[1];
      break;
    }
  }

  // --- cost (take the largest money amount: usually the total) ---
  const moneyRe = /(?:USD|EUR|GBP|CAD|AUD|\$|€|£)\s?([\d,]+(?:\.\d{1,2})?)/g;
  let best: number | undefined;
  let m: RegExpExecArray | null;
  while ((m = moneyRe.exec(text))) {
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (!isNaN(v) && (best === undefined || v > best)) best = v;
  }
  if (best !== undefined) result.cost = best;

  // --- dates (first = start, second distinct = end) ---
  const dates: string[] = [];
  const dm = text.match(DATE_RE) || [];
  for (const raw of dm) {
    const norm = normalizeDate(raw);
    if (norm && !dates.some((d) => d.slice(0, 10) === norm.slice(0, 10) && d === norm)) {
      dates.push(norm);
    }
  }
  if (dates[0]) result.start = dates[0];
  if (dates[1]) result.end = dates[1];

  // --- flight specifics ---
  if (result.type === "flight") {
    const flightNo = text.match(/\b(?:flight|flt)\s*[:#]?\s*([A-Z]{2})\s?(\d{2,4})\b/i);
    const route = text.match(
      /\b(?:[Ff]rom[:\s]+)?([A-Z]{3})\b[\s\S]{0,30}?(?:\b[Tt]o\b|→|->|–)[:\s]*([A-Z]{3})\b/
    );
    if (route) result.location = `${route[1]} → ${route[2]}`;
    if (flightNo) {
      const fn = `${flightNo[1].toUpperCase()} ${flightNo[2]}`;
      result.title = result.location ? `Flight ${fn} · ${result.location}` : `Flight ${fn}`;
    }
  }

  // --- hotel specifics ---
  if (result.type === "hotel") {
    const hotelLine = text
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => /\b(hotel|resort|inn|hostel|suites?)\b/i.test(l) && l.length < 80);
    if (hotelLine) {
      result.title = hotelLine.replace(/^(your stay at|hotel:)\s*/i, "");
    }
  }

  // --- provider: scan for "with X", or a line that looks like a company ---
  const provider =
    text.match(/\b(?:booking with|thank you for (?:booking|flying) with|operated by)\s+([A-Z][\w&' .-]{2,40}?)(?:[.!\n]|$)/i)?.[1] ||
    text.match(/\b([A-Z][a-z]+ (?:Air(?:lines|ways)?|Hotels?|Rail|Rentals?))\b/)?.[1];
  if (provider) result.provider = provider.trim();

  // --- fallback title ---
  if (!result.title) {
    const subject = text.match(/^subject:\s*(.+)$/im)?.[1];
    if (subject) {
      result.title = subject
        .replace(/your |confirmation|booking|reservation for |- |ref:?\s*[A-Z0-9]+/gi, "")
        .replace(/^stay at\s+/i, "")
        .trim();
    }
    if (!result.title || result.title.length < 3) {
      const label = result.type === "other" ? "Booking" : result.type[0].toUpperCase() + result.type.slice(1);
      result.title = result.provider ? `${label} · ${result.provider}` : label;
    }
  }

  return result;
}
