import { ChecklistGroup } from "./types";

// Default checklist templates applied to new trips (and re-applicable from
// the Checklist tab). Grouped so users can apply only what they need.
export const CHECKLIST_TEMPLATES: Record<
  string,
  { label: string; group: ChecklistGroup; items: string[] }
> = {
  documents: {
    label: "Documents & money",
    group: "documents",
    items: [
      "Passport valid 6+ months past return",
      "Visa / entry requirements checked",
      "Travel insurance confirmed",
      "Copies of passport & bookings saved offline",
      "Notify bank of travel",
      "Local currency / card with no foreign fees",
    ],
  },
  packing: {
    label: "Packing essentials",
    group: "packing",
    items: [
      "Phone charger + power adapter",
      "Medications",
      "Toiletries",
      "Comfortable walking shoes",
      "Weather-appropriate layers",
      "Reusable water bottle",
      "Day bag",
    ],
  },
  preTrip: {
    label: "Pre-trip to-dos",
    group: "todo",
    items: [
      "Check in for flight (24h before)",
      "Download offline maps",
      "Arrange transport to airport",
      "Hold mail / arrange plant & pet care",
      "Set out-of-office",
      "Charge devices & download entertainment",
    ],
  },
};

export const SAMPLE_CONFIRMATION = `Subject: Your flight confirmation - Booking ref: XK4P9Q

Dear Traveler,

Thank you for booking with Pacific Air.

Confirmation code: XK4P9Q
Flight: PA 482
From: SFO  To: NRT
Departure: Mar 14, 2026 11:35 AM
Arrival: Mar 15, 2026 2:50 PM

Passenger: 1 Adult
Total paid: $842.60 USD

Check-in opens 24 hours before departure.`;
