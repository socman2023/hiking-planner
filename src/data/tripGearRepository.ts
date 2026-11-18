import { db, type HikingDB } from './db'
import type { TripGearCarryMode, TripGearItem } from '../domain/trips'

export interface TripGearInput {
  gearId: string
  quantity: number
  placement: string
  carryMode: TripGearCarryMode
  packed: boolean
  notes: string
}
export function validateTripGear(input: TripGearInput): TripGearInput {
  const placement = input.placement.trim()
  const notes = input.notes.trim()
  if (!input.gearId) throw new Error('Выберите предмет из каталога')
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    throw new Error('Количество должно быть от 1 до 99')
  }
  if (placement.length > 120) throw new Error('Место размещения слишком длинное')
  if (notes.length > 1000) throw new Error('Слишком длинная заметка')
  if (!(['pack', 'worn', 'outside'] as string[]).includes(input.carryMode)) {
    throw new Error('Неверный способ переноски')
  }
  return {...input, placement, notes}
}
export async function getTripGear(tripId: string, database: HikingDB = db): Promise<TripGearItem[]> {
  return database.tripGear.where('tripId').equals(tripId).toArray()
}
export async function saveTripGear(tripId: string, values: TripGearInput, id?: string,
  database: HikingDB = db): Promise<TripGearItem> {
  const input = validateTripGear(values)
  return database.transaction('rw', [database.trips, database.gear, database.tripGear], async () => {
    if (!(await database.trips.get(tripId))) throw new Error('Поход не найден')
    if (!(await database.gear.get(input.gearId))) throw new Error('Предмет отсутствует в библиотеке')
    const old = id ? await database.tripGear.get(id) : undefined
    if (id && (!old || old.tripId !== tripId)) throw new Error('Запись не найдена в этом походе')
    const now = new Date().toISOString()
    const item: TripGearItem = { ...input, id: old?.id ?? crypto.randomUUID(), tripId,
      createdAt: old?.createdAt ?? now, updatedAt: now }
    await database.tripGear.put(item)
    return item
  })
}
export async function deleteTripGear(tripId: string, id: string, database: HikingDB = db): Promise<void> {
  await database.transaction('rw', database.tripGear, async () => {
    const row = await database.tripGear.get(id)
    if (!row || row.tripId !== tripId) throw new Error('Запись не найдена в этом походе')
    await database.tripGear.delete(id)
  })
}
