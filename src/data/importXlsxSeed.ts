import { db, type HikingDB } from './db'
import {
  definitions, foreignKeys, validateRow,
  type LibraryRow, type LibraryTableName,
} from '../domain/library'
import { validateLibraryData } from './libraryRepository'

const SEED_KEY = 'xlsxSeedVersion'
const SEED_VERSION = 'xlsx-2026-11-18-v1'
export interface SeedResult { added: number; existing: number; alreadyImported: boolean }
const order: LibraryTableName[] = [
  'sources', 'foods', 'gear', 'medical', 'dishes', 'packages',
  'ingredients', 'ownedGear', 'medicalPacks',
]
import { stripAutoNotes } from './cleanLibraryNotes'

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('ru')
}
function fingerprint(table: LibraryTableName, row: LibraryRow): string {
  switch (table) {
    case 'sources': return [normalize(row.provider), normalize(row.title), normalize(row.url)].join('|')
    case 'foods': return [normalize(row.name), normalize(row.brand)].join('|')
    case 'gear': return [normalize(row.name), normalize(row.sourceDescription || row.model)].join('|')
    case 'medical': return [normalize(row.tradeName), normalize(row.kind)].join('|')
    case 'dishes': return normalize(row.title)
    case 'packages': {
      const label=normalize(row.label)
      const generated=/^(?:упаковка|единица)\s+[\d.,]+\s*г$/.test(label) ||
        /^1 леденец \(3 г\)$/.test(label)
      return [row.foodProductId,generated ? '#source-unit' : label,row.netWeightG].join('|')
    }
    case 'ingredients': return [row.dishId, row.productId, row.rawAmountG].join('|')
    case 'ownedGear': return [row.catalogItemId, normalize(row.nickname)].join('|')
    case 'medicalPacks': return [row.catalogItemId, normalize(row.label), row.expiryDate].join('|')
  }
}
export async function importXlsxCatalog(force = false, database: HikingDB = db): Promise<SeedResult> {
  if (!force && (await database.settings.get(SEED_KEY))?.value === SEED_VERSION) {
    return { added: 0, existing: 0, alreadyImported: true }
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Браузер не поддерживает распаковку каталога. Обновите браузер.')
  }
  const response = await fetch(import.meta.env.BASE_URL + 'seed/catalog.bin')
  if (!response.ok || !response.body) throw new Error('Не удалось загрузить исходный каталог')
  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'))
  const raw: unknown = await new Response(decompressed).json()
  if (!raw || typeof raw !== 'object' ||
    (raw as {version?: unknown}).version !== SEED_VERSION) {
    throw new Error('Неизвестная версия встроенного каталога')
  }
  const payload = validateLibraryData((raw as {data: unknown}).data)
  return database.transaction('rw',
    [database.settings, ...order.map(table => database[table])], async () => {
      if (!force && (await database.settings.get(SEED_KEY))?.value === SEED_VERSION) {
        return { added: 0, existing: 0, alreadyImported: true }
      }
      const idMap = new Map<string, string>()
      let added = 0
      let existing = 0
      for (const table of order) {
        const present = await database[table].toArray()
        const index = new Map(present.map(row => [fingerprint(table, row), row]))
        for (const incoming of payload[table]) {
          const mapped: LibraryRow = { ...incoming }
          if (typeof mapped.notes === 'string') mapped.notes = stripAutoNotes(mapped.notes)
          if (table === 'ownedGear') mapped.ownershipStatus = 'confirmed'
          for (const name of Object.keys(foreignKeys[table] ?? {})) {
            const value = mapped[name]
            if (typeof value === 'string' && value) {
              const target = idMap.get(value)
              if (!target) throw new Error('Отсутствует связанная запись: ' + definitions[table].label)
              mapped[name] = target
            }
          }
          const match = present.find(row => row.id === mapped.id) ?? index.get(fingerprint(table, mapped))
          if (match) {
            idMap.set(incoming.id, match.id)
            existing++
          } else {
            validateRow(table, mapped)
            await database[table].add(mapped)
            index.set(fingerprint(table, mapped), mapped)
            idMap.set(incoming.id, mapped.id)
            added++
          }
        }
      }
      await database.settings.put({ key: SEED_KEY, value: SEED_VERSION })
      return { added, existing, alreadyImported: false }
    })
}
