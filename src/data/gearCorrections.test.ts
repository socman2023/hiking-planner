import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { HikingDB } from './db'
import { saveLibraryRow } from './libraryRepository'
import { correctImportedGearFields, confirmSpreadsheetGearOwnership } from './gearCorrections'

it('normalizes source pad metadata and confirms only one owned item across two historical hike lists', async () => {
  const db = new HikingDB('gear-normalize-'+crypto.randomUUID())
  try {
    const source=await saveLibraryRow('sources',{title:'Архыз 4 дня — исходная Excel-книга',
      provider:'Пользовательский файл'},undefined,db)
    const gear=await saveLibraryRow('gear',{
      name:'Коврик надувной',brand:'Therm-A-Rest',
      model:'Therm-A-Rest NeoAir Uberlite, 183*51*6,4 см, R-Value 2.0, до 0',
      manufacturerWeightG:245,sourceRef:source.id,
    },undefined,db)
    await saveLibraryRow('ownedGear',{
      catalogItemId:gear.id,nickname:'Коврик надувной — Архыз 4 дня',
      measuredWeightG:245,quantityOwned:1,ownershipStatus:'unverified',
    },undefined,db)
    await saveLibraryRow('ownedGear',{
      catalogItemId:gear.id,nickname:'Коврик надувной — Крым 4 дня',
      measuredWeightG:245,quantityOwned:1,ownershipStatus:'unverified',
    },undefined,db)
    expect(await correctImportedGearFields(db)).toBe(1)
    const changed=await db.gear.get(gear.id)
    expect(changed).toMatchObject({
      brand:'Therm-A-Rest',model:'NeoAir Uberlite',
      lengthCm:183,widthCm:51,thicknessCm:6.4,rValue:2,
      temperatureHint:'до 0',listedWeightG:245,manufacturerWeightG:null,
    })
    expect(await confirmSpreadsheetGearOwnership(db)).toBeGreaterThanOrEqual(1)
    const owned=(await db.ownedGear.toArray()).filter(x=>x.catalogItemId===gear.id)
    expect(owned).toHaveLength(1)
    expect(owned[0]).toMatchObject({
      nickname:'NeoAir Uberlite',ownershipStatus:'confirmed',quantityOwned:1,measuredWeightG:null,
    })
    expect(await confirmSpreadsheetGearOwnership(db)).toBe(0)
  } finally { await db.delete() }
})
