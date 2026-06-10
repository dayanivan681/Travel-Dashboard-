import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Optional AI layer. The user supplies their own Anthropic API key (stored in
// their browser, sent per request); this route proxies to the Claude API so
// the key never needs CORS exceptions and prompts stay in one place.

const MODEL = "claude-opus-4-8";

export const maxDuration = 120;

const BOOKING_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["flight", "hotel", "car", "train", "activity", "restaurant", "other"],
    },
    title: { type: "string", description: "Short human-friendly label, e.g. 'Flight PA 482 · SFO → NRT'" },
    provider: { type: ["string", "null"], description: "Company name (airline, hotel chain, etc.)" },
    confirmationCode: { type: ["string", "null"] },
    start: {
      type: ["string", "null"],
      description: "Start date/time as YYYY-MM-DD or YYYY-MM-DDTHH:MM (local time, no timezone)",
    },
    end: { type: ["string", "null"], description: "End date/time, same format as start" },
    location: { type: ["string", "null"], description: "Route, address, or venue" },
    cost: { type: ["number", "null"], description: "Total price as a plain number" },
    notes: { type: ["string", "null"], description: "Anything important not captured above (seat, room type, cancellation policy)" },
  },
  required: ["type", "title", "provider", "confirmationCode", "start", "end", "location", "cost", "notes"],
  additionalProperties: false,
} as const;

const ITINERARY_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                startTime: { type: ["string", "null"], description: "HH:MM 24h, or null for flexible" },
                title: { type: "string" },
                type: {
                  type: "string",
                  enum: ["flight", "hotel", "car", "train", "activity", "restaurant", "other", "note"],
                },
                location: { type: ["string", "null"] },
                notes: { type: ["string", "null"], description: "One-line tip: why it's worth it, booking advice, timing" },
              },
              required: ["startTime", "title", "type", "location", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["date", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["days"],
  additionalProperties: false,
} as const;

function textOf(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

export async function POST(req: NextRequest) {
  let body: { action?: string; apiKey?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action, apiKey, payload } = body;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured. Add one in Settings to use AI features." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    switch (action) {
      case "test": {
        const model = await client.models.retrieve(MODEL);
        return NextResponse.json({ ok: true, model: model.display_name });
      }

      case "parse-booking": {
        const rawText = String(payload?.rawText || "");
        if (!rawText.trim()) {
          return NextResponse.json({ error: "Nothing to parse" }, { status: 400 });
        }
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You extract structured booking data from travel confirmation emails and pasted text. Be precise: only fill fields explicitly supported by the text, use null for anything absent or ambiguous. Dates must be local times exactly as written, formatted YYYY-MM-DD or YYYY-MM-DDTHH:MM. Cost is the grand total actually paid or due.",
          output_config: { format: { type: "json_schema", schema: BOOKING_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Extract the booking from this confirmation:\n\n${rawText.slice(0, 20000)}`,
            },
          ],
        });
        return NextResponse.json({ booking: JSON.parse(textOf(response)) });
      }

      case "suggest-itinerary": {
        const trip = payload?.trip as Record<string, unknown> | undefined;
        if (!trip) return NextResponse.json({ error: "Missing trip" }, { status: 400 });
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          system:
            "You are a practical travel planner. Build realistic day-by-day itineraries: respect existing fixed commitments (flights, check-ins, reservations), group activities by neighborhood to minimize transit, pace 2-4 substantial things per day with meal slots, and weave in the traveler's own shortlisted ideas before inventing new ones. Every suggestion gets a one-line note explaining why or how. Only plan dates within the trip range that were requested.",
          output_config: { format: { type: "json_schema", schema: ITINERARY_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Plan an itinerary for this trip.\n\nTrip: ${JSON.stringify(trip)}\n\nShortlisted/approved ideas (use these first): ${JSON.stringify(payload?.ideas ?? [])}\n\nExisting fixed bookings (do not duplicate, plan around them): ${JSON.stringify(payload?.bookings ?? [])}\n\nDates already planned (only fill the empty days): ${JSON.stringify(payload?.plannedDates ?? [])}\n\nExtra instructions from the traveler: ${String(payload?.instructions || "none")}`,
            },
          ],
        });
        return NextResponse.json({ plan: JSON.parse(textOf(response)) });
      }

      case "trip-insights": {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You review trip data (budget vs. actuals, bookings, pace, retro notes) and produce short, concrete takeaways the traveler can apply to their next trip. Be specific and numeric where the data allows. Plain text, one takeaway per line prefixed with '- '. Maximum 8 lines.",
          messages: [
            {
              role: "user",
              content: `Here is my trip data. What should I learn from it for next time?\n\n${JSON.stringify(payload ?? {})}`,
            },
          ],
        });
        return NextResponse.json({ insights: textOf(response) });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Invalid API key. Check it in Settings." }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited — try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Claude API error: ${err.message}` }, { status: err.status ?? 500 });
    }
    return NextResponse.json({ error: "AI request failed unexpectedly." }, { status: 500 });
  }
}
