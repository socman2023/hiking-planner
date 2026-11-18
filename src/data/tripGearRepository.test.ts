import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HikingDB } from './db'
import { createTrip, duplicateTrip, deleteTrip } from './tripRepository'
import { makeBackup, parseBackup, restoreBackup } from './backup'
import { saveLibraryRow } from './libraryRepository'
import { saveTripGear, deleteTripGear, getTripGear } from './tripGearRepository'

let database: HikingDB
const params = {title:'Альпы',regionLabel:'',activityType:'hiking' as const,
  startDate:'2027-07-01',dayCount:2,notes:''}
beforeEach(()=>{database=new HikingDB('tripgear-'+crypto.randomUUID())})
afterEach(async()=>{await database.delete()})
describe('снаряжение конкретного похода',()=>{
  it('не меняет общий каталог и хранит разные места одного предмета в двух походах', async()=>{
    const first=await createTrip(params,database)
    const second=await createTrip({...params,title:'Второй поход'},database)
    const gear=await saveLibraryRow('gear',{name:'Горелка',model:'JetBoil MicroMo'},undefined,database)
    const input={gearId:gear.id,quantity:1,placement:'джетбойл',carryMode:'pack' as const,packed:false,notes:''}
    await saveTripGear(first.id,input,undefined,database)
    await saveTripGear(second.id,{...input,placement:'внешний карман'},undefined,database)
    expect((await getTripGear(first.id,database))[0].placement).toBe('джетбойл')
    expect((await getTripGear(second.id,database))[0].placement).toBe('внешний карман')
    expect((await database.gear.get(gear.id))?.notes).toBe('')
  })
  it('копирует комплект отдельно и очищает только при удалении похода',async()=>{
    const trip=await createTrip(params,database)
    const gear=await saveLibraryRow('gear',{name:'Тент'},undefined,database)
    const row=await saveTripGear(trip.id,{gearId:gear.id,quantity:2,placement:'основной отсек',carryMode:'pack',
      packed:true,notes:''},undefined,database)
    const copy=await duplicateTrip(trip.id,database)
    const copied=await getTripGear(copy.id,database)
    expect(copied).toHaveLength(1)
    expect(copied[0].id).not.toBe(row.id)
    await deleteTrip(trip.id,database)
    expect(await getTripGear(trip.id,database)).toHaveLength(0)
    expect(await getTripGear(copy.id,database)).toHaveLength(1)
    await deleteTripGear(copy.id,copied[0].id,database)
    expect(await database.gear.count()).toBe(1)
  })
  it('включает список размещения в бэкап v3 и восстанавливает его',async()=>{
    const trip=await createTrip(params,database)
    const gear=await saveLibraryRow('gear',{name:'Тент'},undefined,database)
    const row=await saveTripGear(trip.id,{gearId:gear.id,quantity:1,placement:'снаружи',
      carryMode:'outside',packed:true,notes:'крепление'},undefined,database)
    const backup=await makeBackup(database)
    expect(backup.schemaVersion).toBe(3)
    expect(backup.data.tripGear).toHaveLength(1)
    await deleteTripGear(trip.id,row.id,database)
    await restoreBackup(parseBackup(JSON.stringify(backup)),database)
    expect((await getTripGear(trip.id,database))[0].placement).toBe('снаружи')
  })
})
