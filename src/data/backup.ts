import { db, type HikingDB } from './db'
import { libraryTables, type LibraryRow } from '../domain/library'
import { readLibrary, validateLibraryData } from './libraryRepository'
import {
  activityLabels, addDays, dayKindLabels, statusLabels, validISODate,
  type AppSetting, type Trip, type TripDay,
} from '../domain/trips'

export interface BackupV1 {
  format: 'hiking-planner-backup'
  schemaVersion: 1
  exportedAt: string
  data: {
    trips: Trip[]
    days: TripDay[]
    settings: AppSetting[]
  }
}

export interface BackupV2 {
  format: 'hiking-planner-backup'
  schemaVersion: 2
  exportedAt: string
  data: BackupV1['data'] & { library: Record<(typeof libraryTables)[number], LibraryRow[]> }
}
export type AnyBackup = BackupV1 | BackupV2
const MAX_FILE_BYTES = 60 * 1024 * 1024

export async function makeBackup(database: HikingDB = db): Promise<BackupV2> {
  const [trips, days, settings] = await database.transaction(
    'r', database.trips, database.days, database.settings,
    async () => Promise.all([
      database.trips.toArray(), database.days.toArray(), database.settings.toArray(),
    ]),
  )
  return {
    format: 'hiking-planner-backup',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: { trips, days, settings, library: await readLibrary(database) },
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function string(value: unknown): value is string { return typeof value === 'string' }
function dateTime(value: unknown): value is string {
  return string(value) && !Number.isNaN(Date.parse(value))
}
function validTrip(value: unknown): value is Trip {
  if (!record(value)) return false
  return string(value.id) && !!value.id &&
    string(value.title) && !!value.title.trim() && value.title.length <= 120 &&
    string(value.regionLabel) && value.regionLabel.length <= 150 &&
    string(value.notes) && value.notes.length <= 5000 &&
    string(value.activityType) && value.activityType in activityLabels &&
    string(value.status) && value.status in statusLabels &&
    string(value.startDate) && validISODate(value.startDate) &&
    typeof value.dayCount === 'number' && Number.isInteger(value.dayCount) && value.dayCount >= 1 &&
    value.dayCount <= 365 &&
    dateTime(value.createdAt) && dateTime(value.updatedAt)
}
function validDay(value: unknown): value is TripDay {
  if (!record(value)) return false
  return string(value.id) && !!value.id && string(value.tripId) && !!value.tripId &&
    string(value.date) && validISODate(value.date) &&
    string(value.kind) && value.kind in dayKindLabels &&
    string(value.title) && value.title.length <= 120 &&
    string(value.description) && value.description.length <= 5000 &&
    string(value.notes) && value.notes.length <= 5000
}
function validSetting(value: unknown): value is AppSetting {
  return record(value) && string(value.key) && !!value.key && string(value.value)
}
function unique(ids: string[]): boolean { return new Set(ids).size === ids.length }

export function parseBackup(text: string): AnyBackup {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    throw new Error('Резервная копия слишком велика (максимум 60 МБ)')
  }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('Файл не является корректным JSON') }
  if (!record(raw) || raw.format !== 'hiking-planner-backup' || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) ||
      !dateTime(raw.exportedAt) || !record(raw.data)) {
    throw new Error('Неизвестный формат или версия резервной копии')
  }
  const { trips, days, settings } = raw.data
  if (!Array.isArray(trips) || !Array.isArray(days) || !Array.isArray(settings) ||
      !trips.every(validTrip) || !days.every(validDay) || !settings.every(validSetting)) {
    throw new Error('Резервная копия содержит некорректные записи')
  }
  if (!unique(trips.map((trip: Trip) => trip.id)) ||
      !unique(days.map((day: TripDay) => day.id)) ||
      !unique(settings.map((setting: AppSetting) => setting.key))) {
    throw new Error('Обнаружены повторяющиеся идентификаторы')
  }
  const tripIndex = new Map<string, Trip>(trips.map((trip: Trip) => [trip.id, trip]))
  const daysByTrip = new Map<string, TripDay[]>()
  for (const day of days as TripDay[]) {
    if (!tripIndex.has(day.tripId)) throw new Error('Найдены дни, не связанные с походом')
    const items = daysByTrip.get(day.tripId) ?? []
    items.push(day)
    daysByTrip.set(day.tripId, items)
  }
  for (const trip of trips as Trip[]) {
    const actual = (daysByTrip.get(trip.id) ?? []).sort((a, b) => a.date.localeCompare(b.date))
    if (actual.length !== trip.dayCount ||
        !actual.every((day, index) => day.date === addDays(trip.startDate, index))) {
      throw new Error('Нарушена последовательность календарных дней похода «' + trip.title + '»')
    }
  }
  if (raw.schemaVersion === 2) validateLibraryData(raw.data.library)
  return raw as unknown as AnyBackup
}

export async function restoreBackup(backup: AnyBackup, database: HikingDB = db): Promise<void> {
  const checked = parseBackup(JSON.stringify(backup))
  await database.transaction('rw', [database.trips, database.days, database.settings,
    ...libraryTables.map(table => database[table])], async () => {
    await Promise.all([database.trips.clear(), database.days.clear(), database.settings.clear()])
    if (checked.schemaVersion === 2) {
      for (const table of libraryTables) await database[table].clear()
      for (const table of libraryTables) {
        if (checked.data.library[table].length) await database[table].bulkAdd(checked.data.library[table])
      }
    }
    if (checked.data.trips.length) await database.trips.bulkAdd(checked.data.trips)
    if (checked.data.days.length) await database.days.bulkAdd(checked.data.days)
    if (checked.data.settings.length) await database.settings.bulkAdd(checked.data.settings)
  })
}

export function saveBackupToFile(backup: AnyBackup): void {
  const name = 'hiking-planner-backup-' + new Date().toISOString().slice(0, 10) + '.json'
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
