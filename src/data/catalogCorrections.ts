import { db, type HikingDB } from './db'

// Correct only the source-backed Sula example. The original Excel row records
// 5 sweets each day, 20 sweets total and 3 g for a single sweet (60 g total).
// This is NOT evidence of a manufacturer's retail package.
export async function correctImportedFoodUnits(database: HikingDB = db): Promise<number> {
  return database.transaction('rw', [database.foods, database.packages, database.sources], async () => {
    let changed = 0
    const sourceIds = new Set((await database.sources.toArray())
      .filter(s => String(s.provider ?? '') === 'Пользовательский файл' &&
        /(?:Крым|Архыз)/.test(String(s.title ?? ''))).map(s => s.id))
    for (const pack of await database.packages.toArray()) {
      if (!sourceIds.has(String(pack.sourceRef ?? ''))) continue
      const label = String(pack.label ?? '')
      if (!/^Упаковка\s+[\d.,]+\s*г$/i.test(label) || typeof pack.netWeightG !== 'number') continue
      const food = await database.foods.get(String(pack.foodProductId))
      if (!food) continue
      const isSweet = String(food.name).toLocaleLowerCase('ru') === 'карамель леденцовая' &&
        String(food.brand).toLocaleLowerCase('ru') === 'sula' && pack.netWeightG === 3
      const newLabel = isSweet ? '1 леденец (3 г)' : 'Единица ' + pack.netWeightG + ' г'
      await database.packages.update(pack.id, {
        label:newLabel,unitKind:isSweet ? 'piece' : 'unit',updatedAt:new Date().toISOString()
      })
      changed++
    }
    return changed
  })
}
