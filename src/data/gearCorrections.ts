import { db, type HikingDB } from './db'
import { detectGearBrand } from '../domain/gearBrand'

/** Moves historical Excel weights out of the manufacturer's field.
 * Only original spreadsheet records are eligible; user's own edits and
 * properly sourced manufacturer measurements are not replaced. */
export async function correctImportedGearFields(database: HikingDB = db): Promise<number> {
  return database.transaction('rw', [database.gear,database.sources], async () => {
    const sources = new Set((await database.sources.toArray())
      .filter(s => s.provider === 'Пользовательский файл' && /Крым|Архыз/.test(String(s.title ?? '')))
      .map(s => s.id))
    let count = 0
    for (const row of await database.gear.toArray()) {
      if (!sources.has(String(row.sourceRef ?? ''))) continue
      const patch: Record<string,string|number|null>={}
      if (typeof row.manufacturerWeightG === 'number' && row.listedWeightG == null) {
        patch.listedWeightG = row.manufacturerWeightG
        patch.manufacturerWeightG = null
      }
      const identified = detectGearBrand(row.model, row.name)
      const firstWord = String(row.model ?? '').trim().split(/[\s,]/)[0]
      if (identified && (!row.brand || row.brand === firstWord)) patch.brand=identified
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date().toISOString()
        await database.gear.update(row.id,patch)
        count++
      }
    }
    return count
  })
}

/** Repair clearly identifiable Jetboil brand names in previously imported entries.
 * A verified manufacturer name is distinct from verifying the item's exact SKU or weight. */
export async function correctJetboilBrand(database: HikingDB = db): Promise<number> {
  return database.transaction('rw', database.gear, async () => {
    let changed = 0
    for (const row of await database.gear.toArray()) {
      if (String(row.brand ?? '').trim()) continue
      const name = String(row.name ?? '')
      const model = String(row.model ?? '')
      if (!/(^|[\s,(])jetboil\b/i.test(model) && !/^jetboil\b/i.test(name)) continue
      await database.gear.update(row.id, {brand:'Jetboil',updatedAt:new Date().toISOString()})
      changed++
    }
    return changed
  })
}
