import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArchiveRestore, BookOpen, CircleHelp, Download, FileUp, Pencil, Plus, Search,
  ShieldCheck, Trash2, X,
} from 'lucide-react'
import {
  childByRoot, definitions, parentKey, rootTabs,
  getLibraryPhotos, getSeedPhotoPath, getFullImgurImage, type FieldSpec, type LibraryRow, type LibraryTableName, type RootTab,
} from './domain/library'
import {
  deleteLibraryRow, exportLibraryCsv, makeLibraryArchive, parseLibraryArchive,
  readLibrary, replaceLibrary, saveJsonFile, saveLibraryRow, type LibraryArchive, type LibraryData,
} from './data/libraryRepository'
import './library.css'
import { LibraryPhotos } from './LibraryPhotos'
import { importXlsxCatalog } from './data/importXlsxSeed'
import { cleanImportedLibraryNotes } from './data/cleanLibraryNotes'
import { correctImportedFoodUnits } from './data/catalogCorrections'
import { correctImportedGearFields, correctJetboilBrand, confirmSpreadsheetGearOwnership } from './data/gearCorrections'
import { attachVerifiedGearPhotos } from './data/gearPhotoSeed'
import { importLighterPackCatalog } from './data/importLighterPackSeed'

type Editor = { table: LibraryTableName; row?: LibraryRow; preset?: Record<string, string> }
type Notice = { text: string; error: boolean }
const tabInfo: Record<RootTab, string> = {
  foods: 'Продукты питания и их фасовки',
  dishes: 'Рецепты и ингредиенты из продуктового каталога',
  gear: 'Модели и характеристики вещей из ваших списков; количество экземпляров учитывается отдельно',
  medical: 'Лекарства, изделия и реальные упаковки',
  sources: 'Происхождение сведений и официальные ссылки',
}
const enumLabels: Record<string, string> = {
  unknown: 'Неизвестно', dry: 'Сухой продукт', ready: 'Готовый продукт',
  as_packaged: 'Как в упаковке', medicine: 'Лекарство', device: 'Медицинское изделие',
  unreviewed: 'Не проверено', source_recorded: 'Источник указан', user_verified: 'Проверено вручную',
  package:'Упаковка',piece:'Поштучно',portion:'Порция',confirmed:'Подтверждено',unverified:'Не подтверждено',
}

function coverFor(row: LibraryRow): string | null {
  const local = getLibraryPhotos(row)[0]?.src
  if (local) return local
  const path = getSeedPhotoPath(row)
  if (path) return import.meta.env.BASE_URL + path
  return getFullImgurImage(row.photoUrl)
}

function titleOf(table: LibraryTableName, item: LibraryRow): string {
  return String(item[definitions[table].title] || 'Без названия')
}
function showValue(field: FieldSpec, value: unknown, library: LibraryData): string {
  if (value === null || value === undefined || value === '') return 'Не указано'
  if (field.key === 'sourceRef') return library.sources.find(item => item.id === value)?.title as string || 'Источник не найден'
  return enumLabels[String(value)] || String(value)
}
function FieldEditor({ spec, value, onChange, rows, fixed }: {
  spec: FieldSpec
  value: string
  onChange: (value: string) => void
  rows: LibraryData
  fixed?: boolean
}) {
  const referenceTable: Record<string, LibraryTableName> = {
    sourceRef: 'sources', foodProductId: 'foods', dishId: 'dishes',
    productId: 'foods', catalogItemId: 'gear',
  }
  // The same key belongs to gear and medical packs in different editors;
  // caller overrides the options with rows chosen for the actual table.
  const linked = referenceTable[spec.key]
  const inputId = 'library-field-' + spec.key
  return (
    <label className="library-field" htmlFor={inputId}>
      <span>{spec.label}{spec.required && <b> *</b>}</span>
      {fixed ? (
        <input id={inputId} aria-label={spec.label} disabled value={linked ? (rows[linked].find(r => r.id === value) ?
          titleOf(linked, rows[linked].find(r => r.id === value)!) : value) : value} />
      ) : spec.type === 'textarea' ? (
        <textarea id={inputId} aria-label={spec.label} rows={3} maxLength={5000} value={value} onChange={event => onChange(event.target.value)} />
      ) : spec.type === 'select' ? (
        <select id={inputId} aria-label={spec.label} value={value} required={spec.required} onChange={event => onChange(event.target.value)}>
          <option value="" disabled={Boolean(spec.required)}>{spec.required ? 'Выберите…' : 'Не указано'}</option>
          {spec.options ? spec.options.map(option =>
            <option key={option} value={option}>{enumLabels[option] ?? option}</option>) :
            (linked ? rows[linked] : []).map(entry =>
              <option key={entry.id} value={entry.id}>{titleOf(linked, entry)}</option>)}
        </select>
      ) : (
        <input id={inputId} aria-label={spec.label} type={spec.type === 'number' ? 'number' :
          spec.type === 'date' ? 'date' : spec.type === 'url' ? 'url' : 'text'}
          min={spec.type === 'number' ? '0' : undefined}
          step={spec.type === 'number' ? 'any' : undefined}
          maxLength={spec.type === 'text' ? 500 : undefined}
          required={spec.required} value={value} onChange={event => onChange(event.target.value)}
          placeholder={spec.type === 'number' ? 'Неизвестно — оставить пустым' : undefined} />
      )}
      {spec.hint && <small>{spec.hint}</small>}
    </label>
  )
}

function LibraryEditor({ editing, library, onClose, onSaved }: {
  editing: Editor; library: LibraryData; onClose: () => void; onSaved: (text: string) => void
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {}
    for (const spec of definitions[editing.table].fields) {
      values[spec.key] = String(editing.preset?.[spec.key] ?? editing.row?.[spec.key] ??
        (spec.key === 'form' ? 'unknown' : spec.key === 'kind' ? 'medicine' :
          spec.key === 'quantityOwned' || spec.key === 'packageQuantity' ? '1' : ''))
    }
    return values
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fixed] = useState(() => new Set(Object.keys(editing.preset ?? {})))
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await saveLibraryRow(editing.table, fields, editing.row?.id)
      onSaved('Запись сохранена в локальной библиотеке')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить запись')
    } finally { setBusy(false) }
  }
  return (
    <div className="library-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="library-modal" role="dialog" aria-modal="true" aria-label="Редактор библиотеки">
        <div className="library-modal-top">
          <div><p className="eyebrow">ЛИЧНАЯ БИБЛИОТЕКА</p>
            <h2>{editing.row ? 'Редактировать' : 'Добавить'} {definitions[editing.table].singular}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть" disabled={busy}><X size={20} /></button>
        </div>
        <form onSubmit={event => void submit(event)}>
          <div className="library-form-fields">
            {definitions[editing.table].fields.filter(spec => editing.table !== 'gear' ||
              !['photoUrl','manufacturerWeightG','sourceDescription','sourceEntryKeys'].includes(spec.key)
            ).map(spec => {
              // Disambiguate the polymorphic catalogItemId reference.
              const actualRows = spec.key === 'catalogItemId' && editing.table === 'medicalPacks' ?
                { ...library, gear: library.medical } : library
              return <FieldEditor key={spec.key} spec={spec} rows={actualRows} fixed={fixed.has(spec.key)}
                value={fields[spec.key] ?? ''} onChange={value => setFields(current => ({ ...current, [spec.key]: value }))} />
            })}
          </div>
          {editing.table === 'medical' && <p className="library-help">Сохраняйте ссылку на официальную инструкцию. Приложение не проверяет медицинские назначения и не предлагает лечение.</p>}
          {editing.table === 'medicalPacks' && <p className="library-help">Срок годности относится к конкретной упаковке. Неизвестную дату оставляйте пустой.</p>}
          {error && <p className="library-error" role="alert">{error}</p>}
          <div className="library-modal-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Отмена</button>
            <button className="button primary" type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function LibraryPage() {
  const library = useLiveQuery(readLibrary, [])
  const [tab, setTab] = useState<RootTab>('foods')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editor | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, setPending] = useState<LibraryArchive | null>(null)
  const [busy, setBusy] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [seedStatus, setSeedStatus] = useState('')
  useEffect(() => {
    let mounted = true
    setSeedBusy(true)
    void cleanImportedLibraryNotes().then(() => importXlsxCatalog()).then(async result => {
      await correctImportedFoodUnits()
      await correctImportedGearFields()
      await correctJetboilBrand()
      const pictures = await attachVerifiedGearPhotos()
      const lighter = await importLighterPackCatalog()
      await confirmSpreadsheetGearOwnership()
      if (!mounted) return
      setSeedStatus(result.alreadyImported ?
        'Исходные записи уже добавлены; фото снаряжения: ' + pictures + ' новых; LighterPack: ' + lighter.added + ' новых' :
        'Загружено из двух Excel: ' + result.added + ' новых записей; фотографий: ' + pictures + '; LighterPack: ' + lighter.added + ' новых')
    }).catch(error => {
      if (mounted) setSeedStatus('Импорт исходных записей не удался: ' +
        (error instanceof Error ? error.message : 'неизвестная ошибка'))
    }).finally(() => { if (mounted) setSeedBusy(false) })
    return () => { mounted = false }
  }, [])
  async function repeatSeedImport() {
    try {
      setSeedBusy(true)
      const result = await importXlsxCatalog(true)
      await correctImportedFoodUnits()
      await correctImportedGearFields()
      const photoCount = await attachVerifiedGearPhotos(true)
      const lighter = await importLighterPackCatalog(true)
      await confirmSpreadsheetGearOwnership()
      setSeedStatus('Сверка завершена: добавлено ' + result.added +
        ', уже было ' + result.existing + '; добавлено фотографий: ' + photoCount + '; LighterPack: ' + lighter.added + '. Существующие записи не заменены.')
    } catch(error) { setSeedStatus(error instanceof Error ? error.message : 'Ошибка импорта') }
    finally { setSeedBusy(false) }
  }
  useEffect(() => { setQuery(''); setCategory(''); setSelected(null); setPending(null) }, [tab])
  const all = library ?? null
  const items = all?.[tab] ?? []
  const categories = useMemo(() => [...new Set(items.map(x => String(x.category ?? '')).filter(Boolean))].sort(), [items])
  const visible = useMemo(() => items
    .filter(row => !category || row.category === category)
    .filter(row => Object.entries(row).filter(([key]) => key !== 'photoData').some(([, value]) => String(value ?? '').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items, query, category])
  const chosen = items.find(row => row.id === selected) ?? null
  const childTable = childByRoot[tab]
  const children = all && chosen && childTable ? all[childTable].filter(row =>
    row[parentKey[childTable]?.field ?? ''] === chosen.id) : []
  const canAddChild = childTable && (tab !== 'dishes' || (all?.foods.length ?? 0) > 0)
  const announce = (text: string, error = false) => setNotice({ text, error })
  async function remove(table: LibraryTableName, id: string) {
    if (!window.confirm('Удалить эту запись из библиотеки? Отменить действие нельзя.')) return
    try {
      await deleteLibraryRow(table, id)
      if (table === tab && selected === id) setSelected(null)
      announce('Запись удалена')
    } catch (e) { announce(e instanceof Error ? e.message : 'Ошибка удаления', true) }
  }
  async function downloadJson() {
    try {
      const archive = await makeLibraryArchive()
      saveJsonFile('hiking-planner-library-' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(archive, null, 2))
      announce('Библиотека экспортирована в JSON')
    } catch(e) { announce(e instanceof Error ? e.message : 'Ошибка экспорта', true) }
  }
  function downloadCsv() {
    try {
      saveJsonFile('hiking-planner-' + tab + '.csv', exportLibraryCsv(tab, items), 'text/csv')
      announce('Текущий раздел экспортирован в CSV')
    } catch(e) { announce(e instanceof Error ? e.message : 'Ошибка экспорта', true) }
  }
  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPending(null)
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 45 * 1024 * 1024) throw new Error('Файл больше 45 МБ')
      const archive = parseLibraryArchive(await file.text())
      setPending(archive)
      announce('Архив проверен. Посмотрите состав перед заменой.')
    } catch(e) { announce(e instanceof Error ? e.message : 'Файл не прошёл проверку', true) }
  }
  async function restore() {
    if (!pending || !window.confirm('Заменить всю текущую библиотеку содержимым файла? Походы и календарь не изменятся. Перед заменой скачайте JSON-копию.')) return
    try {
      setBusy(true)
      await replaceLibrary(pending)
      setPending(null)
      setSelected(null)
      announce('Библиотека восстановлена')
    } catch (e) { announce(e instanceof Error ? e.message : 'Не удалось восстановить', true) }
    finally { setBusy(false) }
  }
  if (!all) return <div className="loading-state">Открываем локальную библиотеку…</div>
  return (
    <div className="library-page">
      <div className="page-heading">
        <div><p className="eyebrow">ЭТАП 2 · ЛОКАЛЬНЫЙ СПРАВОЧНИК</p>
          <h1>Моя библиотека</h1>
          <p className="page-description">Постоянные каталоги для всех походов. Данные остаются в этом браузере — без сервера и учётной записи.</p>
        </div>
        <div className="heading-actions"><button type="button" className="button primary" onClick={() => setEditing({ table: tab })}><Plus size={18}/> Добавить {definitions[tab].singular}</button></div>
      </div>

      <section className="library-seed-banner" aria-label="Исходные данные из Excel">
        <div><strong>Каталоги из «Крым — 4 дня» и «Архыз — 4 дня»</strong>
          <p>43 продукта, 43 фасовки, 113 строк снаряжения (111 уникальных после объединения повторов), 27 медицинских карточек, 54 исторические записи аптечки и 9 источников. Данные добавляются без замены имеющихся записей. 110 фото снаряжения подобраны из исправленной папки Google Drive. Для неоднозначных совпадений указано, что это иллюстрация типа вещи.</p>
          <small role="status">{seedBusy ? 'Проверяем встроенный каталог…' : seedStatus || 'Подготовка каталога…'}</small></div>
        <button type="button" className="button secondary" onClick={() => void repeatSeedImport()} disabled={seedBusy}>
          <ArchiveRestore size={17}/> Сверить и добавить недостающее
        </button>
      </section>
      <div className="library-tabs" role="tablist" aria-label="Разделы библиотеки">
        {rootTabs.map(name => <button type="button" role="tab" aria-selected={tab === name}
          className={tab === name ? 'selected' : ''} key={name} onClick={() => setTab(name)}>
          {definitions[name].label}<span>{all[name].length}</span></button>)}
      </div>
      <div className="library-intro"><BookOpen size={18}/><span>{tabInfo[tab]}</span>
        <span className="library-private"><ShieldCheck size={15}/> Только локально</span></div>

      <div className="library-toolbar">
        <label className="search-field"><Search size={18}/>
          <input aria-label="Поиск в библиотеке" placeholder="Поиск по записям…" value={query} onChange={e => setQuery(e.target.value)}/></label>
        {categories.length > 0 && <select aria-label="Фильтр по категории" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Все категории</option>{categories.map(item => <option value={item} key={item}>{item}</option>)}
        </select>}
        <span className="library-count">Найдено: {visible.length}</span>
      </div>

      <div className="library-workspace">
        <section className="library-list" aria-label="Список записей">
          {visible.length ? visible.map(item => <button type="button" key={item.id}
            className={'library-entry' + (selected === item.id ? ' selected' : '')} onClick={() => setSelected(item.id)}>
            <span className={'library-entry-icon' + (coverFor(item) ? ' photo-thumb' : '')}>
              {coverFor(item) ? <img src={coverFor(item) ?? ''} alt="" loading="lazy" /> :
                tab === 'medical' ? '✚' : tab === 'foods' ? '◈' : tab === 'dishes' ? '◉' : tab === 'gear' ? '△' : '↗'}</span>
            <span className="library-entry-body"><strong>{titleOf(tab, item)}</strong>
              <small>{tab === 'gear' ? [item.brand, item.model].filter(Boolean).join(' · ') || item.category || 'Без категории' : String(item.category || item.brand || item.provider || item.internationalName || '') || 'Без категории'}</small></span>
            <span className="library-entry-end">{item.sourceRef ? 'Источник ✓' : 'Личная запись'}</span>
          </button>) : <div className="library-empty"><BookOpen size={30}/><h3>{items.length ? 'Ничего не найдено' : 'Пока нет записей'}</h3>
            <p>{items.length ? 'Измените поиск или фильтр.' : 'Добавьте первую запись в этот раздел.'}</p>
            {!items.length && <button className="button secondary" onClick={() => setEditing({ table: tab })}>Создать запись</button>}</div>}
        </section>
        <section className="library-detail" aria-label="Карточка записи">
          {chosen ? <>
            <div className="library-detail-head"><div><p className="eyebrow">КАРТОЧКА · {definitions[tab].label}</p>
              <h2>{titleOf(tab, chosen)}</h2></div>
              <div className="library-detail-actions">
                <button className="icon-button" aria-label="Редактировать запись" title="Редактировать" onClick={() => setEditing({ table: tab, row: chosen })}><Pencil size={18}/></button>
                <button className="icon-button library-delete" aria-label="Удалить запись" title="Удалить" onClick={() => void remove(tab, chosen.id)}><Trash2 size={18}/></button>
              </div></div>
            <LibraryPhotos key={chosen.id} table={tab} row={chosen} notify={announce}/>
            <dl className="library-attributes">
              {tab === 'gear' && <div><dt>Масса, г</dt>
                <dd>{chosen.listedWeightG ?? chosen.manufacturerWeightG ?? 'Не указано'}</dd></div>}
              {definitions[tab].fields.filter(field => field.key !== definitions[tab].title &&
                (tab !== 'gear' || (!['photoUrl','manufacturerWeightG','listedWeightG','sourceDescription','sourceEntryKeys'].includes(field.key) &&
                  (!['lengthCm','widthCm','thicknessCm','rValue','temperatureHint','specifications'].includes(field.key) ||
                   (chosen[field.key] !== null && chosen[field.key] !== undefined && chosen[field.key] !== ''))))
              ).map(field => {
                const value = chosen[field.key]
                const href = field.key === 'sourceRef'
                  ? all.sources.find(source => source.id === value)?.url
                  : field.type === 'url' ? value : ''
                const validLink = typeof href === 'string' && /^https?:\/\//i.test(href)
                return <div key={field.key}><dt>{field.label}</dt>
                  <dd>{validLink ? <a href={href} target="_blank" rel="noopener noreferrer">
                    {field.key === 'sourceRef' ? showValue(field, value, all) : 'Открыть ссылку'}
                  </a> : showValue(field, value, all)}</dd></div>
              })}
            </dl>
            <div className="library-record-meta">Изменено: {new Date(chosen.updatedAt).toLocaleDateString('ru-RU')}</div>
            {childTable && <div className="library-related">
              <div className="library-related-head"><h3>{definitions[childTable].label} · {children.length}</h3>
                <button className="button secondary" disabled={!canAddChild} onClick={() => {
                  const parent = parentKey[childTable]
                  if (parent) setEditing({ table: childTable, preset: { [parent.field]: chosen.id } })
                }}><Plus size={16}/> Добавить</button></div>
              {!canAddChild && <p className="library-help">Сначала добавьте продукты в каталог — они станут доступны как ингредиенты.</p>}
              {children.map(row => <div className="library-related-item" key={row.id}>
                <div><strong>{childTable === 'ingredients' ?
                  (all.foods.find(p => p.id === row.productId)?.name || 'Продукт не найден') :
                  childTable === 'ownedGear' ? String(row.nickname || 'Экземпляр') : titleOf(childTable, row)}</strong>
                  <small>{childTable === 'packages' ? (row.unitKind === 'piece' ? 'Масса штуки: ' : 'Нетто: ') + (row.netWeightG ?? 'неизвестно') + ' г' :
                    childTable === 'ingredients' ? (row.rawAmountG ?? 'неизвестно') + ' г' :
                      childTable === 'ownedGear' ? (row.ownershipStatus === 'confirmed' ? 'В наличии: ' + (row.quantityOwned || 1) + ' шт.' +
                      (typeof row.measuredWeightG === 'number' ? ' · измеренный вес: ' + row.measuredWeightG + ' г' : '') :
                      'Наличие не указано') :
                        'Срок годности: ' + (row.expiryDate || 'неизвестен')}</small></div>
                <div className="library-detail-actions"><button aria-label="Редактировать связанную запись" title="Редактировать" className="icon-button"
                  onClick={() => setEditing({ table: childTable, row })}><Pencil size={16}/></button>
                  <button aria-label="Удалить связанную запись" title="Удалить" className="icon-button library-delete"
                    onClick={() => void remove(childTable, row.id)}><Trash2 size={16}/></button></div>
              </div>)}
              {!children.length && <p className="library-help">Связанных записей пока нет.</p>}
            </div>}
          </> : <div className="library-detail-placeholder"><CircleHelp size={34}/><h3>Выберите запись</h3>
            <p>Откроется карточка с характеристиками, источниками и связанными данными.</p></div>}
        </section>
      </div>

      <section className="library-transfer" aria-label="Импорт и экспорт библиотеки">
        <div><p className="eyebrow">РЕЗЕРВНЫЙ ОБМЕН</p><h2>Перенос библиотеки</h2>
          <p>Экспортируйте всю библиотеку в JSON или текущий раздел в CSV. Импорт JSON проверяет записи и связи, затем заменяет только библиотеку. Походы остаются нетронутыми.</p></div>
        <div className="library-transfer-actions">
          <button className="button secondary" onClick={() => void downloadJson()}><Download size={17}/> Вся библиотека · JSON</button>
          <button className="button secondary" onClick={downloadCsv}><Download size={17}/> Этот раздел · CSV</button>
          <label className="button secondary library-file-button"><FileUp size={17}/> Импорт JSON
            <input type="file" accept=".json,application/json" onChange={event => void selectFile(event)} aria-label="Выбрать архив библиотеки"/></label>
        </div>
        {pending && <div className="library-import-preview"><strong><ArchiveRestore size={17}/> Файл прошёл проверку</strong>
          <p>Записей: {rootTabs.map(name => definitions[name].label + ' — ' + pending.data[name].length).join(' · ')}. Связанные позиции также проверены.</p>
          <button className="button danger" disabled={busy} onClick={() => void restore()}>Заменить библиотеку из файла</button></div>}
      </section>
      <p className="library-footer-note"><ShieldCheck size={16}/> Неизвестные значения не равны нулю. Медицинская информация — только справочная; интернет-поиск и официальные инструкции подключаются на следующем этапе.</p>
      {notice && <div className={'toast' + (notice.error ? ' toast-error' : '')} role="status">
        <span>{notice.text}</span><button className="icon-button" aria-label="Закрыть уведомление" onClick={() => setNotice(null)}><X size={16}/></button></div>}
      {editing && <LibraryEditor editing={editing} library={all} onClose={() => setEditing(null)} onSaved={announce}/>}
    </div>
  )
}
