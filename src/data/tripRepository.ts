import { db, type HikingDB } from './db'
import {
  addDays, buildDays, type DayKind, type Trip, type TripDay,
  type TripInput, type TripStatus, validateTripInput,
} from '../domain/trips'

export async function createTrip(input: TripInput, database: HikingDB = db): Promise<Trip> {
  const clean = validateTripInput(input)
  const now = new Date().toISOString()
  const trip: Trip = {
    ...clean, id: crypto.randomUUID(), status: 'draft', createdAt: now, updatedAt: now,
  }
  const days = buildDays(trip.id, trip.startDate, trip.dayCount)
  await database.transaction('rw', database.trips, database.days, async () => {
    await database.trips.add(trip)
    await database.days.bulkAdd(days)
  })
  return trip
}

export async function getTripDays(tripId: string, database: HikingDB = db): Promise<TripDay[]> {
  return (await database.days.where('tripId').equals(tripId).toArray())
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function updateTrip(
  tripId: string, input: TripInput, database: HikingDB = db,
): Promise<{ trip: Trip; removedDays: TripDay[] }> {
  const clean = validateTripInput(input)
  return database.transaction('rw', database.trips, database.days, async () => {
    const trip = await database.trips.get(tripId)
    if (!trip) throw new Error('Поход не найден')
    const currentDays = await getTripDays(tripId, database)
    const retained = buildDays(tripId, clean.startDate, clean.dayCount, currentDays)
    const removedDays = currentDays.slice(clean.dayCount)
    const changed: Trip = { ...trip, ...clean, updatedAt: new Date().toISOString() }
    await database.trips.put(changed)
    if (removedDays.length) await database.days.bulkDelete(removedDays.map((day) => day.id))
    if (retained.length) await database.days.bulkPut(retained)
    return { trip: changed, removedDays }
  })
}

export async function duplicateTrip(tripId: string, database: HikingDB = db): Promise<Trip> {
  return database.transaction('rw', database.trips, database.days, async () => {
    const original = await database.trips.get(tripId)
    if (!original) throw new Error('Поход не найден')
    const days = await getTripDays(tripId, database)
    const now = new Date().toISOString()
    const copy: Trip = {
      ...original, id: crypto.randomUUID(), title: original.title + ' — копия',
      status: 'draft', createdAt: now, updatedAt: now,
    }
    const copiedDays = days.map((day) => ({ ...day, id: crypto.randomUUID(), tripId: copy.id }))
    await database.trips.add(copy)
    await database.days.bulkAdd(copiedDays)
    return copy
  })
}

export async function setTripStatus(
  tripId: string, status: TripStatus, database: HikingDB = db,
): Promise<void> {
  const changed = await database.trips.update(tripId, {
    status, updatedAt: new Date().toISOString(),
  })
  if (!changed) throw new Error('Поход не найден')
}

export async function deleteTrip(tripId: string, database: HikingDB = db): Promise<void> {
  await database.transaction('rw', database.trips, database.days, async () => {
    await database.days.where('tripId').equals(tripId).delete()
    await database.trips.delete(tripId)
  })
}

export async function editDay(
  dayId: string,
  patch: Partial<Pick<TripDay, 'kind' | 'title' | 'description' | 'notes'>>,
  database: HikingDB = db,
): Promise<void> {
  if (patch.kind && !(['hiking', 'logistics', 'rest', 'other'] as DayKind[]).includes(patch.kind)) {
    throw new Error('Некорректный тип дня')
  }
  await database.transaction('rw', database.trips, database.days, async () => {
    const day = await database.days.get(dayId)
    if (!day) throw new Error('День не найден')
    const changed = await database.days.update(dayId, patch)
    if (!changed) throw new Error('День не найден')
    await database.trips.update(day.tripId, { updatedAt: new Date().toISOString() })
  })
}

export function previewRemovedDays(days: TripDay[], newCount: number): TripDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(newCount)
}

export function dayDateMatches(trip: Trip, days: TripDay[]): boolean {
  if (days.length !== trip.dayCount) return false
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.every((day, index) => day.tripId === trip.id && day.date === addDays(trip.startDate, index))
}
