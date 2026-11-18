import { db, type HikingDB } from './db'

// Correct only the source-backed Sula example. The original Excel row records
// 5 sweets each day, 20 sweets total and 3 g for a single sweet (60 g total).
// This is NOT evidence of a manufacturer's retail package.
export async function correctImportedFoodUnits(database: HikingDB = db): Promise<number> {
  return database.transaction('rw', database.foods, database.packages, async () => {
    const foods = await database.foods.filter(row =>
      String(row.name ?? '').trim().toLocaleLowerCase('ru') === 'карамель леденцовая' &&
      String(row.brand ?? '').trim().toLocaleLowerCase('ru') === 'sula').toArray()
    let changed = 0
    for (const food of foods) {
      const related = await database.packages.where('foodProductId').equals(food.id).toArray()
      for (const pack of related) {
        if (pack.netWeightG !== 3 || pack.unitKind === 'piece' ||
          !/^Упаковка\s+3\s*г$/i.test(String(pack.label ?? ''))) continue
        await database.packages.update(pack.id, {
          label: '1 леденец (3 г)', unitKind: 'piece', updatedAt: new Date().toISOString()
        })
        changed++
      }
    }
    return changed
  })
}
