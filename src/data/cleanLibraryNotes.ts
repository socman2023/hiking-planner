import { db, type HikingDB } from './db'
import { libraryTables, type LibraryTableName } from '../domain/library'

// Strip only boilerplate introduced by the previous Excel importer. Do not touch
// natural notes typed by users or medical directions from the original table.
const GENERATED = [
  'Место хранения/носки:',
  'Связанная ссылка LighterPack из Excel сохранена в источниках.',
  'Импортировано из похода «',
  'Учётный вес из исторического списка:',
  'Исторический перечень аптечки из приложенной Excel-книги.',
  'Количество и срок годности приведены по старой походной таблице;',
  'URL сохранён, но в текущей среде не удалось автоматически получить содержимое страницы или изображений.',
  'Это не подтверждённая масса производителя',
]
export function stripAutoNotes(original: string): string {
  const note = String(original ?? '').trim()
  if (!GENERATED.some(marker => note.includes(marker))) return note
  const positions = GENERATED.map(marker => note.indexOf(marker)).filter(i => i >= 0)
  const first = Math.min(...positions)
  const before = note.slice(0, first).trim()
  if (note.startsWith('Исторический перечень аптечки из приложенной Excel-книги.')) {
    return note.replace(/^Исторический перечень аптечки из приложенной Excel-книги\. Не является актуальной инструкцией или назначением\.\s*/, '').trim()
  }
  if (note.startsWith('Количество и срок годности приведены по старой походной таблице;')) {
    return note.replace(/^Количество и срок годности приведены по старой походной таблице; текущее наличие и пригодность не подтверждены\.\s*/, '').trim()
  }
  return before.replace(/^Цена: [^\n]*$/, '').trim()
}

const CLEAN_KEY = 'libraryGeneratedNotesCleanupV2'
const TABLES: LibraryTableName[] = ['foods', 'packages', 'dishes', 'ingredients', 'gear', 'ownedGear', 'medical', 'medicalPacks', 'sources']
export async function cleanImportedLibraryNotes(database: HikingDB = db): Promise<number> {
  return database.transaction('rw', [database.settings, ...TABLES.map(name => database[name])], async () => {
    if ((await database.settings.get(CLEAN_KEY))?.value === 'done') return 0
    let changed = 0
    for (const table of libraryTables) {
      for (const row of await database[table].toArray()) {
        if (typeof row.notes !== 'string') continue
        const cleaned = stripAutoNotes(row.notes)
        if (cleaned !== row.notes) {
          await database[table].update(row.id, { notes: cleaned, updatedAt: new Date().toISOString() })
          changed++
        }
      }
    }
    await database.settings.put({key:CLEAN_KEY,value:'done'})
    return changed
  })
}
