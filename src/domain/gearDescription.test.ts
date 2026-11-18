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
  it('never invents a brand or drops a suffix when it cannot identify one', () => {
    const parsed = parseGearDescription('Модель без марки, особый вариант', 'Укрытие')
    expect(parsed).toMatchObject({
      brand: '', model: 'Модель без марки', specifications: 'особый вариант',
      lengthCm: null, temperatureHint: '',
    })
  })
})
