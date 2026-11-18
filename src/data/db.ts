import Dexie, { type Table } from 'dexie'
import type { AppSetting, Trip, TripDay } from '../domain/trips'

export class HikingDB extends Dexie {
  trips!: Table<Trip, string>
  days!: Table<TripDay, string>
  settings!: Table<AppSetting, string>

  constructor(name = 'hiking-planner') {
    super(name)
    this.version(1).stores({
      trips: 'id, status, startDate, updatedAt',
      days: 'id, tripId, [tripId+date]',
      settings: 'key',
    })
  }
}

export const db = new HikingDB()
