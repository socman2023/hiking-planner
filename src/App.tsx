import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Activity, ArrowLeft, ArrowRight, Backpack, BookOpen, CalendarDays,
  Check, CheckCircle2, ChevronRight, CloudSun,
  Compass, Copy, Download, FileText, Flag, HardDrive, HeartPulse, Info, Layers3,
  Map, MapPin, Menu, Mountain, Pencil, Plus, Route as RouteIcon,
  Search, Settings2, ShieldCheck, Sun, Trash2, TrainFront, Upload, Utensils,
  Wallet, X,
} from 'lucide-react'
import { db } from './data/db'
import {
  createTrip, deleteTrip, duplicateTrip, editDay, getTripDays, previewRemovedDays,
  setTripStatus, updateTrip,
} from './data/tripRepository'
import { makeBackup, parseBackup, restoreBackup, saveBackupToFile, type AnyBackup } from './data/backup'
import {
  activityLabels, dayKindLabels, formatDate, formatRange, hasDayDetails, statusLabels,
  type ActivityType, type DayKind, type Trip, type TripDay, type TripInput, type TripStatus,
} from './domain/trips'
import './styles.css'
import LibraryPage from './LibraryPage'

type Notice = { text: string; error?: boolean }
type Notify = (text: string, error?: boolean) => void

const navItems = [
  { label: 'Мои походы', icon: Compass, href: '/', stage: 1 },
  { label: 'Библиотека', icon: BookOpen, href: '/library', stage: 1 },
  { label: 'Маршрут и карта', icon: Map, href: '/future/route', stage: 5 },
  { label: 'Меню и раскладка', icon: Utensils, href: '/future/food', stage: 3 },
  { label: 'Снаряжение', icon: Backpack, href: '/future/gear', stage: 4 },
  { label: 'Аптечка', icon: HeartPulse, href: '/future/med', stage: 7 },
  { label: 'Транспорт', icon: TrainFront, href: '/future/transport', stage: 7 },
  { label: 'Финансы', icon: Wallet, href: '/future/budget', stage: 7 },
  { label: 'Погода и поиск', icon: CloudSun, href: '/future/web', stage: 6 },
  { label: 'Данные и настройки', icon: Settings2, href: '/settings', stage: 1 },
]

function localToday(): string {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
function emptyInput(): TripInput {
  return { title: '', regionLabel: '', startDate: localToday(), dayCount: 4, activityType: 'hiking', notes: '' }
}
function pluralDays(n: number): string {
  const mod100 = n % 100
  const mod10 = n % 10
  return n + ' ' + (mod100 >= 11 && mod100 <= 14 ? 'дней' : mod10 === 1 ? 'день' : mod10 >= 2 && mod10 <= 4 ? 'дня' : 'дней')
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <HikingPlanner />
    </BrowserRouter>
  )
}

function HikingPlanner() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const notify: Notify = (text, error = false) => setNotice({ text, error })
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 4700)
    return () => window.clearTimeout(id)
  }, [notice])
  useEffect(() => setMenuOpen(false), [location.pathname])

  const page = location.pathname === '/' ? 'Мои походы' :
    location.pathname.startsWith('/trips/') ? 'Обзор похода' :
      navItems.find((item) => item.href === location.pathname)?.label ?? 'Hiking Planner'

  return (
    <div className="app-layout">
      {menuOpen && <button className="mobile-overlay" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />}
      <aside className={'sidebar' + (menuOpen ? ' sidebar-open' : '')}>
        <Link to="/" className="brand" aria-label="Hiking Planner — на главную">
          <span className="brand-symbol"><Mountain size={25} strokeWidth={1.9} /></span>
          <span className="brand-title"><strong>HIKING<span>PLANNER</span></strong><small>ПЛАНИРОВЩИК ПОХОДОВ</small></span>
        </Link>
        <div className="sidebar-caption">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <nav className="sidebar-nav" aria-label="Основная навигация">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.href === location.pathname ||
              (item.href === '/' && location.pathname.startsWith('/trips/'))
            return (
              <Link key={item.href} to={item.href} className={'side-link' + (active ? ' active' : '')}>
                <Icon size={18} strokeWidth={1.75} />
                <span>{item.label}</span>
                {item.stage > 1 && <span className="stage-dot" title={'Этап ' + item.stage}>{item.stage}</span>}
              </Link>
            )
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-foot">
          <span className="online-indicator" />
          <div><strong>Локальное хранение</strong><small>Данные на этом устройстве</small></div>
          <HardDrive size={16} className="muted-icon" />
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Открыть меню" onClick={() => setMenuOpen(true)}><Menu size={23}/></button>
          <div className="breadcrumb"><span>Hiking Planner</span><ChevronRight size={14}/><strong>{page}</strong></div>
          <div className="topbar-right">
            <span className="topbar-tag"><span className="tag-dot"/> SOLO · ОФЛАЙН-ДАННЫЕ</span>
            <Link to="/settings" className="icon-button" aria-label="Данные и настройки"><Settings2 size={19}/></Link>
          </div>
        </header>
        <main className="page-content">
          {typeof indexedDB === 'undefined' && (
            <div className="alert error"><Info size={18}/> IndexedDB недоступна. Для сохранения походов нужен браузер с поддержкой локального хранилища.</div>
          )}
          <Routes>
            <Route path="/" element={<TripsPage notify={notify}/>} />
            <Route path="/trips/:tripId" element={<TripDetails notify={notify}/>} />
            <Route path="/library" element={<LibraryPage/>} />
            <Route path="/future/:kind" element={<FuturePage/>} />
            <Route path="/settings" element={<SettingsPage notify={notify}/>} />
            <Route path="*" element={<NotFound/>} />
          </Routes>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Навигация на смартфоне">
        <Link className={location.pathname === '/' || location.pathname.startsWith('/trips/') ? 'selected' : ''} to="/"><Compass size={20}/><span>Походы</span></Link>
        <Link className={location.pathname === '/library' ? 'selected' : ''} to="/library"><BookOpen size={20}/><span>Библиотека</span></Link>
        <Link className={location.pathname === '/future/route' ? 'selected' : ''} to="/future/route"><Map size={20}/><span>Карта</span></Link>
        <Link className={location.pathname === '/settings' ? 'selected' : ''} to="/settings"><Settings2 size={20}/><span>Данные</span></Link>
      </nav>
      {notice && <div className={'toast' + (notice.error ? ' toast-error' : '')} role="status">{notice.error ? <Info size={18}/> : <CheckCircle2 size={18}/>}<span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Закрыть"><X size={16}/></button></div>}
    </div>
  )
}

interface TripFormProps {
  trip?: Trip
  onClose: () => void
  onSave: (input: TripInput) => Promise<boolean>
}

function TripForm({ trip, onClose, onSave }: TripFormProps) {
  const [form, setForm] = useState<TripInput>(trip ? {
    title: trip.title, regionLabel: trip.regionLabel, activityType: trip.activityType,
    startDate: trip.startDate, dayCount: trip.dayCount, notes: trip.notes,
  } : emptyInput())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [busy, onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const saved = await onSave(form)
      if (saved) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить поход')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={trip ? 'Редактирование похода' : 'Новый поход'}>
        <div className="modal-head">
          <div><span className="eyebrow">ПЛАНИРОВАНИЕ</span><h2>{trip ? 'Настройки похода' : 'Новый поход'}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть" disabled={busy}><X size={20}/></button>
        </div>
        <form onSubmit={submit} className="trip-form">
          <label className="field">Название похода <span className="required">*</span>
            <input autoFocus value={form.title} maxLength={120} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Например, Карельские озёра" required/>
          </label>
          <label className="field">Район / регион
            <input value={form.regionLabel} maxLength={150} onChange={e => setForm({ ...form, regionLabel: e.target.value })} placeholder="Карелия, Хибины, Кавказ…"/>
          </label>
          <div className="form-grid">
            <label className="field">Дата начала
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required/>
            </label>
            <label className="field">Продолжительность
              <input type="number" min={1} max={365} value={form.dayCount} onChange={e => setForm({ ...form, dayCount: e.target.value === '' ? 0 : Number(e.target.value) })} required/>
            </label>
          </div>
          <label className="field">Тип похода
            <select value={form.activityType} onChange={e => setForm({ ...form, activityType: e.target.value as ActivityType })}>
              {Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">Заметки
            <textarea value={form.notes} maxLength={5000} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Цель, сезон, особенности, идеи маршрута…"/>
          </label>
          {trip && <div className="form-help"><Info size={16}/> При изменении даты начала все дни сдвинутся, сохраняя их содержание. При сокращении длительности лишние дни будут удалены только после подтверждения.</div>}
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Отмена</button>
            <button type="submit" className="button primary" disabled={busy}>{busy ? 'Сохранение…' : trip ? 'Сохранить изменения' : 'Создать поход'}<ArrowRight size={17}/></button>
          </div>
        </form>
      </section>
    </div>
  )
}

function PageHeading({ kicker, title, description, children }: { kicker: string; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{kicker}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  )
}
function Metric({ icon, value, label, tone = 'neutral' }: {icon: ReactNode; value: string | number; label: string; tone?: string}) {
  return <div className={'metric metric-' + tone}><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>
}

function TripsPage({ notify }: { notify: Notify }) {
  const trips = useLiveQuery(() => db.trips.orderBy('updatedAt').reverse().toArray(), [])
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'active' | 'all' | 'completed' | 'archived'>('active')
  const navigate = useNavigate()
  const today = localToday()
  const summary = useMemo(() => {
    const list = trips ?? []
    return {
      total: list.length,
      active: list.filter(t => t.status !== 'archived' && t.status !== 'completed').length,
      plannedDays: list.filter(t => t.status !== 'archived').reduce((s, t) => s + t.dayCount, 0),
      finished: list.filter(t => t.status === 'completed').length,
    }
  }, [trips])
  const visible = useMemo(() => (trips ?? []).filter(t => {
    if (filter === 'active' && (t.status === 'archived' || t.status === 'completed')) return false
    if (filter === 'completed' && t.status !== 'completed') return false
    if (filter === 'archived' && t.status !== 'archived') return false
    const text = (t.title + ' ' + t.regionLabel).toLocaleLowerCase('ru')
    return text.includes(query.toLocaleLowerCase('ru').trim())
  }), [trips, query, filter])

  async function create(input: TripInput): Promise<boolean> {
    const trip = await createTrip(input)
    notify('Поход создан и сохранён на этом устройстве')
    navigate('/trips/' + trip.id)
    return true
  }
  async function duplicate(id: string) {
    try {
      const copy = await duplicateTrip(id)
      notify('Копия похода создана')
      navigate('/trips/' + copy.id)
    } catch(e) { notify(e instanceof Error ? e.message : 'Ошибка копирования', true) }
  }

  return (
    <>
      <PageHeading kicker="ЛИЧНАЯ ЭКСПЕДИЦИОННАЯ БАЗА" title="Мои походы" description="Все маршруты, планы и подготовки — в одном месте. Без обязательного подключения к интернету.">
        <button className="button primary" onClick={() => setFormOpen(true)}><Plus size={19}/> Новый поход</button>
      </PageHeading>
      <section className="welcome-banner">
        <div className="welcome-copy"><div className="banner-kicker"><span/> ПЕРСОНАЛЬНЫЙ ПЛАНИРОВЩИК</div><h2>Каждое путешествие<br/><em>начинается с плана.</em></h2><p>Собирайте маршруты, управляйте днями похода и постепенно создавайте собственную библиотеку путешествий.</p></div>
        <div className="banner-art" aria-hidden="true"><Mountain size={150} strokeWidth={0.65}/><div className="banner-orbit one"/><div className="banner-orbit two"/><div className="banner-orbit three"/></div>
      </section>
      <section className="metrics-grid" aria-label="Сводная статистика">
        <Metric icon={<Compass size={21}/>} value={summary.total} label="Всего походов" tone="cyan"/>
        <Metric icon={<Flag size={21}/>} value={summary.active} label="В подготовке" tone="green"/>
        <Metric icon={<CalendarDays size={21}/>} value={summary.plannedDays} label="Дней в планах" tone="yellow"/>
        <Metric icon={<CheckCircle2 size={21}/>} value={summary.finished} label="Завершено" tone="violet"/>
      </section>
      <div className="section-heading"><div><span className="eyebrow">КАТАЛОГ</span><h2>Ваши путешествия</h2></div><span className="section-count">{visible.length} из {summary.total}</span></div>
      <div className="toolbar">
        <label className="search-field"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию или региону" aria-label="Поиск походов"/></label>
        <div className="filter-tabs" aria-label="Статус походов">
          {([['active', 'В работе'], ['all', 'Все'], ['completed', 'Завершены'], ['archived', 'Архив']] as const).map(([value, label]) =>
            <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>
      {trips === undefined ? <div className="loading-state">Загружаем сохранённые походы…</div> :
        visible.length ? <section className="trip-grid">
          {visible.map((trip, index) => (
            <article className="trip-card" key={trip.id}>
              <Link to={'/trips/' + trip.id} className="trip-card-main">
                <div className="trip-card-top"><span className={'status status-' + trip.status}><span/>{statusLabels[trip.status]}</span><span className="trip-index">№ {String(index + 1).padStart(2, '0')}</span></div>
                <span className="trip-card-icon"><Mountain size={30} strokeWidth={1.15}/></span>
                <h3>{trip.title}</h3>
                <div className="trip-location"><MapPin size={15}/>{trip.regionLabel || 'Регион не указан'}</div>
                <div className="trip-card-facts"><span><CalendarDays size={16}/>{formatRange(trip.startDate, trip.dayCount)}</span><span><Sun size={16}/>{pluralDays(trip.dayCount)}</span></div>
                {trip.startDate < today && trip.status === 'draft' && <span className="quiet-warning">Дата начала уже прошла</span>}
              </Link>
              <div className="trip-card-bottom">
                <Link to={'/trips/' + trip.id} className="card-open">Открыть план <ArrowRight size={17}/></Link>
                <button className="icon-button" title="Дублировать поход" aria-label={'Дублировать ' + trip.title} onClick={() => void duplicate(trip.id)}><Copy size={17}/></button>
              </div>
            </article>
          ))}
          <button className="new-trip-card" onClick={() => setFormOpen(true)}><span className="new-trip-icon"><Plus size={28}/></span><strong>Создать поход</strong><span>Добавьте новое путешествие<br/>в вашу коллекцию</span></button>
        </section> : <section className="empty-state"><div className="empty-compass"><Compass size={42}/></div><h3>{summary.total ? 'Ничего не найдено' : 'Впереди новые маршруты'}</h3><p>{summary.total ? 'Измените запрос или фильтр, чтобы увидеть сохранённые походы.' : 'Создайте первый поход. Укажите даты, регион и продолжительность — план сохранится в вашем браузере.'}</p>{summary.total ? <button className="button secondary" onClick={() => {setQuery('');setFilter('all')}}>Показать все</button> : <button className="button primary" onClick={() => setFormOpen(true)}><Plus size={17}/> Создать первый поход</button>}</section>}
      {formOpen && <TripForm onClose={() => setFormOpen(false)} onSave={create}/>}
    </>
  )
}

function TripDetails({ notify }: { notify: Notify }) {
  const { tripId = '' } = useParams()
  const navigate = useNavigate()
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => getTripDays(tripId), [tripId])
  const [formOpen, setFormOpen] = useState(false)
  const [editingDay, setEditingDay] = useState<TripDay | null>(null)
  const walking = (days ?? []).filter(day => day.kind === 'hiking').length
  async function save(input: TripInput): Promise<boolean> {
    if (!trip) return false
    const removed = previewRemovedDays(days ?? [], input.dayCount)
    if (removed.length) {
      const detailed = removed.filter(hasDayDetails)
      const sample = detailed.slice(0, 3).map(day => formatDate(day.date) + (day.title ? ': ' + day.title : '')).join(', ')
      const text = 'Будут удалены ' + pluralDays(removed.length) + ' из конца похода.' +
        (detailed.length ? '\nИз них с заполненными сведениями: ' + detailed.length + (sample ? '\n' + sample : '') : '') +
        '\nЭто действие нельзя отменить. Сохранить изменения?'
      if (!window.confirm(text)) return false
    }
    await updateTrip(trip.id, input)
    notify('Настройки и календарные дни обновлены')
    return true
  }
  async function copyTrip() {
    try {
      const copy = await duplicateTrip(tripId)
      notify('Независимая копия похода создана')
      navigate('/trips/' + copy.id)
    } catch(e) { notify(e instanceof Error ? e.message : 'Не удалось скопировать', true) }
  }
  async function remove() {
    if (!trip || !window.confirm('Удалить поход «' + trip.title + '» и все его календарные дни? Действие нельзя отменить. Перед удалением рекомендуется сделать резервную копию.')) return
    try { await deleteTrip(trip.id); notify('Поход удалён'); navigate('/') }
    catch(e) { notify(e instanceof Error ? e.message : 'Не удалось удалить поход', true) }
  }
  async function changeStatus(status: TripStatus) {
    try { await setTripStatus(tripId, status); notify('Статус изменён') }
    catch(e) { notify(e instanceof Error ? e.message : 'Не удалось изменить статус', true) }
  }
  if (trip === undefined || days === undefined) return <div className="loading-state">Загружаем поход…</div>
  if (!trip) return <NotFound/>
  return (
    <>
      <Link className="back-link" to="/"><ArrowLeft size={18}/> Все походы</Link>
      <PageHeading kicker="ПЛАН ПОХОДА" title={trip.title} description={trip.regionLabel || 'Регион пока не указан'}>
        <button className="button secondary" onClick={() => void copyTrip()}><Copy size={17}/> Копировать</button>
        <button className="button primary" onClick={() => setFormOpen(true)}><Pencil size={17}/> Изменить</button>
      </PageHeading>
      <div className="trip-hero">
        <div className="trip-hero-heading"><span className={'status status-' + trip.status}><span/>{statusLabels[trip.status]}</span><span className="hero-kicker">{activityLabels[trip.activityType]}</span></div>
        <div className="trip-hero-metrics">
          <Metric icon={<CalendarDays size={23}/>} value={formatRange(trip.startDate, trip.dayCount)} label="Даты путешествия" tone="cyan"/>
          <Metric icon={<Sun size={23}/>} value={pluralDays(trip.dayCount)} label="Календарных дней" tone="yellow"/>
          <Metric icon={<RouteIcon size={23}/>} value={walking} label="Ходовых дней" tone="green"/>
        </div>
      </div>
      <div className="details-grid">
        <section className="panel day-panel">
          <div className="panel-title"><div><p className="eyebrow">РАСПИСАНИЕ</p><h2>Календарь похода</h2></div><span className="counter">{days.length}</span></div>
          <p className="panel-subtitle">У каждого дня можно указать тип, название и заметки. Остальные разделы будут подключаться к этим датам.</p>
          <div className="day-list">
            {days.map((day, index) => (
              <button className="day-row" key={day.id} onClick={() => setEditingDay(day)} aria-label={'Изменить день ' + (index + 1)}>
                <span className="day-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="day-info"><strong>{day.title || dayKindLabels[day.kind]}</strong><small>{formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'long' })} · {dayKindLabels[day.kind]}</small>{day.description && <span className="day-description">{day.description}</span>}</span>
                <Pencil size={16} className="row-pencil"/>
              </button>
            ))}
          </div>
        </section>
        <div className="side-panels">
          <section className="panel">
            <div className="panel-title"><h2>Параметры</h2><Settings2 size={18}/></div>
            <div className="info-rows">
              <div><span>Тип похода</span><strong>{activityLabels[trip.activityType]}</strong></div>
              <div><span>Статус</span><select className="inline-select" aria-label="Статус похода" value={trip.status} onChange={e => void changeStatus(e.target.value as TripStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div><span>Создан</span><strong>{new Date(trip.createdAt).toLocaleDateString('ru-RU')}</strong></div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-title"><h2>Заметки</h2><FileText size={18}/></div>
            <p className="notes-text">{trip.notes || 'Пока нет заметок. Здесь можно записать цели путешествия, идеи и полезные сведения.'}</p>
            <button className="text-button" onClick={() => setFormOpen(true)}>Редактировать заметки <ArrowRight size={16}/></button>
          </section>
          <section className="panel next-step">
            <div className="panel-title"><h2>Дальше по плану</h2><Layers3 size={18}/></div>
            <p>На следующих этапах к этому походу добавятся маршруты, меню, снаряжение, аптечка и погодные данные.</p>
            <Link to="/library" className="text-button">Посмотреть план библиотек <ArrowRight size={16}/></Link>
          </section>
          <section className="panel danger-panel"><div className="panel-title"><h2>Управление записью</h2></div><button className="button danger" onClick={() => void remove()}><Trash2 size={17}/> Удалить поход</button><p>Удаление необратимо. Резервную копию можно скачать в настройках.</p></section>
        </div>
      </div>
      {formOpen && <TripForm trip={trip} onClose={() => setFormOpen(false)} onSave={save}/>}
      {editingDay && <DayEditor key={editingDay.id} day={days.find(d => d.id === editingDay.id) ?? editingDay} onClose={() => setEditingDay(null)} notify={notify}/>}
    </>
  )
}

function DayEditor({ day, onClose, notify }: { day: TripDay; onClose: () => void; notify: Notify }) {
  const [kind, setKind] = useState<DayKind>(day.kind)
  const [title, setTitle] = useState(day.title)
  const [description, setDescription] = useState(day.description)
  const [notes, setNotes] = useState(day.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (title.length > 120 || description.length > 5000 || notes.length > 5000) throw new Error('Слишком длинный текст')
      await editDay(day.id, { kind, title: title.trim(), description: description.trim(), notes: notes.trim() })
      notify('Сведения о дне сохранены')
      onClose()
    } catch(e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить день') }
    finally { setBusy(false) }
  }
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Редактирование дня">
        <div className="modal-head"><div><span className="eyebrow">{formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><h2>Редактировать день</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></div>
        <form className="trip-form" onSubmit={submit}>
          <label className="field">Тип дня<select value={kind} onChange={e => setKind(e.target.value as DayKind)}>{Object.entries(dayKindLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <label className="field">Название дня<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Например, Подъём к озеру"/></label>
          <label className="field">Описание перехода<textarea rows={3} maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ключевые события, сложные участки…"/></label>
          <label className="field">Дополнительные заметки<textarea rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Что проверить или подготовить…"/></label>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="submit" className="button primary" disabled={busy}><Check size={18}/> Сохранить</button></div>
        </form>
      </section>
    </div>
  )
}

const futureInfo: Record<string, { icon: ReactNode; title: string; stage: number; description: string; features: string[] }> = {
  library: { icon: <BookOpen size={29}/>, title: 'Личная библиотека', stage: 2, description: 'Постоянные справочники, которые останутся с вами от похода к походу.', features: ['Продукты и варианты фасовок', 'Блюда, рецепты и БЖУ', 'Личное снаряжение', 'Лекарства и инструкции', 'Треки и географические объекты'] },
  route: { icon: <Map size={29}/>, title: 'Маршрут и карта', stage: 5, description: 'Реальная карта, треки GPX, дневные переходы, ночёвки и высотный профиль.', features: ['OSM-карта и точки', 'Импорт и экспорт GPX', 'Высоты, расстояния и дневные этапы', 'Источники воды и места ночёвок'] },
  food: { icon: <Utensils size={29}/>, title: 'Меню и раскладка', stage: 3, description: 'Планирование питания с расчётом калорий, БЖУ, закупок и массы.', features: ['Меню по дням', 'Рецепты и ингредиенты', 'Калькулятор упаковок', 'Вода и топливо'] },
  gear: { icon: <Backpack size={29}/>, title: 'Личное снаряжение', stage: 4, description: 'Списки снаряжения и честный расчёт веса рюкзака.', features: ['Мой каталог вещей', 'Списки и чек-листы', 'Вес в рюкзаке и на себе', 'Отметки о сборе'] },
  med: { icon: <HeartPulse size={29}/>, title: 'Аптечка', stage: 7, description: 'Комплектация аптечки и сохранённые официальные инструкции.', features: ['Личный медицинский справочник', 'Даты годности конкретных упаковок', 'Список аптечки', 'Официальные источники'] },
  transport: { icon: <TrainFront size={29}/>, title: 'Транспорт', stage: 7, description: 'Планирование дороги к старту маршрута и возвращения домой.', features: ['Транспортные плечи', 'Пересадки и расписания', 'Ссылки на билеты', 'Стоимость поездок'] },
  budget: { icon: <Wallet size={29}/>, title: 'Финансы', stage: 7, description: 'План и фактические расходы без смешивания валют.', features: ['Категории расходов', 'План и факт', 'История цен', 'Контроль бюджета'] },
  web: { icon: <CloudSun size={29}/>, title: 'Погода и интернет-поиск', stage: 6, description: 'Прогноз по маршруту и поиск открытых материалов для личной библиотеки.', features: ['Погода Open-Meteo', 'Треки и объекты OSM', 'Продукты и оборудование', 'Фото, описания, мединструкции'] },
}

function FuturePage({ kind: override }: { kind?: string }) {
  const { kind: routeKind } = useParams()
  const info = futureInfo[override ?? routeKind ?? '']
  if (!info) return <NotFound/>
  return (
    <>
      <Link className="back-link" to="/"><ArrowLeft size={18}/> Мои походы</Link>
      <PageHeading kicker={'РАЗРАБОТКА · ЭТАП ' + info.stage} title={info.title} description={info.description}/>
      <section className="future-panel">
        <div className="future-emblem">{info.icon}</div>
        <span className="eyebrow">ЗАПЛАНИРОВАНО</span><h2>Этот раздел появится на этапе {info.stage}</h2>
        <p>Сейчас доступен первый рабочий модуль: создание и ведение календаря походов. Мы не показываем демонстрационные данные как реальные функции.</p>
        <div className="future-features">{info.features.map(feature => <span key={feature}><Check size={15}/>{feature}</span>)}</div>
        <Link className="button primary" to="/">Вернуться к походам <ArrowRight size={17}/></Link>
      </section>
    </>
  )
}

function SettingsPage({ notify }: { notify: Notify }) {
  const trips = useLiveQuery(() => db.trips.count(), [])
  const days = useLiveQuery(() => db.days.count(), [])
  const [pending, setPending] = useState<AnyBackup | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  async function download() {
    try { setBusy(true); saveBackupToFile(await makeBackup()); notify('Резервная копия скачана') }
    catch(e) { notify(e instanceof Error ? e.message : 'Не удалось скачать копию', true) }
    finally { setBusy(false) }
  }
  async function selectFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setPending(null)
    if (!file) return
    try {
      if (file.size > 60 * 1024 * 1024) throw new Error('Файл больше 60 МБ')
      const parsed = parseBackup(await file.text())
      setPending(parsed)
      notify('Резервная копия проверена; выберите восстановление')
    } catch(e) { notify(e instanceof Error ? e.message : 'Некорректная резервная копия', true) }
    finally { e.target.value = '' }
  }
  async function restore() {
    if (!pending || !window.confirm('ВНИМАНИЕ: восстановление заменит походы и дни' + (pending.schemaVersion === 2 ? ' и библиотеку' : '; библиотека останется без изменений') + ' на этом устройстве (' + (trips ?? 0) + ' походов). Сначала скачайте текущую резервную копию. Продолжить?')) return
    try { setBusy(true); await restoreBackup(pending); setPending(null); notify('Данные полностью восстановлены'); navigate('/') }
    catch(e) { notify(e instanceof Error ? e.message : 'Не удалось восстановить данные', true) }
    finally { setBusy(false) }
  }
  return (
    <>
      <PageHeading kicker="НАСТРОЙКИ" title="Данные и резервные копии" description="Управляйте сохранёнными походами. Ваши данные находятся в браузере на этом устройстве."/>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-title"><h2>Локальная база</h2><HardDrive size={20}/></div>
          <p className="panel-subtitle">IndexedDB · Hiking Planner v2</p>
          <div className="settings-totals"><div><strong>{trips ?? '—'}</strong><span>походов</span></div><div><strong>{days ?? '—'}</strong><span>календарных дней</span></div></div>
          <div className="form-help"><ShieldCheck size={17}/> Данные не отправляются на сервер. Очистка хранилища браузера или использование другого устройства могут привести к их отсутствию.</div>
        </section>
        <section className="panel">
          <div className="panel-title"><h2>Скачать резервную копию</h2><Download size={20}/></div>
          <p className="panel-subtitle">Сохраните походы, дни и всю личную библиотеку в одном JSON-файле. Повторяйте это после важных изменений.</p>
          <button className="button primary" onClick={() => void download()} disabled={busy}><Download size={18}/> Скачать JSON</button>
        </section>
        <section className="panel">
          <div className="panel-title"><h2>Восстановить данные</h2><Upload size={20}/></div>
          <p className="panel-subtitle">Выберите резервную копию формата Hiking Planner версии 1 или 2. Сначала мы проверим структуру файла, затем предложим подтвердить полную замену данных.</p>
          <input ref={fileInput} type="file" accept=".json,application/json" className="visually-hidden" onChange={e => void selectFile(e)}/>
          <button className="button secondary" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={18}/> Выбрать JSON-файл</button>
          {pending && <div className="restore-preview"><strong><CheckCircle2 size={17}/> Файл прошёл проверку</strong><span>Походов: {pending.data.trips.length} · дней: {pending.data.days.length}{pending.schemaVersion === 2 ? ' · записей библиотеки: ' + Object.values(pending.data.library).reduce((total, rows) => total + rows.length, 0) : ' · старый архив без библиотеки'}</span><span>Создан: {new Date(pending.exportedAt).toLocaleString('ru-RU')}</span><button className="button danger" onClick={() => void restore()} disabled={busy}>Заменить данные содержимым файла</button></div>}
        </section>
        <section className="panel">
          <div className="panel-title"><h2>Как устроено хранение</h2><Info size={20}/></div>
          <div className="storage-notes"><p><strong>Работает без интернета</strong><br/>После первой загрузки открытая вкладка может редактировать уже сохранённые походы без сети.</p><p><strong>GitHub Pages подключён</strong><br/>Приложение открывается по ссылке; полноценный автономный запуск после закрытия браузера появится с PWA на более позднем этапе.</p><p><strong>Не синхронизируется автоматически</strong><br/>Перенос данных на другое устройство сейчас возможен через JSON-файл.</p></div>
        </section>
      </div>
    </>
  )
}

function NotFound() {
  return <section className="empty-state not-found"><Activity size={42}/><h2>Страница не найдена</h2><p>Возможно, запись была удалена или адрес изменился.</p><Link to="/" className="button primary"><ArrowLeft size={17}/> К моим походам</Link></section>
}
