export type TripStatus = 'draft' | 'planned' | 'completed' | 'archived'
export type ActivityType = 'hiking' | 'mountain' | 'trekking' | 'other'
export type DayKind = 'hiking' | 'logistics' | 'rest' | 'other'

export interface Trip {
  id: string
  title: string
  regionLabel: string
  activityType: ActivityType
  startDate: string
  dayCount: number
  status: TripStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface TripDay {
  id: string
  tripId: string
  date: string
  kind: DayKind
  title: string
  description: string
  notes: string
}

export interface AppSetting {
  key: string
  value: string
}

export type TripInput = Pick<Trip, 'title' | 'regionLabel' | 'activityType' | 'startDate' | 'dayCount' | 'notes'>
export const MAX_DAYS = 365
export const activityLabels: Record<ActivityType, string> = {
  hiking: 'Пеший поход',
  mountain: 'Горный поход',
  trekking: 'Треккинг',
  other: 'Другой',
}
export const statusLabels: Record<TripStatus, string> = {
  draft: 'Черновик',
  planned: 'Запланирован',
  completed: 'Завершён',
  archived: 'Архив',
}
export const dayKindLabels: Record<DayKind, string> = {
  hiking: 'Ходовой день',
  logistics: 'Дорога / трансфер',
  rest: 'Днёвка / отдых',
  other: 'Другое',
}

export function validISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const date = new Date(s + 'T00:00:00.000Z')
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === s
}

export function addDays(date: string, offset: number): string {
  if (!validISODate(date) || !Number.isInteger(offset)) throw new Error('Некорректная календарная дата')
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  if (!validISODate(date)) return '—'
  return new Intl.DateTimeFormat('ru-RU', { ...opts, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00.000Z'))
}

export function formatRange(start: string, count: number): string {
  if (!validISODate(start) || !Number.isInteger(count) || count < 1) return '—'
  const end = addDays(start, count - 1)
  return start === end ? formatDate(start, { day: 'numeric', month: 'long', year: 'numeric' }) :
    formatDate(start, { day: 'numeric', month: 'short' }) + ' — ' + formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function validateTripInput(input: TripInput): TripInput {
  const title = input.title.trim()
  const regionLabel = input.regionLabel.trim()
  const notes = input.notes.trim()
  if (!title || title.length > 120) throw new Error('Название должно содержать от 1 до 120 символов')
  if (regionLabel.length > 150) throw new Error('Название региона слишком длинное')
  if (notes.length > 5000) throw new Error('Заметка слишком длинная')
  if (!validISODate(input.startDate)) throw new Error('Укажите корректную дату начала')
  if (!Number.isInteger(input.dayCount) || input.dayCount < 1 || input.dayCount > MAX_DAYS) {
    throw new Error('Продолжительность — от 1 до ' + MAX_DAYS + ' дней')
  }
  if (!(input.activityType in activityLabels)) throw new Error('Некорректный тип похода')
  return { title, regionLabel, notes, startDate: input.startDate, dayCount: input.dayCount, activityType: input.activityType }
}

export function buildDays(tripId: string, startDate: string, count: number, existing: TripDay[] = []): TripDay[] {
  const ordered = [...existing].sort((a, b) => a.date.localeCompare(b.date))
  return Array.from({ length: count }, (_, index) => {
    const previous = ordered[index]
    return {
      id: previous?.id ?? crypto.randomUUID(),
      tripId,
      date: addDays(startDate, index),
      kind: previous?.kind ?? 'hiking',
      title: previous?.title ?? '',
      description: previous?.description ?? '',
      notes: previous?.notes ?? '',
    }
  })
}

export function hasDayDetails(day: TripDay): boolean {
  return !!(day.title.trim() || day.description.trim() || day.notes.trim() || day.kind !== 'hiking')
}
