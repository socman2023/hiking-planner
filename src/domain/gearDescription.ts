import { detectGearBrand } from './gearBrand'

export interface ParsedGearDescription {
  brand: string
  model: string
  lengthCm: number | null
  widthCm: number | null
  thicknessCm: number | null
  rValue: number | null
  temperatureHint: string
  specifications: string
}
const aliases = [
  ['SeaToSummit', 'Sea to Summit'], ['StS', 'Sea to Summit'],
  ['RedFox', 'Red Fox'], ['JetBoil', 'Jetboil'],
] as const
function leadingBrand(text: string, detected: string): string {
  const spellings = [detected, ...aliases.filter(([, canonical]) => canonical === detected).map(([alias]) => alias)]
    .filter(Boolean).sort((a, b) => b.length - a.length)
  return spellings.find(brand => text.toLocaleLowerCase('ru').startsWith(brand.toLocaleLowerCase('ru')) &&
    (text.length === brand.length || /[\s,.:;()\/—+-]/.test(text[brand.length]))) ?? ''
}
function numeric(raw: string): number { return Number(raw.replace(',', '.')) }

/**
 * Preserve the user's source wording when parsing is not unambiguous.
 * Only "comma followed by whitespace" separates clauses, so 6,4 cm stays intact.
 */
export function parseGearDescription(description: unknown, name: unknown = ''): ParsedGearDescription {
  const source = String(description ?? '').trim().replace(/\s+/g, ' ')
  const parts = source.split(/,\s+/).map(s => s.trim()).filter(Boolean)
  const heading = parts.shift() ?? ''
  const brand = detectGearBrand(source, name)
  const prefix = leadingBrand(heading, brand)
  const modelCandidate = prefix ? heading.slice(prefix.length).replace(/^[\s,:–—-]+/, '').trim() : heading
  // A brand by itself is not a model; dimension-only headings describe a size, not a product.
  const dimensionOnlyHeading = /^\d+(?:[.,]\d+)?\s*[*×xх]\s*\d+(?:[.,]\d+)?(?:\s*[*×xх]\s*\d+(?:[.,]\d+)?)?\s*(?:см|cm|мм|mm|м|m)$/i.test(heading)
  const result: ParsedGearDescription = {
    brand, model: dimensionOnlyHeading ? '' : modelCandidate,
    lengthCm: null, widthCm: null, thicknessCm: null,
    rValue: null, temperatureHint: '', specifications: '',
  }
  const rest: string[] = []
  for (const part of dimensionOnlyHeading ? [heading, ...parts] : parts) {
    const dimensions = part.match(/^(\d+(?:[.,]\d+)?)\s*[*×xх]\s*(\d+(?:[.,]\d+)?)(?:\s*[*×xх]\s*(\d+(?:[.,]\d+)?))?\s*(см|cm|мм|mm|м|m)$/i)
    if (dimensions) {
      const scale = /^(?:мм|mm)$/i.test(dimensions[4]) ? 0.1 : /^(?:м|m)$/i.test(dimensions[4]) ? 100 : 1
      result.lengthCm = numeric(dimensions[1]) * scale
      result.widthCm = numeric(dimensions[2]) * scale
      if (dimensions[3]) result.thicknessCm = numeric(dimensions[3]) * scale
      continue
    }
    const r = part.match(/^R[\s-]*Value\s*[-:=]?\s*(\d+(?:[.,]\d+)?)$/i)
    if (r) { result.rValue = numeric(r[1]); continue }
    if (/^до\s*[+-]?\d+(?:[.,]\d+)?\s*(?:°\s?[cс])?$/i.test(part)) {
      result.temperatureHint = part
      continue
    }
    rest.push(part)
  }
  result.specifications = rest.join(', ')
  return result
}
