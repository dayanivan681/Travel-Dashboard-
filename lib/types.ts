// Core data model for Travel OS. Everything is stored locally (localStorage)
// and can be exported/imported as a single JSON document.

export type TripPhase = "idea" | "planning" | "booked" | "active" | "completed";

export interface Trip {
  id: string;
  name: string;
  destination: string;
  emoji: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  travelers: number;
  currency: string;
  budget?: number;
  notes: string;
  tags: string[];
  retro?: { wins: string; improvements: string };
  briefing?: { content: string; generatedAt: string };
  createdAt: string;
}

export type IdeaCategory =
  | "place"
  | "activity"
  | "food"
  | "stay"
  | "transport"
  | "other";

export type IdeaStatus = "new" | "shortlisted" | "approved" | "rejected";

export interface Idea {
  id: string;
  tripId: string;
  title: string;
  category: IdeaCategory;
  url?: string;
  notes?: string;
  estCost?: number;
  status: IdeaStatus;
  createdAt: string;
}

export interface DecisionOption {
  id: string;
  name: string;
  cost?: number;
  rating?: number; // 1-5
  pros: string[];
  cons: string[];
  url?: string;
  notes?: string;
}

// AI's take on an open decision — persisted so it survives reloads and can
// be compared against what the traveler ultimately picks.
export interface DecisionAdvice {
  recommendedOptionId: string;
  confidence: "low" | "medium" | "high";
  summary: string;
  assessments: Array<{ optionId: string; take: string }>;
  generatedAt: string;
}

export interface Decision {
  id: string;
  tripId: string;
  title: string;
  notes?: string;
  status: "open" | "decided";
  decidedOptionId?: string;
  options: DecisionOption[];
  ai?: DecisionAdvice;
  createdAt: string;
}

export type BookingType =
  | "flight"
  | "hotel"
  | "car"
  | "train"
  | "activity"
  | "restaurant"
  | "other";

export type BookingStatus = "pending" | "confirmed" | "cancelled";

export interface Booking {
  id: string;
  tripId: string;
  type: BookingType;
  title: string;
  provider?: string;
  confirmationCode?: string;
  start?: string; // ISO datetime or YYYY-MM-DD
  end?: string;
  location?: string;
  cost?: number;
  status: BookingStatus;
  paid: boolean;
  notes?: string;
  rawText?: string; // original pasted confirmation, kept for reference
  createdAt: string;
}

export interface ItineraryItem {
  id: string;
  tripId: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string;
  title: string;
  type: BookingType | "note";
  location?: string;
  bookingId?: string;
  notes?: string;
  done: boolean;
}

export type ExpenseCategory =
  | "lodging"
  | "transport"
  | "food"
  | "activities"
  | "shopping"
  | "other";

export interface Expense {
  id: string;
  tripId: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: ExpenseCategory;
  amount: number;
  currency?: string; // ISO code; absent = trip currency
}

export type ChecklistGroup = "packing" | "documents" | "todo";

export interface ChecklistItem {
  id: string;
  tripId: string;
  text: string;
  group: ChecklistGroup;
  done: boolean;
  createdAt: string;
}

export type TravelPace = "relaxed" | "balanced" | "packed";

export interface TravelerProfile {
  interests: string[]; // e.g. "food", "art", "hiking", "nightlife"
  pace: TravelPace;
  dietary: string; // free text: "vegetarian", "no shellfish", etc.
  travelStyle: string; // free text: "boutique hotels, avoid tourist traps"
}

export const EMPTY_PROFILE: TravelerProfile = {
  interests: [],
  pace: "balanced",
  dietary: "",
  travelStyle: "",
};

export interface Settings {
  homeCurrency: string;
  aiEnabled: boolean;
  apiKey: string;
  profile: TravelerProfile;
  lastBackupAt?: string;
  digest?: { content: string; generatedAt: string };
}

export interface AppData {
  version: 1;
  trips: Trip[];
  ideas: Idea[];
  decisions: Decision[];
  bookings: Booking[];
  itinerary: ItineraryItem[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  settings: Settings;
}

export const EMPTY_DATA: AppData = {
  version: 1,
  trips: [],
  ideas: [],
  decisions: [],
  bookings: [],
  itinerary: [],
  expenses: [],
  checklist: [],
  settings: { homeCurrency: "USD", aiEnabled: false, apiKey: "", profile: { ...EMPTY_PROFILE } },
};

export interface Reminder {
  id: string;
  tripId: string;
  tripName: string;
  severity: "info" | "warn" | "urgent";
  text: string;
  tab?: string; // suggested tab to open in the trip workspace
}

// Shape produced by the booking parser (rule-based or AI) before the user
// confirms and saves it as a Booking.
export interface ParsedBooking {
  type: BookingType;
  title: string;
  provider?: string;
  confirmationCode?: string;
  start?: string;
  end?: string;
  location?: string;
  cost?: number;
  notes?: string;
}

// Output of the universal AI "capture" action — classifies pasted text
// (emails, receipts, notes, recommendations) and extracts the matching shape.
export type CaptureKind = "booking" | "expense" | "idea" | "note";

export interface CapturedExpense {
  description: string;
  category: ExpenseCategory;
  amount: number;
  date?: string;
  currency?: string;
}

export interface CapturedIdea {
  title: string;
  category: IdeaCategory;
  notes?: string;
  estCost?: number;
}

export interface CaptureResult {
  kind: CaptureKind;
  booking?: ParsedBooking;
  expense?: CapturedExpense;
  idea?: CapturedIdea;
  note?: string;
}
