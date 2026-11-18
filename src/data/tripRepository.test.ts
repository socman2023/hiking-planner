import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HikingDB } from './db'
import { createTrip, deleteTrip, duplicateTrip, editDay, getTripDays, setTripStatus, updateTrip } from './tripRepository'
import { makeBackup, parseBackup, restoreBackup } from './backup'

let database: HikingDB
const sample = {
  title: 'Тестовый поход', regionLabel: 'Алтай', activityType: 'hiking' as const,
  startDate: '2027-09-03', dayCount: 4, notes: 'Одиночный маршрут',
}
beforeEach(() => { database = new HikingDB('hp-test-' + crypto.randomUUID()) })
afterEach(async () => { await database.delete() })

describe('сохранение походов в IndexedDB', () => {
  it('создаёт поход и календарные дни одной операцией', async () => {
    const trip = await createTrip(sample, database)
    const days = await getTripDays(trip.id, database)
    expect(await database.trips.count()).toBe(1)
    expect(days.length).toBe(4)
    expect(days.map(day => day.date)).toEqual(['2027-09-03','2027-09-04','2027-09-05','2027-09-06'])
    expect(trip.status).toBe('draft')
  })
  it('изменяет продолжительность, переносит даты и сохраняет записи', async () => {
    const trip = await createTrip(sample, database)
    const before = await getTripDays(trip.id, database)
    await editDay(before[1].id, { title: 'Перевал', kind: 'rest' }, database)
    const longer = await updateTrip(trip.id, { ...sample, startDate: '2027-10-01', dayCount: 6 }, database)
    expect(longer.removedDays).toHaveLength(0)
    const after = await getTripDays(trip.id, database)
    expect(after).toHaveLength(6)
    expect(after[1]).toMatchObject({ id: before[1].id, title: 'Перевал', kind: 'rest', date: '2027-10-02' })
    const shorter = await updateTrip(trip.id, { ...sample, startDate: '2027-10-01', dayCount: 2 }, database)
    expect(shorter.removedDays).toHaveLength(4)
    expect((await getTripDays(trip.id, database))).toHaveLength(2)
    expect(await database.days.count()).toBe(2)
  })
  it('копирует дни независимо от исходного похода', async () => {
    const trip = await createTrip(sample, database)
    const copy = await duplicateTrip(trip.id, database)
    const sourceDays = await getTripDays(trip.id, database)
    const copiedDays = await getTripDays(copy.id, database)
    expect(copy.id).not.toBe(trip.id)
    expect(copiedDays[0].id).not.toBe(sourceDays[0].id)
    await editDay(copiedDays[0].id, { title: 'Копия' }, database)
    expect((await getTripDays(trip.id, database))[0].title).toBe('')
    await setTripStatus(copy.id, 'planned', database)
    expect((await database.trips.get(copy.id))?.status).toBe('planned')
  })
  it('удаляет только выбранный поход и его дни', async () => {
    const first = await createTrip(sample, database)
    const second = await createTrip({ ...sample, title: 'Второй' }, database)
    await deleteTrip(first.id, database)
    expect(await database.trips.count()).toBe(1)
    expect(await database.days.count()).toBe(4)
    expect((await database.trips.toArray())[0].id).toBe(second.id)
  })
})

describe('резервные копии', () => {
  it('экспортируется и восстанавливается с сохранением содержимого', async () => {
    const trip = await createTrip(sample, database)
    const backup = await makeBackup(database)
    const file = JSON.stringify(backup)
    const parsed = parseBackup(file)
    expect(parsed.data.trips[0].id).toBe(trip.id)
    await deleteTrip(trip.id, database)
    expect(await database.trips.count()).toBe(0)
    await restoreBackup(parsed, database)
    expect(await database.trips.count()).toBe(1)
    expect(await database.days.count()).toBe(4)
  })
  it('отвергает повреждённый JSON, чужой формат и несвязанные дни', async () => {
    expect(() => parseBackup('{')).toThrow()
    expect(() => parseBackup('{"format":"other","schemaVersion":1}')).toThrow()
    await createTrip(sample, database)
    const backup = await makeBackup(database)
    const broken = structuredClone(backup)
    broken.data.days[0].tripId = 'unknown'
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('не связанные')
    expect(await database.trips.count()).toBe(1)
  })
  it('не подменяет некорректным бэкапом существующие данные', async () => {
    await createTrip(sample, database)
    const bad = await makeBackup(database)
    bad.data.days.pop()
    await expect(restoreBackup(bad, database)).rejects.toThrow()
    expect(await database.trips.count()).toBe(1)
    expect(await database.days.count()).toBe(4)
  })
})
