import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { HikingDB } from './db'
import { saveLibraryRow } from './libraryRepository'
import { correctImportedFoodUnits } from './catalogCorrections'
it('corrects the sourced 3 g Sula sweet to a piece, without touching unknown packaging', async () => {
  const db=new HikingDB('sula-test-'+crypto.randomUUID())
  try {
    const food=await saveLibraryRow('foods',{name:'Карамель леденцовая',brand:'Sula'},undefined,db)
    const one=await saveLibraryRow('packages',{label:'Упаковка 3 г',foodProductId:food.id,netWeightG:3},undefined,db)
    const bulk=await saveLibraryRow('packages',{label:'Коробка 120 г',foodProductId:food.id,netWeightG:120},undefined,db)
    expect(await correctImportedFoodUnits(db)).toBe(1)
    expect((await db.packages.get(one.id))?.unitKind).toBe('piece')
    expect((await db.packages.get(one.id))?.label).toBe('1 леденец (3 г)')
    expect((await db.packages.get(bulk.id))?.unitKind).toBeUndefined()
    expect(await correctImportedFoodUnits(db)).toBe(0)
  } finally { await db.delete() }
})
