# 🧭 Travel OS by Fable

Plan smarter trips. Travel OS keeps every trip's **ideas, decisions, bookings, budget, schedule, and checklists** in one place — and works before, during, and after the trip.

## Features

**Plan**
- **Trips** move through their lifecycle automatically: Dreaming → Planning → Booked → In progress → Completed (computed from dates and bookings — nothing to update by hand).
- **Ideas** — collect places, food, activities and stays from anywhere; shortlist → approve → push to the itinerary.
- **Decisions** — compare competing options (hotels, routes, flights) side by side with cost, rating, and pros/cons; pick a winner and convert it to a booking.
- **Bookings** — paste any confirmation email into **Smart Import** and the details (type, dates, confirmation code, cost, route) are extracted automatically. Every booking lands on the itinerary on the right day, including hotel check-out entries.
- **Budget** — trip budget vs. committed (bookings) vs. spent (expenses), with category breakdowns.
- **Itinerary** — day-by-day schedule built from bookings plus your own plans.
- **Checklists** — documents, packing, to-dos, with one-click starter templates.

**During the trip**
- The Overview tab becomes a **Today panel**: today's schedule with check-offs and one-tap expense capture, plus a daily burn rate on the Budget tab.

**Automation**
- Reminders are computed live from your data: flight check-in windows, unpaid bookings near departure, unchecked documents, empty itineraries a week out, pending confirmations, budget overruns, open decisions, and post-trip retro prompts. Fix the thing and the reminder disappears.

**Improve over time**
- Completed trips get a **retro** (what worked / what to improve), and the optional AI can analyze the trip's numbers for concrete takeaways.

**AI (optional)**
- Bring your own Anthropic API key (Settings → AI). Unlocks:
  - High-accuracy parsing of messy confirmation emails
  - “Fill the empty days” itinerary drafting from your approved ideas and fixed bookings
  - Post-trip analysis
- Everything else works fully offline with no key.

## Data & privacy

All data lives in your browser (localStorage). Export/import a JSON backup from Settings to move between devices. The AI key, if provided, is stored locally and sent only with your AI requests.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · `@anthropic-ai/sdk` (Claude Opus 4.8 with structured outputs) — no database, no accounts.
