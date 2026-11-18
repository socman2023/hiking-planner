import Dexie, { type Table } from 'dexie'
import type { AppSetting, Trip, TripDay } from '../domain/trips'
import type { LibraryRow } from '../domain/library'

export class HikingDB extends Dexie {
  trips!: Table<Trip, string>
  days!: Table<TripDay, string>
  settings!: Table<AppSetting, string>
  foods!: Table<LibraryRow, string>
  packages!: Table<LibraryRow, string>
  dishes!: Table<LibraryRow, string>
  ingredients!: Table<LibraryRow, string>
  gear!: Table<LibraryRow, string>
  ownedGear!: Table<LibraryRow, string>
  medical!: Table<LibraryRow, string>
  medicalPacks!: Table<LibraryRow, string>
  sources!: Table<LibraryRow, string>

  constructor(name = 'hiking-planner') {
    super(name)
    this.version(1).stores({
      trips: 'id, status, startDate, updatedAt',
      days: 'id, tripId, [tripId+date]',
      settings: 'key',
    })
    // An additive migration: existing hikes, calendar days and settings remain untouched.
    this.version(2).stores({
      trips: 'id, status, startDate, updatedAt',
      days: 'id, tripId, [tripId+date]',
      settings: 'key',
      foods: 'id, name, category, updatedAt',
      packages: 'id, foodProductId',
      dishes: 'id, title, category',
      ingredients: 'id, dishId, productId',
      gear: 'id, name, category',
      ownedGear: 'id, catalogItemId',
      medical: 'id, tradeName, kind',
      medicalPacks: 'id, catalogItemId, expiryDate',
      sources: 'id, provider, title',
    })
  }
}

export const db = new HikingDB()
