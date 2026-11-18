import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Backpack, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { db } from './data/db'
import { getTripGear, saveTripGear, deleteTripGear, type TripGearInput } from './data/tripGearRepository'
import { getLibraryPhotos, getSeedPhotoPath, getFullImgurImage, type LibraryRow } from './domain/library'
import type { TripGearCarryMode, TripGearItem } from './domain/trips'
import './trip-gear.css'

const modeLabels: Record<TripGearCarryMode, string> = {
  pack: 'В рюкзаке', worn: 'На себе', outside: 'Снаружи рюкзака',
}
function photoFor(row?: LibraryRow): string | null {
  if (!row) return null
  const local = getLibraryPhotos(row)[0]?.src
  if (local) return local
  const path = getSeedPhotoPath(row)
  if (path) return import.meta.env.BASE_URL + path
  return getFullImgurImage(row.photoUrl)
}
function empty(): TripGearInput {
  return { gearId:'', quantity:1, placement:'', carryMode:'pack', packed:false, notes:'' }
}
export default function TripGearPage() {
  const { tripId = '' } = useParams()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const gear = useLiveQuery(() => db.gear.toArray(), [])
  const entries = useLiveQuery(() => getTripGear(tripId), [tripId])
  const [adding,setAdding] = useState(false)
  const [editing,setEditing] = useState<TripGearItem | null>(null)
  const [form,setForm] = useState<TripGearInput>(empty)
  const [filter,setFilter] = useState('')
  const [error,setError] = useState('')
  const [saving,setSaving] = useState(false)
  const list = useMemo(()=>[...(entries ?? [])].sort((a,b) => a.placement.localeCompare(b.placement,'ru') || a.createdAt.localeCompare(b.createdAt)),[entries])
  const choices = useMemo(() => [...(gear ?? [])].filter(row => [row.name,row.brand,row.model,
    [row.brand,row.model].filter(Boolean).join(' '),[row.name,row.brand,row.model].filter(Boolean).join(' ')]
    .some(v => String(v??'').toLocaleLowerCase('ru').includes(filter.toLocaleLowerCase('ru'))))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru')).slice(0,80),[gear,filter])
  const lookup = new Map((gear ?? []).map(row => [row.id,row]))
  const packedCount = list.filter(item=>item.packed).length
  function begin(row?:TripGearItem) {
    setEditing(row ?? null);setForm(row ? {
      gearId:row.gearId,quantity:row.quantity,placement:row.placement,
      carryMode:row.carryMode,packed:row.packed,notes:row.notes,
    }:empty());setError('');setFilter('');setAdding(true)
  }
  async function submit(e:FormEvent) {
    e.preventDefault();setSaving(true);setError('')
    try { await saveTripGear(tripId,form,editing?.id);setAdding(false) }
    catch(err) { setError(err instanceof Error?err.message:'Не удалось сохранить') }
    finally {setSaving(false)}
  }
  async function toggle(row:TripGearItem) {
    try { await saveTripGear(tripId,{...row,packed:!row.packed},row.id) }
    catch(err) {setError(err instanceof Error?err.message:'Ошибка')}
  }
  async function remove(row:TripGearItem) {
    if(!window.confirm('Удалить предмет из списка этого похода?')) return
    try { await deleteTripGear(tripId,row.id) }
    catch(err) {setError(err instanceof Error?err.message:'Ошибка удаления')}
  }
  if (trip===undefined||!gear||!entries) return <div className="loading-state">Загружаем снаряжение похода…</div>
  if(!trip) return <div className="empty-state"><p>Поход не найден.</p><Link to="/" className="button secondary">К походам</Link></div>
  return <div className="trip-gear-page">
    <Link className="back-link" to={'/trips/'+tripId}><ArrowLeft size={18}/> {trip.title}</Link>
    <div className="page-heading"><div><p className="eyebrow">КОМПЛЕКТАЦИЯ КОНКРЕТНОГО ПОХОДА</p>
      <h1>Снаряжение похода</h1>
      <p className="page-description">Список для «{trip.title}». Место размещения и отметка об упаковке относятся только к этому походу и не изменяют общую библиотеку.</p></div>
      <div className="heading-actions"><button className="button primary" onClick={()=>begin()}><Plus size={17}/> Добавить предмет</button></div>
    </div>
    <div className="trip-gear-summary"><Backpack size={21}/> {list.length} позиций · собрано {packedCount} · ещё {list.length-packedCount}</div>
    {error && !adding && <p role="alert" className="library-error">{error}</p>}
    {list.length ? <div className="trip-gear-rows">
      {list.map(row=>{
        const ref=lookup.get(row.gearId);const photo=photoFor(ref)
        return <div key={row.id} className="trip-gear-row">
          <input type="checkbox" aria-label={'Собрано: '+String(ref?.name??'предмет')} checked={row.packed} onChange={()=>void toggle(row)}/>
          <div className="trip-gear-photo">{photo?<img src={photo} alt=""/>:<Backpack size={21}/>}</div>
          <div className="trip-gear-description"><strong>{String(ref?.name??'Предмет удалён из библиотеки')}</strong>
            <span>{[ref?.model, 'Кол-во: '+row.quantity, modeLabels[row.carryMode]].filter(Boolean).join(' · ')}</span>
            <small><b>Место:</b> {row.placement||'Не назначено'}{row.notes ? ' · '+row.notes : ''}</small>
          </div>
          <div className="trip-gear-actions"><button className="icon-button" aria-label="Изменить размещение" onClick={()=>begin(row)}><Pencil size={18}/></button>
            <button className="icon-button" aria-label="Убрать из похода" onClick={()=>void remove(row)}><Trash2 size={18}/></button></div>
        </div>
      })}
    </div> : <div className="panel trip-gear-empty"><Backpack size={34}/><h2>Список снаряжения пуст</h2>
      <p>Добавляй предметы из общей библиотеки — затем назначай каждому место в рюкзаке или на себе.</p>
      <button className="button primary" onClick={()=>begin()}><Plus size={17}/> Добавить</button></div>}
    {adding&&<div className="library-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setAdding(false)}}>
      <section className="library-modal" role="dialog" aria-label="Снаряжение конкретного похода" aria-modal="true">
        <div className="library-modal-top"><div><p className="eyebrow">СНАРЯЖЕНИЕ ПОХОДА</p><h2>{editing?'Редактировать предмет':'Добавить предмет'}</h2></div>
          <button aria-label="Закрыть" className="icon-button" onClick={()=>setAdding(false)}><X size={20}/></button></div>
        <form onSubmit={e=>void submit(e)} className="trip-gear-form">
          <label className="field">Поиск в библиотеке<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Название или модель"/></label>
          <label className="field">Предмет <span className="required">*</span>
            <select required value={form.gearId} onChange={e=>setForm({...form,gearId:e.target.value})}>
              <option value="">Выберите модель</option>
              {choices.map(row=><option key={row.id} value={row.id}>{String(row.name)} {String(row.model||'')}</option>)}
              {form.gearId&&!choices.some(row=>row.id===form.gearId)&&
                <option value={form.gearId}>{String(lookup.get(form.gearId)?.name||'Выбранная модель')}</option>}
            </select></label>
          <label className="field">Количество<input type="number" min="1" max="99" required value={form.quantity}
            onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/></label>
          <label className="field">Как переносится<select value={form.carryMode}
            onChange={e=>setForm({...form,carryMode:e.target.value as TripGearCarryMode})}>
            {Object.entries(modeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field">Место размещения<input value={form.placement} maxLength={120}
            onChange={e=>setForm({...form,placement:e.target.value})}
            placeholder="Например: левый поясной карман, спальник, джетбойл"/></label>
          <label className="field">Заметки для этого похода<textarea rows={2} maxLength={1000} value={form.notes}
            onChange={e=>setForm({...form,notes:e.target.value})}/></label>
          <label className="trip-gear-checkbox"><input type="checkbox" checked={form.packed}
            onChange={e=>setForm({...form,packed:e.target.checked})}/> Уже собрано</label>
          {error&&<p className="library-error" role="alert">{error}</p>}
          <div className="library-modal-actions"><button type="button" className="button secondary" onClick={()=>setAdding(false)}>Отмена</button>
            <button type="submit" className="button primary" disabled={saving}><Check size={16}/> Сохранить</button></div>
        </form>
      </section>
    </div>}
  </div>
}
