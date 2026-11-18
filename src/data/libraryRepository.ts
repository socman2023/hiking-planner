import { db, type HikingDB } from './db'
import {
  definitions, foreignKeys, libraryTables, validateRow, normalizeRow,
  type LibraryTableName, type LibraryRow,
} from '../domain/library'

export type LibraryData = Record<LibraryTableName, LibraryRow[]>
export interface LibraryArchive {
  format: 'hiking-planner-library'
  schemaVersion: 1
  exportedAt: string
  data: LibraryData
}
export const LIBRARY_MAX_BYTES = 10 * 1024 * 1024

export async function readLibrary(database: HikingDB = db): Promise<LibraryData> {
  const arrays = await Promise.all(libraryTables.map(name => database[name].toArray()))
  return Object.fromEntries(libraryTables.map((name, index) => [name, arrays[index]])) as LibraryData
}

export async function makeLibraryArchive(database: HikingDB = db): Promise<LibraryArchive> {
  return { format: 'hiking-planner-library', schemaVersion: 1,
    exportedAt: new Date().toISOString(), data: await readLibrary(database) }
}
function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}
export function validateLibraryData(value: unknown): LibraryData {
  if (!isObject(value) || Object.keys(value).some(k => !libraryTables.some(t => t === k))) {
    throw new Error('Неизвестная структура библиотеки')
  }
  const result = {} as LibraryData
  for (const table of libraryTables) {
    const entries = value[table]
    if (!Array.isArray(entries) || entries.length > 20000) throw new Error('Нет таблицы «' + table + '» или превышен лимит')
    const ids = new Set<string>()
    for (const entry of entries) {
      if (!isObject(entry) || typeof entry.id !== 'string') throw new Error('Неверная запись: ' + table)
      const row = entry as unknown as LibraryRow
      validateRow(table, row)
      if (ids.has(row.id)) throw new Error('Повторяется ID в таблице ' + table)
      ids.add(row.id)
    }
    result[table] = entries as LibraryRow[]
  }
  for (const table of libraryTables) {
    const keys = foreignKeys[table] ?? {}
    for (const item of result[table]) {
      for (const [key, parentTable] of Object.entries(keys)) {
        const linked = item[key]
        if (typeof linked === 'string' && linked && !result[parentTable].some(p => p.id === linked)) {
          throw new Error('Нет связанной записи для ' + definitions[table].label + ': ' + key)
        }
      }
    }
  }
  return result
}
export function parseLibraryArchive(text: string): LibraryArchive {
  if (new TextEncoder().encode(text).length > LIBRARY_MAX_BYTES) throw new Error('Файл больше 10 МБ')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('Некорректный JSON') }
  if (!isObject(raw) || raw.format !== 'hiking-planner-library' || raw.schemaVersion !== 1 ||
      typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt))) {
    throw new Error('Это не архив библиотеки Hiking Planner версии 1')
  }
  return { format: 'hiking-planner-library', schemaVersion: 1, exportedAt: raw.exportedAt,
    data: validateLibraryData(raw.data) }
}
export async function replaceLibrary(archive: LibraryArchive, database: HikingDB = db): Promise<void> {
  const checked = parseLibraryArchive(JSON.stringify(archive))
  const tables = libraryTables.map(name => database[name])
  await database.transaction('rw', ...tables, async () => {
    for (const table of libraryTables) await database[table].clear()
    for (const table of libraryTables) {
      if (checked.data[table].length) await database[table].bulkAdd(checked.data[table])
    }
  })
}
export async function saveLibraryRow(table: LibraryTableName, values: Record<string, unknown>,
  id?: string, database: HikingDB = db): Promise<LibraryRow> {
  return database.transaction('rw', ...libraryTables.map(name => database[name]), async () => {
    const current = id ? await database[table].get(id) : undefined
    if (id && !current) throw new Error('Запись не найдена')
    const item = normalizeRow(table, values, current)
    for (const [key, parentTable] of Object.entries(foreignKeys[table] ?? {})) {
      const value = item[key]
      if (typeof value === 'string' && value && !(await database[parentTable].get(value))) {
        throw new Error('Связанная запись не найдена: ' + key)
      }
    }
    await database[table].put(item)
    return item
  })
}
export async function deleteLibraryRow(table: LibraryTableName, id: string, database: HikingDB = db): Promise<void> {
  await database.transaction('rw', ...libraryTables.map(name => database[name]), async () => {
    if (!(await database[table].get(id))) throw new Error('Запись не найдена')
    for (const other of libraryTables) {
      const references = foreignKeys[other] ?? {}
      for (const [key, referenced] of Object.entries(references)) {
        if (referenced === table && (await database[other].filter(row => row[key] === id).count()) > 0) {
          throw new Error('Запись используется в разделе «' + definitions[other].label +
            '». Сначала удалите связанные записи.')
        }
      }
    }
    await database[table].delete(id)
  })
}
export function saveJsonFile(name: string, content: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function safeCsvCell(value: unknown): string {
  const v = value === null || value === undefined ? '' : String(value)
  // Avoid spreadsheet formula injection when exporting user-supplied text.
  const protectedValue = /^[=+\-@\t\r]/.test(v) ? "'" + v : v
  return '"' + protectedValue.replace(/"/g, '""') + '"'
}
export function exportLibraryCsv(table: LibraryTableName, rows: LibraryRow[]): string {
  const keys = ['id', ...definitions[table].fields.map(f => f.key), 'createdAt', 'updatedAt']
  return '\uFEFF' + [keys.map(safeCsvCell).join(';'), ...rows.map(row => keys.map(k => safeCsvCell(row[k])).join(';'))].join('\r\n')
}
