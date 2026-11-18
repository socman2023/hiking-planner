import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HikingDB } from './db'
import { createTrip, setTripStatus } from './tripRepository'
import { makeBackup, parseBackup, restoreBackup, type BackupV1 } from './backup'
import {
  deleteLibraryRow, exportLibraryCsv, makeLibraryArchive, parseLibraryArchive,
  replaceLibrary, saveLibraryRow,
} from './libraryRepository'

let database: HikingDB
const sample = {
  title: 'Соло', regionLabel: 'Карелия', activityType: 'hiking' as const,
  startDate: '2027-07-09', dayCount: 3, notes: '',
}
beforeEach(() => { database = new HikingDB('hp-stage2-' + crypto.randomUUID()) })
afterEach(async () => { await database.delete() })

describe('этап 2: библиотека и независимость от походов', () => {
  it('не удаляет элементы при изменении статуса походов', async () => {
    const first = await createTrip(sample, database)
    const second = await createTrip({ ...sample, title: 'Другой поход' }, database)
    const food = await saveLibraryRow('foods', { name: 'Сухари', category: 'Сухие продукты',
      kcalPer100g: '342', form: 'dry' }, undefined, database)
    await setTripStatus(first.id, 'archived', database)
    await setTripStatus(second.id, 'completed', database)
    expect((await database.foods.get(food.id))?.kcalPer100g).toBe(342)
    expect(await database.foods.count()).toBe(1)
    expect(await database.trips.count()).toBe(2)
  })
  it('отличает неизвестные значения от нуля и реальные упаковки от каталога', async () => {
    const food = await saveLibraryRow('foods', { name: 'Каша', kcalPer100g: '' }, undefined, database)
    expect(food.kcalPer100g).toBeNull()
    const pack = await saveLibraryRow('packages', { foodProductId: food.id,
      label: 'Пакет 70 г', netWeightG: '70', packageWeightG: '3' }, undefined, database)
    expect(pack.netWeightG).toBe(70)
    expect(pack.packageWeightG).toBe(3)
    expect(pack.grossWeightG).toBeNull()
    await expect(deleteLibraryRow('foods', food.id, database)).rejects.toThrow('используется')
    await deleteLibraryRow('packages', pack.id, database)
    await deleteLibraryRow('foods', food.id, database)
    expect(await database.foods.count()).toBe(0)
  })
  it('сохраняет источник, состав блюда и фактическую массу своей вещи', async () => {
    const source = await saveLibraryRow('sources', { title: 'Этикетка', provider: 'Производитель',
      url: 'https://example.org/label' }, undefined, database)
    const food = await saveLibraryRow('foods', { name: 'Гречка', sourceRef: source.id }, undefined, database)
    const dish = await saveLibraryRow('dishes', { title: 'Гречневая каша' }, undefined, database)
    await saveLibraryRow('ingredients', { dishId: dish.id, productId: food.id, rawAmountG: '90' }, undefined, database)
    const gear = await saveLibraryRow('gear', { name: 'Палатка', manufacturerWeightG: '1300' }, undefined, database)
    const owned = await saveLibraryRow('ownedGear', { catalogItemId: gear.id, nickname: 'Моя палатка',
      measuredWeightG: '1436.5', quantityOwned: '1' }, undefined, database)
    expect(owned.measuredWeightG).toBe(1436.5)
    expect((await database.gear.get(gear.id))?.manufacturerWeightG).toBe(1300)
    await expect(deleteLibraryRow('sources', source.id, database)).rejects.toThrow('используется')
    await expect(deleteLibraryRow('foods', food.id, database)).rejects.toThrow('используется')
  })
  it('хранит срок годности только у конкретной аптечной упаковки', async () => {
    const item = await saveLibraryRow('medical', { tradeName: 'Бинт', kind: 'device' }, undefined, database)
    const pack = await saveLibraryRow('medicalPacks', { catalogItemId: item.id, label: 'Упаковка 1',
      packageQuantity: '2', unit: 'шт.', expiryDate: '' }, undefined, database)
    expect(pack.expiryDate).toBe('')
    expect(pack.actualWeightG).toBeNull()
    const changed = await saveLibraryRow('medicalPacks', { ...pack, expiryDate: '2028-09-30' }, pack.id, database)
    expect(changed.expiryDate).toBe('2028-09-30')
    expect((await database.medical.get(item.id))?.expiryDate).toBeUndefined()
  })
  it('проверяет ссылки перед импортом и заменяет только библиотеку', async () => {
    const trip = await createTrip(sample, database)
    const food = await saveLibraryRow('foods', { name: 'Орехи' }, undefined, database)
    const archive = await makeLibraryArchive(database)
    const broken = structuredClone(archive)
    broken.data.packages.push({ id: crypto.randomUUID(), foodProductId: 'missing', label: '10 г',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    expect(() => parseLibraryArchive(JSON.stringify(broken))).toThrow('Нет связанной записи')
    await deleteLibraryRow('foods', food.id, database)
    await replaceLibrary(archive, database)
    expect((await database.foods.get(food.id))?.name).toBe('Орехи')
    expect((await database.trips.get(trip.id))?.title).toBe('Соло')
  })
  it('сохраняет в полном бэкапе v2 библиотеку и умеет читать v1', async () => {
    const trip = await createTrip(sample, database)
    const food = await saveLibraryRow('foods', { name: 'Смесь', proteinPer100g: '0' }, undefined, database)
    const copy = await makeBackup(database)
    expect(copy.schemaVersion).toBe(2)
    expect(copy.data.library.foods).toHaveLength(1)
    await deleteLibraryRow('foods', food.id, database)
    await restoreBackup(parseBackup(JSON.stringify(copy)), database)
    expect((await database.foods.get(food.id))?.proteinPer100g).toBe(0)
    const v1: BackupV1 = { format: 'hiking-planner-backup', schemaVersion: 1, exportedAt: copy.exportedAt,
      data: { trips: copy.data.trips, days: copy.data.days, settings: copy.data.settings } }
    await restoreBackup(parseBackup(JSON.stringify(v1)), database)
    expect((await database.trips.get(trip.id))?.title).toBe('Соло')
    expect(await database.foods.count()).toBe(1)
  })
  it('не выполняет CSV-формулы из пользовательского текста', async () => {
    const entry = await saveLibraryRow('foods', { name: '=2+2' }, undefined, database)
    expect(exportLibraryCsv('foods', [entry])).toContain('"\'=2+2"')
  })
})

describe('миграция v1 → v2', () => {
  it('сохраняет старые походы и дни при открытии существующей базы', async () => {
    const name = 'hp-migration-' + crypto.randomUUID()
    const legacy = new Dexie(name)
    legacy.version(1).stores({
      trips: 'id, status, startDate, updatedAt',
      days: 'id, tripId, [tripId+date]',
      settings: 'key',
    })
    await legacy.open()
    await legacy.table('trips').put({
      id: 'legacy-trip', title: 'Старый поход', regionLabel: '',
      activityType: 'hiking', startDate: '2027-01-01', dayCount: 1,
      status: 'draft', notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    await legacy.table('days').put({ id: 'old-day', tripId: 'legacy-trip',
      date: '2027-01-01', kind: 'hiking', title: '', description: '', notes: '' })
    legacy.close()
    const modern = new HikingDB(name)
    try {
      await modern.open()
      expect((await modern.trips.get('legacy-trip'))?.title).toBe('Старый поход')
      expect((await modern.days.get('old-day'))?.tripId).toBe('legacy-trip')
      expect(await modern.foods.count()).toBe(0)
    } finally { await modern.delete() }
  })
})
