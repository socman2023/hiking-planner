import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { HikingDB } from './db'
import { saveLibraryRow } from './libraryRepository'
import { correctImportedFoodUnits } from './catalogCorrections'
it('corrects the sourced 3 g Sula sweet to a piece, without touching unknown packaging', async () => {
  const db=new HikingDB('sula-test-'+crypto.randomUUID())
  try {
    const food=await saveLibraryRow('foods',{name:'Карамель леденцовая',brand:'Sula'},undefined,db)
    const source=await saveLibraryRow('sources',{title:'Архыз 4 дня',provider:'Пользовательский файл'},undefined,db)
    const one=await saveLibraryRow('packages',{label:'Упаковка 3 г',foodProductId:food.id,netWeightG:3,sourceRef:source.id},undefined,db)
    const bulk=await saveLibraryRow('packages',{label:'Коробка 120 г',foodProductId:food.id,netWeightG:120},undefined,db)
    expect(await correctImportedFoodUnits(db)).toBe(1)
    expect((await db.packages.get(one.id))?.unitKind).toBe('piece')
    expect((await db.packages.get(one.id))?.label).toBe('1 леденец (3 г)')
    expect((await db.packages.get(bulk.id))?.unitKind).toBe('')
    expect(await correctImportedFoodUnits(db)).toBe(0)
  } finally { await db.delete() }
})

it('corrects both workbook candy brands, without relabeling other unverified portions', async () => {
  const db=new HikingDB('candy-dual-'+crypto.randomUUID())
  try {
    const src=await saveLibraryRow('sources',{title:'Крым 4 дня',provider:'Пользовательский файл'},undefined,db)
    const malutka=await saveLibraryRow('foods',{name:'Карамель леденцовая',brand:'Малютка'},undefined,db)
    const sweet=await saveLibraryRow('packages',{label:'Упаковка 3 г',foodProductId:malutka.id,netWeightG:3,sourceRef:src.id},undefined,db)
    const other=await saveLibraryRow('foods',{name:'Орехи'},undefined,db)
    const unknown=await saveLibraryRow('packages',{label:'Упаковка 40 г',foodProductId:other.id,netWeightG:40,sourceRef:src.id},undefined,db)
    expect(await correctImportedFoodUnits(db)).toBe(1)
    expect((await db.packages.get(sweet.id))?.label).toBe('1 леденец (3 г)')
    expect((await db.packages.get(sweet.id))?.unitKind).toBe('piece')
    expect((await db.packages.get(unknown.id))?.label).toBe('Упаковка 40 г')
    expect((await db.packages.get(unknown.id))?.unitKind).toBe('')
  } finally { await db.delete() }
})
