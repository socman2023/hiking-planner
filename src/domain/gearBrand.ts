const brands = [
 'Sea to Summit','SeaToSummit','The North Face','Big Agnes','Red Fox','RedFox','Six Moon Designs','3F UL Gear','Active Leisure','Gear Aid','Fire-Maple','Therm-A-Rest','Light My Fire',
 'Jetboil','JetBoil','Splav','Sivera','Osprey','Quechua','Samsung','Tatonka','Track','MSR','Nitecore','Nordway','Lixada','Petzl','Klymit','Glissade','Platypus','Garmin','Bask','Buff','Forclaz','Victorinox',
 'Kovea','Wildo','Leki','Sawyer','Inov-8','DexShell','Columbia','Salomon','Naturehike','Fjallraven','Fenix','Camp','RaidLight','Gerber','Ganzo','Leatherman','Fiskars','Morakniv','Rivacase',
 'Huadang','Northland','Outventure','Marmot','Sirex','Ecos','Yeti','Cocoon','Solognac','Tramp','Slacker','Carp','Toaks','Crow','Had','Polartec','Sony','Baseus','Duracell','Energizer','Aptonia',
 'PackTowl','Snow','Tomshoo','Rene','Arepo','ВТС','Следопыт','Экспедиция','Сойка','Дельфин','Спас-4','McNett','ParkTool','StS','Sea','Gas Can','Boyscout','Procamptek','NZ'
].sort((a,b)=>b.length-a.length)
export function detectGearBrand(description: unknown, name: unknown = ''): string {
  for (const text of [String(description ?? '').trim(), String(name ?? '').trim()]) {
    for (const brand of brands) {
      if (!text.toLocaleLowerCase('ru').startsWith(brand.toLocaleLowerCase('ru'))) continue
      const next = text.slice(brand.length,brand.length + 1)
      if (next && !/[\s,.:;()\[\]\/—+\-]/.test(next)) continue
      if (brand === 'SeaToSummit' || brand === 'StS') return 'Sea to Summit'
      if (brand === 'RedFox') return 'Red Fox'
      if (brand === 'JetBoil') return 'Jetboil'
      return brand
    }
  }
  return ''
}
