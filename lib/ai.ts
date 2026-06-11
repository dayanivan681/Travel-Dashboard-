import Anthropic from "@anthropic-ai/sdk";

// Optional AI layer. The user supplies their own Anthropic API key (stored in
// this browser only); calls go directly from the browser to the Claude API —
// there is no server in between, which lets the whole app deploy as a static
// site. Callers should check settings.aiEnabled && settings.apiKey first.

const MODEL = "claude-opus-4-8";

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

function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function textOf(response: Anthropic.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

function friendlyError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error("Invalid API key. Check it in Settings.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("Rate limited — try again in a minute.");
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`Claude API error: ${err.message}`);
  }
  if (err instanceof Error) return err;
  return new Error("AI request failed unexpectedly.");
}

export async function aiRequest<T = unknown>(
  action: string,
  apiKey: string,
  payload?: Record<string, unknown>
): Promise<T> {
  if (!apiKey) {
    throw new Error("No API key configured. Add one in Settings to use AI features.");
  }
  const client = makeClient(apiKey);

  try {
    switch (action) {
      case "test": {
        const model = await client.models.retrieve(MODEL);
        return { ok: true, model: model.display_name } as T;
      }

      case "parse-booking": {
        const rawText = String(payload?.rawText || "");
        if (!rawText.trim()) throw new Error("Nothing to parse");
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
        return { booking: JSON.parse(textOf(response)) } as T;
      }

      case "suggest-itinerary": {
        const trip = payload?.trip;
        if (!trip) throw new Error("Missing trip");
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
        return { plan: JSON.parse(textOf(response)) } as T;
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
        return { insights: textOf(response) } as T;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    throw friendlyError(err);
  }
}
