import { db, type HikingDB } from './db'
import type { LibraryRow } from '../domain/library'
import { parseGearDescription } from '../domain/gearDescription'

const SETTING = 'lighterpackSeedVersion'
const VERSION = 'lighterpack-v8-semantic-models-v1'
interface LPItem {
  itemId: string; name: string; description: string; category: string
  weightG: number | null; quantity?: number; photoUrl: string; productUrl: string
}
interface LPList { code: string; url: string; items: LPItem[] }
interface LPSeed { format: string; version: number; lists: LPList[] }
export interface LighterPackImportResult { added: number; existing: number; images: number }

const norm = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
const key = (name: unknown, model: unknown) => norm(name) + '|' + norm(model)
const validProductUrl = (url: string) => {
  try { return ['https:', 'http:'].includes(new URL(url).protocol) } catch { return false }
}
const validPhoto = (url: string) => /^https:\/\/i\.imgur\.com\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(url)
const idFor = (list: string, item: string) => list + ':' + item
const keysFor = (row: LibraryRow): string[] =>
  String(row.sourceEntryKeys ?? '').split('|').filter(Boolean)

export async function importLighterPackCatalog(force = false, database: HikingDB = db): Promise<LighterPackImportResult> {
  const response = await fetch(import.meta.env.BASE_URL + 'seed/lighterpack.json')
  if (!response.ok) throw new Error('Не удалось загрузить каталог LighterPack')
  const data: LPSeed = await response.json()
  if (data.format !== 'hiking-planner-lighterpack' || data.version !== 1 ||
      !Array.isArray(data.lists) || data.lists.length !== 4) throw new Error('Неизвестная версия LighterPack')
  const imageResponse = await fetch(import.meta.env.BASE_URL + 'seed/drive-image-manifest.json')
  if (!imageResponse.ok) throw new Error('Не удалось загрузить фотографии снаряжения')
  const manifest: {version:number; images:Record<string,{path:string;match:string}>} = await imageResponse.json()
  if (manifest.version !== 1 || typeof manifest.images !== 'object') throw new Error('Некорректная карта фотографий')
  const revision = VERSION + ':photos-' + Object.keys(manifest.images).length
  if (!force && (await database.settings.get(SETTING))?.value === revision)
    return {added:0,existing:0,images:0}
  for (const list of data.lists)
    if (!['a9cua5','4pg9c9','gdl4a','0lr1s5'].includes(list.code) || !Array.isArray(list.items) || list.items.length < 10)
      throw new Error('Неполный список LighterPack')

  return database.transaction('rw', [database.gear,database.ownedGear,database.sources,database.settings], async () => {
    if (!force && (await database.settings.get(SETTING))?.value === revision)
      return {added:0,existing:0,images:0}
    const gear = await database.gear.toArray()
    const bySource = new Map<string, LibraryRow>()
    const byUndescribed = new Map<string, LibraryRow>()
    const plainKey=(name:unknown,weight:unknown,photo:unknown)=>key(name,weight)+'|'+norm(photo)
    const byRaw = new Map<string, LibraryRow>()
    const byModel = new Map<string, LibraryRow[]>()
    for (const row of gear) {
      for (const sourceKey of keysFor(row)) bySource.set(sourceKey,row)
      byRaw.set(key(row.name,row.sourceDescription || row.model), row)
      if (!row.model && !row.sourceDescription) byUndescribed.set(plainKey(row.name,row.listedWeightG,row.photoUrl),row)
      const model = norm(row.model)
      if (model.length < 4) continue
      byModel.set(key(row.name,model),[...(byModel.get(key(row.name,model)) ?? []),row])
    }
    const sources = await database.sources.toArray()
    const sourceIds = new Map<string,string>()
    for (const list of data.lists) {
      const found = sources.find(row => row.url === list.url)
      if (found) {sourceIds.set(list.code,found.id);continue}
      const now = new Date().toISOString()
      const source:LibraryRow = {id:crypto.randomUUID(),createdAt:now,updatedAt:now,
        title:'LighterPack '+list.code,provider:'LighterPack',url:list.url,
        licence:'',retrievedAt:now.slice(0,10),reliability:'source_recorded',reviewedAt:'',notes:''}
      await database.sources.add(source)
      sourceIds.set(list.code,source.id)
    }
    const owned = await database.ownedGear.toArray()
    const byOwned = new Map<string,LibraryRow[]>()
    for(const row of owned) {
      const gearId=String(row.catalogItemId)
      byOwned.set(gearId,[...(byOwned.get(gearId) ?? []),row])
    }
    let added = 0, existing = 0, images = 0
    for (const list of data.lists) for (const item of list.items) {
      if (!item.name || item.name.length > 500 || String(item.description ?? '').length > 500 ||
          (item.weightG !== null && (!Number.isFinite(item.weightG) || item.weightG < 0))) continue
      const description=String(item.description ?? '')
      const parsed = parseGearDescription(description,item.name)
      const identifier = idFor(list.code,item.itemId)
      const rawKey = key(item.name,description)
      const normalizedKey = key(item.name,parsed.model)
      const candidates = byModel.get(normalizedKey) ?? []
      const current = bySource.get(identifier) ||
        (description ? byRaw.get(rawKey) : byUndescribed.get(plainKey(item.name,item.weightG,item.photoUrl))) ||
        (description && candidates.length === 1 && norm(candidates[0].sourceDescription || candidates[0].model) === norm(description)
          ? candidates[0] : undefined)
      const photo=validPhoto(item.photoUrl || '') ? item.photoUrl : ''
      const productUrl=validProductUrl(item.productUrl || '') ? item.productUrl : ''
      const fromDrive=manifest.images[identifier]
      const drivePath = fromDrive?.match === 'exact-model' && typeof fromDrive.path === 'string' &&
        /^seed\/photos\/(?:gear-\d+|lp-[a-z0-9]+-\d+)\.jpg$/.test(fromDrive.path) ? fromDrive.path : ''
      let linked:LibraryRow
      if (current) {
        linked=current;existing++
        const changes: Record<string,string|number|null>={}
        if (!current.brand && parsed.brand) changes.brand=parsed.brand
        const sourceHeading = description.split(/,\s+/)[0]?.trim() ?? ''
        const generatedModel = norm(current.model) === norm(description) ||
          (parsed.model === '' && norm(current.model) === norm(sourceHeading))
        if (generatedModel && norm(current.model) !== norm(parsed.model)) changes.model=parsed.model
        if (!current.sourceDescription && description) changes.sourceDescription=description
        for (const field of ['lengthCm','widthCm','thicknessCm','rValue'] as const)
          if (current[field] == null && parsed[field] !== null) changes[field]=parsed[field]
        if (!current.temperatureHint && parsed.temperatureHint) changes.temperatureHint=parsed.temperatureHint
        if (!current.specifications && parsed.specifications) changes.specifications=parsed.specifications
        if (photo && !current.photoUrl) { changes.photoUrl=photo; images++ }
        if (drivePath && !current.photoPath) {changes.photoPath=drivePath; changes.photoMatch='exact'}
        if (productUrl && !current.productUrl) changes.productUrl=productUrl
        if (typeof item.weightG==='number' && current.listedWeightG == null) changes.listedWeightG=item.weightG
        const updatedKeys=new Set([...keysFor(current),identifier])
        if (updatedKeys.size !== keysFor(current).length) changes.sourceEntryKeys=[...updatedKeys].join('|')
        if (Object.keys(changes).length) {
          changes.updatedAt=new Date().toISOString()
          await database.gear.update(current.id,changes)
          Object.assign(current,changes)
        }
      } else {
        const now=new Date().toISOString()
        linked={id:crypto.randomUUID(),createdAt:now,updatedAt:now,
          name:item.name.trim(),brand:parsed.brand,model:parsed.model,category:item.category.slice(0,500),
          lengthCm:parsed.lengthCm,widthCm:parsed.widthCm,thicknessCm:parsed.thicknessCm,
          rValue:parsed.rValue,temperatureHint:parsed.temperatureHint,specifications:parsed.specifications,
          sourceDescription:description,sourceEntryKeys:identifier,
          manufacturerWeightG:null,listedWeightG:item.weightG,
          photoUrl:photo,productUrl,photoPath:drivePath,photoMatch:drivePath?'exact':null,
          sourceRef:sourceIds.get(list.code)||'',notes:''}
        await database.gear.add(linked)
        added++
        if(photo)images++
        if(description) byRaw.set(rawKey,linked)
        else byUndescribed.set(plainKey(item.name,item.weightG,item.photoUrl),linked)
        byModel.set(normalizedKey,[...(byModel.get(normalizedKey) ?? []),linked])
      }
      bySource.set(identifier,linked)
      // The user confirmed that entries in these personal lists are owned.
      // Repeated appearances in different LighterPack lists do NOT add quantities together.
      const quantity = Number.isInteger(item.quantity) && (item.quantity ?? 0) > 0
        ? Math.min(999,item.quantity as number) : 1
      const personal = byOwned.get(linked.id) ?? []
      if (personal.length) {
        const first=personal[0]
        const patch:Record<string,string|number>={}
        if (first.ownershipStatus !== 'confirmed') patch.ownershipStatus='confirmed'
        if (typeof first.quantityOwned!=='number' || first.quantityOwned < quantity)
          patch.quantityOwned=quantity
        if (Object.keys(patch).length) {
          patch.updatedAt=new Date().toISOString()
          await database.ownedGear.update(first.id,patch)
          Object.assign(first,patch)
        }
      } else {
        const now=new Date().toISOString()
        const own:LibraryRow={id:crypto.randomUUID(),createdAt:now,updatedAt:now,
          catalogItemId:linked.id,nickname:parsed.model||item.name.trim(),
          measuredWeightG:null,quantityOwned:quantity,ownershipStatus:'confirmed',notes:''}
        await database.ownedGear.add(own)
        byOwned.set(linked.id,[own])
      }
    }
    await database.settings.put({key:SETTING,value:revision})
    return {added,existing,images}
  })
}
