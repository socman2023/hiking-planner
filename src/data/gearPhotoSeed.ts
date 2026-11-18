import { db, type HikingDB } from './db'
import { type LibraryRow } from '../domain/library'
import { validateLibraryData } from './libraryRepository'

const PHOTO_KEY = 'driveGearPhotoVersion'
const PHOTO_VERSION = 'drive-2026-11-18-50-verified'
export const PHOTO_GEAR_INDICES = [
  3, 4, 6, 7, 8, 13, 17, 18, 21, 23,
  24, 26, 28, 31, 32, 33, 34, 35, 36, 39,
  41, 42, 49, 50, 54, 60, 61, 63, 65, 67,
  70, 72, 79, 80, 82, 83, 84, 85, 91, 93,
  94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
] as const

const key = (row: LibraryRow) =>
  [row.name, row.model].map(x => String(x ?? '').trim().toLocaleLowerCase('ru')).join('|')

export async function attachVerifiedGearPhotos(force = false, database: HikingDB = db): Promise<number> {
  if (!force && (await database.settings.get(PHOTO_KEY))?.value === PHOTO_VERSION) return 0
  if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не поддерживает распаковку каталога')
  const response = await fetch(import.meta.env.BASE_URL + 'seed/catalog.bin')
  if (!response.ok || !response.body) throw new Error('Не удалось загрузить список моделей снаряжения')
  const unpacked = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json() as
    { version?: string; data?: unknown }
  if (unpacked.version !== 'xlsx-2026-11-18-v1') throw new Error('Неизвестная версия каталога снаряжения')
  const archive = validateLibraryData(unpacked.data)
  return database.transaction('rw', database.gear, database.settings, async () => {
    if (!force && (await database.settings.get(PHOTO_KEY))?.value === PHOTO_VERSION) return 0
    const present = await database.gear.toArray()
    const byKey = new Map(present.map(item => [key(item), item]))
    const byId = new Map(present.map(item => [item.id, item]))
    let attached = 0
    for (const index of PHOTO_GEAR_INDICES) {
      const original = archive.gear[index]
      if (!original) throw new Error('Исходное снаряжение изменилось: ' + index)
      const match = byId.get(original.id) ?? byKey.get(key(original))
      if (!match || match.photoPath) continue
      const path = 'seed/photos/gear-' + index + '.jpg'
      await database.gear.update(match.id, { photoPath: path, updatedAt: new Date().toISOString() })
      match.photoPath = path
      attached++
    }
    await database.settings.put({ key: PHOTO_KEY, value: PHOTO_VERSION })
    return attached
  })
}
