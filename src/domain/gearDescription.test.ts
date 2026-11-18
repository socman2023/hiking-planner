import { describe, expect, it } from 'vitest'
import { parseGearDescription } from './gearDescription'

describe('separating brand, model and gear specifications', () => {
  it('parses the exact Therm-A-Rest NeoAir Uberlite entry without altering source values', () => {
    expect(parseGearDescription('Therm-A-Rest NeoAir Uberlite, 183*51*6,4 см, R-Value 2.0, до 0', 'Коврик надувной')).toEqual({
      brand: 'Therm-A-Rest', model: 'NeoAir Uberlite',
      lengthCm: 183, widthCm: 51, thicknessCm: 6.4,
      rValue: 2.0, temperatureHint: 'до 0', specifications: '',
    })
  })
  it('keeps common product variants and incidental details distinct', () => {
    expect(parseGearDescription('Samsung Galaxy S22 Ultra, с чехлом', 'Смартфон')).toMatchObject({
      brand: 'Samsung', model: 'Galaxy S22 Ultra', specifications: 'с чехлом',
    })
    expect(parseGearDescription('Nordway Trekker 75, серо-синий', 'Рюкзак')).toMatchObject({
      brand: 'Nordway', model: 'Trekker 75', specifications: 'серо-синий',
    })
  })
  it('does not repeat a known brand in the model when no model is supplied', () => {
    expect(parseGearDescription('Splav, титан', 'Кружка')).toMatchObject({
      brand: 'Splav', model: '', specifications: 'титан',
    })
    expect(parseGearDescription('Nordway', 'Сидушка складная')).toMatchObject({
      brand: 'Nordway', model: '',
    })
  })
  it('extracts two-axis dimensions even when dimensions are the entire heading', () => {
    expect(parseGearDescription('210*150 см, китайский', 'Футпринт')).toMatchObject({
      brand: '', model: '', lengthCm: 210, widthCm: 150,
      thicknessCm: null, specifications: 'китайский',
    })
    expect(parseGearDescription('RedFox, 3*3 м', 'Тент')).toMatchObject({
      brand: 'Red Fox', model: '', lengthCm: 300, widthCm: 300,
    })
  })
  it('parses R-Value separated by a dash and comma decimal', () => {
    expect(parseGearDescription('Klymit Static V Luxe, 193*76*7,6 см, R-Value - 1,3, до +8', 'Коврик надувной')).toMatchObject({
      brand: 'Klymit', model: 'Static V Luxe', lengthCm: 193, widthCm: 76,
      thicknessCm: 7.6, rValue: 1.3, temperatureHint: 'до +8',
    })
  })
  it('never invents a brand or drops a suffix when it cannot identify one', () => {
    const parsed = parseGearDescription('Модель без марки, особый вариант', 'Укрытие')
    expect(parsed).toMatchObject({
      brand: '', model: 'Модель без марки', specifications: 'особый вариант',
      lengthCm: null, temperatureHint: '',
    })
  })
})
