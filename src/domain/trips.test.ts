import { describe, expect, it } from 'vitest'
import { addDays, buildDays, formatRange, validISODate, validateTripInput } from './trips'

const input = {
  title: ' Северный маршрут ', regionLabel: ' Хибины ', activityType: 'mountain' as const,
  startDate: '2028-02-28', dayCount: 3, notes: ' заметка ',
}

describe('календарь похода', () => {
  it('учитывает високосные даты и годовые границы', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })
  it('отвергает некорректные календарные даты', () => {
    expect(validISODate('2026-02-29')).toBe(false)
    expect(validISODate('2028-02-29')).toBe(true)
    expect(validISODate('2026-13-11')).toBe(false)
    expect(() => addDays('2026-02-30', 1)).toThrow()
  })
  it('очищает текст и проверяет длительность', () => {
    expect(validateTripInput(input).title).toBe('Северный маршрут')
    expect(validateTripInput(input).regionLabel).toBe('Хибины')
    expect(() => validateTripInput({ ...input, dayCount: 0 })).toThrow()
    expect(() => validateTripInput({ ...input, title: '' })).toThrow()
  })
  it('сохраняет сведения о днях при сдвиге даты', () => {
    const days = buildDays('trip-1', input.startDate, 3)
    const tagged = days.map((day, i) => ({ ...day, title: i === 1 ? 'Перевал' : '' }))
    const moved = buildDays('trip-1', '2028-04-08', 4, tagged)
    expect(moved.map(d => d.date)).toEqual(['2028-04-08', '2028-04-09', '2028-04-10', '2028-04-11'])
    expect(moved[1].id).toBe(tagged[1].id)
    expect(moved[1].title).toBe('Перевал')
    expect(moved[3].id).not.toBe(tagged[2].id)
    expect(formatRange(input.startDate, 3)).toContain('2028')
  })
})
