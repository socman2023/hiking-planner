import { db, type HikingDB } from './db'
import type { LibraryRow } from '../domain/library'

const VERSION = 'lighterpack-2026-11-18-v1'
const SETTING = 'lighterpackSeedVersion'
interface LPItem {
  itemId: string
  name: string
  description: string
  category: string
  weightG: number | null
  photoUrl: string
  productUrl: string
}
interface LPList { code: string; url: string; items: LPItem[] }
interface LPSeed { format: string; version: number; lists: LPList[] }
export interface LighterPackImportResult { added: number; existing: number; images: number }

function norm(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
}
function key(name: unknown, model: unknown): string {
  return norm(name) + '|' + norm(model)
}
function validPhoto(value: string): boolean {
  return /^https:\/\/i\.imgur\.com\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)
}
export async function importLighterPackCatalog(force = false, database: HikingDB = db): Promise<LighterPackImportResult> {
  if (!force && (await database.settings.get(SETTING))?.value === VERSION) {
    return { added:0, existing:0, images:0 }
  }
  const response = await fetch(import.meta.env.BASE_URL + 'seed/lighterpack.json')
  if (!response.ok) throw new Error('Не удалось загрузить каталог LighterPack')
  const data: LPSeed = await response.json()
  if (data.format !== 'hiking-planner-lighterpack' || data.version !== 1 ||
      !Array.isArray(data.lists) || data.lists.length !== 4) {
    throw new Error('Некорректная версия каталога LighterPack')
  }
  for (const list of data.lists) {
    if (!['a9cua5','4pg9c9','gdl4a','0lr1s5'].includes(list.code) ||
        !Array.isArray(list.items) || list.items.length < 10) {
      throw new Error('Неполный список LighterPack')
    }
  }
  return database.transaction('rw', [database.gear, database.sources, database.settings], async () => {
    if (!force && (await database.settings.get(SETTING))?.value === VERSION) {
      return {added:0,existing:0,images:0}
    }
    const gear = await database.gear.toArray()
    const byKey = new Map<string, LibraryRow>(gear.map(item => [key(item.name, item.model), item]))
    const sources = await database.sources.toArray()
    const sourceIds = new Map<string,string>()
    for (const list of data.lists) {
      const current = sources.find(item => item.url === list.url)
      if (current) { sourceIds.set(list.code,current.id); continue }
      const now = new Date().toISOString()
      const source = {id:crypto.randomUUID(),createdAt:now,updatedAt:now,
        title:'LighterPack '+list.code,provider:'LighterPack',url:list.url,
        licence:'',retrievedAt:now.slice(0,10),reliability:'source_recorded',reviewedAt:'',notes:''}
      await database.sources.add(source)
      sourceIds.set(list.code,source.id)
    }
    let added=0, existing=0, images=0
    for (const list of data.lists) {
      for (const item of list.items) {
        if (!item.name || item.name.length > 500 || item.description.length > 500 ||
            (item.weightG !== null && (!Number.isFinite(item.weightG) || item.weightG < 0))) continue
        const title=item.name.trim()
        const description=item.description.trim()
        const ref=key(title,description)
        const photo=validPhoto(item.photoUrl || '') ? item.photoUrl : ''
        const current=byKey.get(ref)
        if (current) {
          existing++
          const changes: Record<string,string|number>={}
          if (photo && !current.photoUrl) { changes.photoUrl=photo; images++ }
          if (typeof item.weightG==='number' && current.listedWeightG == null) {
            changes.listedWeightG=item.weightG
          }
          if (Object.keys(changes).length) {
            changes.updatedAt=new Date().toISOString()
            await database.gear.update(current.id,changes)
            Object.assign(current,changes)
          }
          continue
        }
        const now=new Date().toISOString()
        const row:LibraryRow={
          id:crypto.randomUUID(),createdAt:now,updatedAt:now,
          name:title,brand:'',model:description,category:item.category.trim().slice(0,500),
          manufacturerWeightG:null,listedWeightG:item.weightG,
          photoUrl:photo,sourceRef:sourceIds.get(list.code)||'',notes:''
        }
        await database.gear.add(row)
        byKey.set(ref,row)
        added++
        if (photo) images++
      }
    }
    await database.settings.put({key:SETTING,value:VERSION})
    return {added,existing,images}
  })
}
