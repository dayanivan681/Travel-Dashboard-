import Anthropic from "@anthropic-ai/sdk";

// Optional AI layer. The user supplies their own Anthropic API key (stored in
// this browser only); calls go directly from the browser to the Claude API —
// there is no server in between, which lets the whole app deploy as a static
// site. Callers should check settings.aiEnabled && settings.apiKey first.

const MODEL = "claude-sonnet-4-6";

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

const CAPTURE_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["booking", "expense", "idea", "note"],
      description:
        "'booking' for a confirmed reservation (flight, hotel, car, train, activity, restaurant) with details like dates or a confirmation code; 'expense' for a receipt or payment already made; 'idea' for a place, activity, or recommendation worth considering; 'note' for anything else worth remembering.",
    },
    booking: {
      type: ["object", "null"],
      properties: {
        type: {
          type: "string",
          enum: ["flight", "hotel", "car", "train", "activity", "restaurant", "other"],
        },
        title: { type: "string" },
        provider: { type: ["string", "null"] },
        confirmationCode: { type: ["string", "null"] },
        start: { type: ["string", "null"], description: "YYYY-MM-DD or YYYY-MM-DDTHH:MM" },
        end: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        cost: { type: ["number", "null"] },
        notes: { type: ["string", "null"] },
      },
      required: ["type", "title", "provider", "confirmationCode", "start", "end", "location", "cost", "notes"],
      additionalProperties: false,
    },
    expense: {
      type: ["object", "null"],
      properties: {
        description: { type: "string" },
        category: {
          type: "string",
          enum: ["lodging", "transport", "food", "activities", "shopping", "other"],
        },
        amount: { type: "number", description: "Total amount actually paid" },
        date: { type: ["string", "null"], description: "YYYY-MM-DD" },
        currency: {
          type: ["string", "null"],
          description: "ISO 4217 code (USD, EUR, JPY…) if identifiable from the text, else null",
        },
      },
      required: ["description", "category", "amount", "date", "currency"],
      additionalProperties: false,
    },
    idea: {
      type: ["object", "null"],
      properties: {
        title: { type: "string" },
        category: {
          type: "string",
          enum: ["place", "activity", "food", "stay", "transport", "other"],
        },
        notes: { type: ["string", "null"] },
        estCost: { type: ["number", "null"] },
      },
      required: ["title", "category", "notes", "estCost"],
      additionalProperties: false,
    },
    note: { type: ["string", "null"] },
  },
  required: ["kind", "booking", "expense", "idea", "note"],
  additionalProperties: false,
} as const;

const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: {
            type: "string",
            enum: ["place", "activity", "food", "stay", "transport", "other"],
          },
          notes: {
            type: ["string", "null"],
            description: "One line: what it is and why it fits this specific trip and traveler",
          },
          estCost: {
            type: ["number", "null"],
            description: "Rough cost per person in the trip currency; null if free or unknown",
          },
        },
        required: ["title", "category", "notes", "estCost"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
} as const;

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    recommendedOptionId: { type: "string", description: "id of the winning option" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: {
      type: "string",
      description: "2-4 sentences: why this option wins for this trip, weighing cost, logistics, schedule fit, traveler preferences, and risk",
    },
    assessments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          optionId: { type: "string" },
          take: { type: "string", description: "One-line verdict on this option" },
        },
        required: ["optionId", "take"],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendedOptionId", "confidence", "summary", "assessments"],
  additionalProperties: false,
} as const;

const BOOKINGS_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["urgent", "warn", "info"] },
          text: { type: "string", description: "One concrete, specific finding" },
          bookingTitle: {
            type: ["string", "null"],
            description: "Exact title of the booking this concerns, or null if it spans the whole trip",
          },
        },
        required: ["severity", "text", "bookingTitle"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
} as const;

const ORGANIZE_SCHEMA = {
  type: "object",
  properties: {
    schedule: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "id of an existing movable itinerary item" },
          date: { type: "string", description: "YYYY-MM-DD within the trip" },
          startTime: { type: ["string", "null"], description: "HH:MM 24h, null for flexible" },
          tip: {
            type: ["string", "null"],
            description: "Short reason if the item moved, or timing advice (opening hours, crowds, transit)",
          },
        },
        required: ["itemId", "date", "startTime", "tip"],
        additionalProperties: false,
      },
    },
    advice: {
      type: "array",
      items: { type: "string" },
      description: "Up to 5 short logistics observations about the overall plan",
    },
  },
  required: ["schedule", "advice"],
  additionalProperties: false,
} as const;

const CHECKLIST_GEN_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "Short actionable item" },
          group: { type: "string", enum: ["packing", "documents", "todo"] },
        },
        required: ["text", "group"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const EMAIL_SCAN_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          emailIndex: { type: "number", description: "Index of the email in the input list" },
          kind: {
            type: "string",
            enum: ["booking", "expense", "skip"],
            description:
              "'booking' for a reservation confirmation or schedule change (flight, hotel, car, train, activity, restaurant); 'expense' for a receipt/invoice for a payment already made that is NOT itself a reservation; 'skip' for marketing, newsletters, unrelated mail, or duplicates of existing bookings.",
          },
          booking: {
            type: ["object", "null"],
            properties: {
              type: {
                type: "string",
                enum: ["flight", "hotel", "car", "train", "activity", "restaurant", "other"],
              },
              title: { type: "string" },
              provider: { type: ["string", "null"] },
              confirmationCode: { type: ["string", "null"] },
              start: { type: ["string", "null"], description: "YYYY-MM-DD or YYYY-MM-DDTHH:MM" },
              end: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              cost: { type: ["number", "null"] },
              notes: {
                type: ["string", "null"],
                description: "Key details; if this is a schedule change, start with 'Schedule change:'",
              },
            },
            required: ["type", "title", "provider", "confirmationCode", "start", "end", "location", "cost", "notes"],
            additionalProperties: false,
          },
          expense: {
            type: ["object", "null"],
            properties: {
              description: { type: "string" },
              category: {
                type: "string",
                enum: ["lodging", "transport", "food", "activities", "shopping", "other"],
              },
              amount: { type: "number" },
              date: { type: ["string", "null"], description: "YYYY-MM-DD" },
              currency: { type: ["string", "null"], description: "ISO 4217 code if identifiable" },
            },
            required: ["description", "category", "amount", "date", "currency"],
            additionalProperties: false,
          },
        },
        required: ["emailIndex", "kind", "booking", "expense"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
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

      case "scan-emails": {
        const emails = payload?.emails as Array<{ subject: string; from: string; date: string; body: string }> | undefined;
        if (!emails?.length) throw new Error("No emails to scan");
        const trip = payload?.trip as Record<string, unknown> | undefined;
        const emailList = emails
          .map(
            (e, i) =>
              `--- EMAIL ${i} ---\nFrom: ${e.from}\nDate: ${e.date}\nSubject: ${e.subject}\n\n${e.body.slice(0, 4000)}`
          )
          .join("\n\n");
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          system:
            "You scan a traveler's emails for items relevant to one specific trip. For each email decide: 'booking' if it confirms or changes a reservation (flight, hotel, car, train, activity, restaurant) relevant to this trip; 'expense' if it's a receipt or invoice for a trip-related payment that isn't itself a reservation; 'skip' for marketing, newsletters, mail unrelated to this trip's destination/dates, or emails whose confirmation code matches an already-imported booking. Only extract fields explicitly supported by the email text — use null for anything absent. Dates are local time, formatted YYYY-MM-DD or YYYY-MM-DDTHH:MM. Cost/amount is the grand total. Return one result per email, in order.",
          output_config: { format: { type: "json_schema", schema: EMAIL_SCAN_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Trip: ${JSON.stringify(trip ?? {})}\n\nConfirmation codes already imported (mark matching emails as 'skip'): ${JSON.stringify(payload?.existingCodes ?? [])}\n\nEmails to scan:\n\n${emailList}`,
            },
          ],
        });
        return JSON.parse(textOf(response)) as T;
      }

      case "suggest-itinerary": {
        const trip = payload?.trip;
        if (!trip) throw new Error("Missing trip");
        const profile = payload?.profile as Record<string, unknown> | undefined;
        const profileLine = profile
          ? `Traveler profile — pace: ${profile.pace || "balanced"}; interests: ${
              Array.isArray(profile.interests) && profile.interests.length
                ? (profile.interests as string[]).join(", ")
                : "none specified"
            }; dietary needs: ${profile.dietary || "none"}; travel style: ${profile.travelStyle || "none specified"}.`
          : "";
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          system:
            "You are a practical travel planner. Build realistic day-by-day itineraries: respect existing fixed commitments (flights, check-ins, reservations), group activities by neighborhood to minimize transit, pace 2-4 substantial things per day with meal slots, and weave in the traveler's own shortlisted ideas before inventing new ones. Tailor suggestions to the traveler's stated profile (pace, interests, dietary needs, travel style) when given. Every suggestion gets a one-line note explaining why or how. Only plan dates within the trip range that were requested.",
          output_config: { format: { type: "json_schema", schema: ITINERARY_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Plan an itinerary for this trip.\n\nTrip: ${JSON.stringify(trip)}\n\n${profileLine}\n\nShortlisted/approved ideas (use these first): ${JSON.stringify(payload?.ideas ?? [])}\n\nExisting fixed bookings (do not duplicate, plan around them): ${JSON.stringify(payload?.bookings ?? [])}\n\nDates already planned (only fill the empty days): ${JSON.stringify(payload?.plannedDates ?? [])}\n\nExtra instructions from the traveler: ${String(payload?.instructions || "none")}`,
            },
          ],
        });
        return { plan: JSON.parse(textOf(response)) } as T;
      }

      case "capture": {
        const rawText = String(payload?.rawText || "");
        const image = payload?.image as { mediaType: string; data: string } | undefined;
        if (!rawText.trim() && !image) throw new Error("Nothing to organize");
        const content: Anthropic.ContentBlockParam[] = [];
        if (image) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: image.data,
            },
          });
        }
        content.push({
          type: "text",
          text: rawText.trim()
            ? `Organize this:\n\n${rawText.slice(0, 20000)}`
            : "Organize what's in this image (likely a receipt, confirmation, or screenshot of a recommendation).",
        });
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You organize raw travel-related content — confirmation emails, receipts (text or photographed), screenshots, recommendations, or quick notes — for a trip planner. Classify it as exactly one kind and fill only that field; leave the others null. Dates are local time, formatted YYYY-MM-DD or YYYY-MM-DDTHH:MM. Costs are plain numbers; report the currency as an ISO code when identifiable.",
          output_config: { format: { type: "json_schema", schema: CAPTURE_SCHEMA } },
          messages: [{ role: "user", content }],
        });
        return { result: JSON.parse(textOf(response)) } as T;
      }

      case "dashboard-digest": {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          thinking: { type: "adaptive" },
          system:
            "You are a calm, sharp travel assistant writing a morning-briefing style digest of the traveler's trips. Given trip summaries and open reminders, write 3-6 short lines: what's coming up next (with countdowns), what genuinely needs action this week, and budget standouts. Be specific and concrete, never generic. Plain text, one item per line prefixed with '- '. No preamble.",
          messages: [
            {
              role: "user",
              content: `Today is ${String(payload?.today)}. Here are my trips and open reminders:\n\n${JSON.stringify(payload?.trips ?? [])}\n\nReminders: ${JSON.stringify(payload?.reminders ?? [])}`,
            },
          ],
        });
        return { content: textOf(response) } as T;
      }

      case "destination-briefing": {
        const trip = payload?.trip as Record<string, unknown> | undefined;
        if (!trip) throw new Error("Missing trip");
        const profile = payload?.profile as Record<string, unknown> | undefined;
        const profileLine = profile
          ? `Traveler profile — interests: ${
              Array.isArray(profile.interests) && profile.interests.length
                ? (profile.interests as string[]).join(", ")
                : "none specified"
            }; dietary needs: ${profile.dietary || "none"}; travel style: ${profile.travelStyle || "none specified"}.`
          : "";
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 2048,
          thinking: { type: "adaptive" },
          system:
            "You write short, sharp destination briefings for travelers. Cover only what's genuinely useful and specific to this destination: local currency & typical costs, tipping norms, power plug type & voltage, key cultural etiquette or customs, safety notes, typical weather for the travel dates, and getting around. Tailor a couple of points to the traveler's profile if given. Plain text, organized as short labeled sections (e.g. 'Money:', 'Customs:'), each 1-2 sentences. No headers, no markdown, no preamble.",
          messages: [
            {
              role: "user",
              content: `Destination: ${trip.destination}\nDates: ${trip.startDate || "unspecified"} to ${trip.endDate || "unspecified"}\nTravelers: ${trip.travelers}\n${profileLine}`,
            },
          ],
        });
        return { content: textOf(response) } as T;
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

      case "generate-ideas": {
        const trip = payload?.trip;
        if (!trip) throw new Error("Missing trip");
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You are a sharp local-savvy travel curator. Suggest 6-10 specific, real ideas (named places, restaurants, activities, day trips) for this trip. Ground every suggestion in the trip's destination, dates/season, budget, group size, and the traveler's profile. Skip anything already on their lists or booked. Prefer a mix of categories and at least a couple of non-obvious picks a guidebook's first page wouldn't lead with. Costs are rough per-person figures in the trip currency.",
          output_config: { format: { type: "json_schema", schema: IDEAS_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Trip: ${JSON.stringify(trip)}\n\nTraveler profile: ${JSON.stringify(payload?.profile ?? {})}\n\nAlready on their idea list (do not repeat): ${JSON.stringify(payload?.existingIdeas ?? [])}\n\nAlready booked or planned (do not repeat): ${JSON.stringify(payload?.planned ?? [])}`,
            },
          ],
        });
        return JSON.parse(textOf(response)) as T;
      }

      case "recommend-decision": {
        const decision = payload?.decision;
        if (!decision) throw new Error("Missing decision");
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You help a traveler pick between competing options for their trip. Weigh real trade-offs: total cost against the trip budget, logistics and schedule fit with existing bookings, the stated pros/cons and ratings, the traveler's preferences, and risk (refundability, tight connections, weather exposure). Commit to one recommendation — no fence-sitting — and be honest about confidence. Reference option ids exactly as given.",
          output_config: { format: { type: "json_schema", schema: DECISION_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Decision to make: ${JSON.stringify(decision)}\n\nTrip context: ${JSON.stringify(payload?.trip ?? {})}\n\nExisting bookings (for schedule/logistics fit): ${JSON.stringify(payload?.bookings ?? [])}\n\nTraveler profile: ${JSON.stringify(payload?.profile ?? {})}`,
            },
          ],
        });
        return { advice: JSON.parse(textOf(response)) } as T;
      }

      case "review-bookings": {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You audit a trip's bookings like a meticulous travel agent. Find concrete problems and gaps: nights with no lodging between arrival and departure, arrival/departure days with no transport, missing details that matter (no confirmation code, no time, no cost), unpaid or still-pending reservations, date overlaps or impossible sequences, and bookings that don't fit the trip dates. Compare committed costs to the budget if one is set. Every finding must be specific and verifiable from the data — never invent problems, and return an empty list if everything genuinely checks out. Severity: 'urgent' = will break the trip, 'warn' = needs action soon, 'info' = worth knowing.",
          output_config: { format: { type: "json_schema", schema: BOOKINGS_REVIEW_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Today is ${String(payload?.today)}.\n\nTrip: ${JSON.stringify(payload?.trip ?? {})}\n\nBookings: ${JSON.stringify(payload?.bookings ?? [])}`,
            },
          ],
        });
        return JSON.parse(textOf(response)) as T;
      }

      case "organize-itinerary": {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 8192,
          thinking: { type: "adaptive" },
          system:
            "You optimize an existing day-by-day travel itinerary. Re-time and re-date only the movable items to minimize backtracking (group by neighborhood), respect typical opening hours and meal times, balance daily load to the traveler's pace, and fit cleanly around the fixed items (flights, check-ins, reservations) which you must NOT move or include in your schedule output. Keep every movable item — never drop one — and keep dates within the trip range. Only output a tip where there's a genuine reason (moved it, timing matters, book ahead).",
          output_config: { format: { type: "json_schema", schema: ORGANIZE_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Trip: ${JSON.stringify(payload?.trip ?? {})}\n\nTraveler profile: ${JSON.stringify(payload?.profile ?? {})}\n\nFixed items (do not move, plan around them): ${JSON.stringify(payload?.fixed ?? [])}\n\nMovable items (re-time/re-date these, keep all of them): ${JSON.stringify(payload?.movable ?? [])}`,
            },
          ],
        });
        return JSON.parse(textOf(response)) as T;
      }

      case "generate-checklist": {
        const trip = payload?.trip;
        if (!trip) throw new Error("Missing trip");
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system:
            "You build practical pre-trip checklists tailored to a specific trip — never generic filler. Derive items from the destination (entry documents, plug adapters, local payment norms), the dates and season (clothing, weather gear), the planned activities and bookings (gear, tickets to pre-book, check-in tasks), the group size, and the traveler's profile (dietary, medical, style). 12-25 items across the three groups: 'packing' for things to bring, 'documents' for paperwork and money, 'todo' for tasks to complete before departure. Skip anything already on their checklist. Each item short and actionable.",
          output_config: { format: { type: "json_schema", schema: CHECKLIST_GEN_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `Trip: ${JSON.stringify(trip)}\n\nTraveler profile: ${JSON.stringify(payload?.profile ?? {})}\n\nPlanned activities and bookings: ${JSON.stringify(payload?.planned ?? [])}\n\nAlready on the checklist (do not repeat): ${JSON.stringify(payload?.existing ?? [])}`,
            },
          ],
        });
        return JSON.parse(textOf(response)) as T;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    throw friendlyError(err);
  }
}
