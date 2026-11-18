import { validISODate } from './trips'

export const rootTabs = ['foods', 'dishes', 'gear', 'medical', 'sources'] as const
export type RootTab = typeof rootTabs[number]
export const libraryTables = ['foods', 'packages', 'dishes', 'ingredients', 'gear', 'ownedGear', 'medical', 'medicalPacks', 'sources'] as const
export type LibraryTableName = typeof libraryTables[number]
export type LibraryValue = string | number | boolean | null
export interface LibraryRow {
  id: string
  createdAt: string
  updatedAt: string
  [key: string]: LibraryValue
}
export interface FieldSpec {
  key: string
  label: string
  type?: 'number' | 'date' | 'url' | 'text' | 'textarea' | 'select'
  required?: boolean
  options?: readonly string[]
  hint?: string
}
export interface LibraryDefinition {
  label: string
  singular: string
  title: string
  fields: readonly FieldSpec[]
}
const field = (key: string, label: string, type: FieldSpec['type'] = 'text', required = false, hint = ''): FieldSpec =>
  ({ key, label, type, required, hint })
const category = field('category', 'Категория')
const notes = field('notes', 'Заметки', 'textarea')
const sourceRef = field('sourceRef', 'Источник', 'select')
const grams = (key: string, label: string) => field(key, label, 'number')
export const definitions: Record<LibraryTableName, LibraryDefinition> = {
  foods: {
    label: 'Продукты', singular: 'продукт', title: 'name',
    fields: [field('name', 'Название', 'text', true), field('brand', 'Бренд'), category,
      { ...field('form', 'Форма', 'select'), options: ['unknown', 'dry', 'ready', 'as_packaged'] },
      grams('kcalPer100g', 'Ккал / 100 г'), grams('proteinPer100g', 'Белки / 100 г'),
      grams('fatPer100g', 'Жиры / 100 г'), grams('carbsPer100g', 'Углеводы / 100 г'),
      field('barcode', 'Штрихкод'), sourceRef, notes],
  },
  packages: {
    label: 'Фасовки', singular: 'фасовку', title: 'label',
    fields: [field('foodProductId', 'Продукт', 'select', true), field('label', 'Название фасовки', 'text', true),
      grams('netWeightG', 'Масса продукта, г'), grams('packageWeightG', 'Масса упаковки, г'),
      grams('grossWeightG', 'Полная масса, г'), field('barcode', 'Штрихкод'), sourceRef],
  },
  dishes: {
    label: 'Блюда', singular: 'блюдо', title: 'title',
    fields: [field('title', 'Название блюда', 'text', true), category, field('instruction', 'Приготовление', 'textarea'),
      grams('cookingWaterMl', 'Вода, мл'), sourceRef, notes],
  },
  ingredients: {
    label: 'Ингредиенты', singular: 'ингредиент', title: 'productId',
    fields: [field('dishId', 'Блюдо', 'select', true), field('productId', 'Продукт', 'select', true),
      grams('rawAmountG', 'Масса ингредиента, г'), notes],
  },
  gear: {
    label: 'Снаряжение', singular: 'позицию', title: 'name',
    fields: [field('name', 'Название', 'text', true), field('brand', 'Бренд'), field('model', 'Модель'),
      category, grams('manufacturerWeightG', 'Масса по каталогу, г'), sourceRef, notes],
  },
  ownedGear: {
    label: 'Свои вещи', singular: 'экземпляр', title: 'nickname',
    fields: [field('catalogItemId', 'Каталожный предмет', 'select', true),
      field('nickname', 'Собственное название', 'text', true),
      grams('measuredWeightG', 'Фактическая масса, г'),
      field('quantityOwned', 'Количество', 'number', true), notes],
  },
  medical: {
    label: 'Аптечный каталог', singular: 'позицию', title: 'tradeName',
    fields: [{ ...field('kind', 'Тип', 'select', true), options: ['medicine', 'device'] },
      field('tradeName', 'Название', 'text', true), field('internationalName', 'МНН / описание'),
      field('dosageForm', 'Форма / тип изделия'), field('strength', 'Дозировка / размер'),
      field('manufacturer', 'Производитель'), field('instructionUrl', 'Ссылка на инструкцию', 'url'),
      sourceRef, notes],
  },
  medicalPacks: {
    label: 'Свои упаковки', singular: 'упаковку', title: 'label',
    fields: [field('catalogItemId', 'Позиция каталога', 'select', true),
      field('label', 'Название упаковки', 'text', true),
      field('packageQuantity', 'Количество', 'number', true), field('unit', 'Единицы', 'text', true),
      field('expiryDate', 'Годен до', 'date'), grams('actualWeightG', 'Фактическая масса, г'), notes],
  },
  sources: {
    label: 'Источники', singular: 'источник', title: 'title',
    fields: [field('title', 'Название источника', 'text', true), field('provider', 'Поставщик / организация', 'text', true),
      field('url', 'Ссылка', 'url'), field('licence', 'Лицензия / условия использования'),
      field('retrievedAt', 'Дата получения', 'date'), field('reviewedAt', 'Дата проверки', 'date'),
      notes],
  },
}
export const childByRoot: Partial<Record<RootTab, LibraryTableName>> = {
  foods: 'packages', dishes: 'ingredients', gear: 'ownedGear', medical: 'medicalPacks',
}
export const parentKey: Partial<Record<LibraryTableName, { field: string; table: LibraryTableName }>> = {
  packages: { field: 'foodProductId', table: 'foods' },
  ingredients: { field: 'dishId', table: 'dishes' },
  ownedGear: { field: 'catalogItemId', table: 'gear' },
  medicalPacks: { field: 'catalogItemId', table: 'medical' },
}
export const foreignKeys: Partial<Record<LibraryTableName, Record<string, LibraryTableName>>> = {
  foods: { sourceRef: 'sources' }, dishes: { sourceRef: 'sources' },
  gear: { sourceRef: 'sources' }, medical: { sourceRef: 'sources' },
  packages: { foodProductId: 'foods', sourceRef: 'sources' },
  ingredients: { dishId: 'dishes', productId: 'foods' },
  ownedGear: { catalogItemId: 'gear' }, medicalPacks: { catalogItemId: 'medical' },
}
export function isLibraryTable(value: string): value is LibraryTableName {
  return libraryTables.some(name => name === value)
}
export function validateRow(table: LibraryTableName, input: LibraryRow): void {
  if (!input.id || !input.createdAt || !input.updatedAt || !Number.isFinite(Date.parse(input.createdAt)) ||
    !Number.isFinite(Date.parse(input.updatedAt))) throw new Error('Некорректные служебные поля записи')
  const fields = definitions[table].fields
  if (Object.keys(input).some(key => !['id', 'createdAt', 'updatedAt'].includes(key) && !fields.some(f => f.key === key))) {
    throw new Error('Неизвестное поле каталога')
  }
  for (const spec of fields) {
    const value = input[spec.key]
    if (spec.required && (value === null || value === '' || value === undefined)) {
      throw new Error('Заполните поле «' + spec.label + '»')
    }
    if (value === undefined || value === null || value === '') continue
    if (spec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
          ((spec.key === 'quantityOwned' || spec.key === 'packageQuantity') && (!Number.isInteger(value) || value < 1))) {
        throw new Error('Недопустимое значение поля «' + spec.label + '»')
      }
    } else {
      if (typeof value !== 'string' || value.length > (spec.type === 'textarea' ? 5000 : 500)) {
        throw new Error('Недопустимое значение поля «' + spec.label + '»')
      }
      if (spec.type === 'date' && !validISODate(value)) throw new Error('Некорректная дата: ' + spec.label)
      if (spec.type === 'url' && value && (!/^https?:\/\//i.test(value) || !safeHttpUrl(value))) {
        throw new Error('Нужна ссылка http или https: ' + spec.label)
      }
      if (spec.options && !spec.options.includes(value)) throw new Error('Недопустимый вариант: ' + spec.label)
    }
  }
}
function safeHttpUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}
export function normalizeRow(table: LibraryTableName, values: Record<string, unknown>, existing?: LibraryRow): LibraryRow {
  const now = new Date().toISOString()
  const row: LibraryRow = { id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now }
  for (const spec of definitions[table].fields) {
    const v = values[spec.key]
    if (spec.type === 'number') row[spec.key] = v === null || v === undefined || String(v).trim() === '' ? null : Number(v)
    else row[spec.key] = String(v ?? '').trim() || (spec.key === 'form' ? 'unknown' : '')
  }
  validateRow(table, row)
  return row
}
