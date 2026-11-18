import { db, type HikingDB } from './db'

// In both original Excel workbooks the candy row contains five candies per day,
// 20 candies in total and a weight of three grams per individual candy.
// Retail package size is not documented by these rows.
export async function correctImportedFoodUnits(database: HikingDB = db): Promise<number> {
  return database.transaction('rw', [database.foods, database.packages, database.sources], async () => {
    const sourceIds = new Set((await database.sources.toArray())
      .filter(s => String(s.provider ?? '') === 'Пользовательский файл' &&
        /(?:Крым|Архыз)/.test(String(s.title ?? ''))).map(s => s.id))
    let changed = 0
    for (const pack of await database.packages.toArray()) {
      if (!sourceIds.has(String(pack.sourceRef ?? ''))) continue
      if (pack.netWeightG !== 3) continue
      const food = await database.foods.get(String(pack.foodProductId))
      if (!food || String(food.name).trim().toLocaleLowerCase('ru') !== 'карамель леденцовая') continue
      const brand = String(food.brand ?? '').trim().toLocaleLowerCase('ru')
      if (!['sula','малютка'].includes(brand)) continue
      if (pack.label === '1 леденец (3 г)' && pack.unitKind === 'piece') continue
      // Only change automatically generated source labels, not user-created packages.
      if (!/^(?:Упаковка|Единица) 3 г$|^1 леденец \(3 г\)$/i.test(String(pack.label ?? ''))) continue
      await database.packages.update(pack.id, {
        label: '1 леденец (3 г)', unitKind: 'piece', updatedAt: new Date().toISOString(),
      })
      changed++
    }
    return changed
  })
}
