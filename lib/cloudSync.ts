// Cloud sync for shared trips (Phase 2). Each trip that's been claimed by a
// signed-in user becomes one Firestore document at trips/{tripId}, holding a
// full bundle of that trip's data (the trip itself plus every related slice
// from AppData). Up to 5 travelers can share a trip by email — see
// firestore.rules for the access model.
//
// This module is pure data plumbing: building/merging bundles and talking to
// Firestore. The actual sync loop lives in lib/store.tsx.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  AppData,
  Booking,
  ChecklistItem,
  Decision,
  Expense,
  Idea,
  ItineraryItem,
  Trip,
} from "./types";

export const MAX_TRIP_MEMBERS = 5;

export interface TripBundle {
  trip: Trip;
  ideas: Idea[];
  decisions: Decision[];
  bookings: Booking[];
  itinerary: ItineraryItem[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  updatedAt: string;
}

const COLLECTION = "trips";

export function tripBundle(data: AppData, tripId: string, updatedAt = new Date().toISOString()): TripBundle | null {
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  return {
    trip: { ...trip, updatedAt },
    ideas: data.ideas.filter((x) => x.tripId === tripId),
    decisions: data.decisions.filter((x) => x.tripId === tripId),
    bookings: data.bookings.filter((x) => x.tripId === tripId),
    itinerary: data.itinerary.filter((x) => x.tripId === tripId),
    expenses: data.expenses.filter((x) => x.tripId === tripId),
    checklist: data.checklist.filter((x) => x.tripId === tripId),
    updatedAt,
  };
}

// Replaces the given trip's slices in `data` with the bundle's contents,
// preserving every other trip's data untouched.
export function mergeBundleIntoData(data: AppData, bundle: TripBundle): AppData {
  const tripId = bundle.trip.id;
  const drop = <T extends { tripId: string }>(list: T[]) => list.filter((x) => x.tripId !== tripId);
  return {
    ...data,
    trips: [...data.trips.filter((t) => t.id !== tripId), bundle.trip],
    ideas: [...drop(data.ideas), ...bundle.ideas],
    decisions: [...drop(data.decisions), ...bundle.decisions],
    bookings: [...drop(data.bookings), ...bundle.bookings],
    itinerary: [...drop(data.itinerary), ...bundle.itinerary],
    expenses: [...drop(data.expenses), ...bundle.expenses],
    checklist: [...drop(data.checklist), ...bundle.checklist],
  };
}

export async function pushTripBundle(bundle: TripBundle): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, COLLECTION, bundle.trip.id), bundle);
}

export async function fetchTripBundle(tripId: string): Promise<TripBundle | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTION, tripId));
  return snap.exists() ? (snap.data() as TripBundle) : null;
}

export async function deleteCloudTrip(tripId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTION, tripId));
}

// Subscribes to every cloud trip the given email has access to (owner or
// invited member). Calls `onChange` with the latest bundle whenever any of
// them changes, and `onRemoved` if a trip's doc is deleted.
export function subscribeToMyTrips(
  email: string,
  onChange: (bundle: TripBundle) => void,
  onRemoved: (tripId: string) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(collection(db, COLLECTION), where("memberEmails", "array-contains", email.toLowerCase()));
  return onSnapshot(q, (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === "removed") onRemoved(change.doc.id);
      else onChange(change.doc.data() as TripBundle);
    }
  });
}
