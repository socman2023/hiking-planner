import { db, type HikingDB } from './db'
import { type LibraryRow } from '../domain/library'
import { validateLibraryData } from './libraryRepository'

const PHOTO_KEY = 'driveGearPhotoVersion'
const PHOTO_VERSION = 'drive-2026-11-18-109-matched-v2'
export const PHOTO_GEAR_INDICES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
  48, 49, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 67, 68, 69, 70, 71, 72, 73,
  74, 75, 76, 77, 79, 80, 81, 82, 83, 84, 85, 86,
  87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98,
  99, 100, 101, 102, 103, 104, 105, 106, 107, 109, 110, 111,
  112,
] as const

const ILLUSTRATIVE_INDICES = new Set<number>([2, 5, 10, 11, 12, 14, 38, 44, 47, 58, 69, 73, 74, 75, 76, 77, 87, 105, 109, 110, 111, 112])

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
      const matchKind = ILLUSTRATIVE_INDICES.has(index) ? 'illustrative' : 'exact'
      await database.gear.update(match.id, { photoPath: path, photoMatch: matchKind, updatedAt: new Date().toISOString() })
      match.photoPath = path
      attached++
    }
    await database.settings.put({ key: PHOTO_KEY, value: PHOTO_VERSION })
    return attached
  })
}
