import { useState, type ChangeEvent } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { getLibraryPhotos, getSeedPhotoPath, MAX_PHOTOS, type LibraryPhoto, type LibraryRow, type LibraryTableName } from './domain/library'
import { saveLibraryPhotos } from './data/libraryRepository'
import './library-photos.css'

async function compress(file: File): Promise<LibraryPhoto> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Поддерживаются JPG, PNG и WebP')
  if (file.size > 8 * 1024 * 1024) throw Error('Файл превышает 8 МБ')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(Error('Не удалось открыть фото'))
      img.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw Error('Повреждённое изображение')
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw Error('Обработка изображений в браузере недоступна')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const src = canvas.toDataURL('image/webp', 0.77)
    if (src.length > 300000) throw Error('Фотография слишком велика после уменьшения')
    return { src, name: file.name.slice(0, 140) }
  } finally { URL.revokeObjectURL(url) }
}
export function LibraryPhotos({ table, row, notify }: {
  table: LibraryTableName; row: LibraryRow; notify: (text: string, error?: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const localPhotos = getLibraryPhotos(row)
  const publicPath = getSeedPhotoPath(row)
  const showPublic = localPhotos.length === 0 && !!publicPath
  const photos: LibraryPhoto[] = showPublic && publicPath ?
    [{ src: import.meta.env.BASE_URL + publicPath, name: 'Фото из каталога снаряжения' }] : localPhotos
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (localPhotos.length + files.length > MAX_PHOTOS) {
      notify('Для карточки доступно максимум четыре фотографии', true); return
    }
    setBusy(true)
    try {
      await saveLibraryPhotos(table, row.id, [...localPhotos, ...await Promise.all(files.map(compress))])
      notify('Фотографии сохранены локально')
    } catch (e) { notify(e instanceof Error ? e.message : 'Ошибка загрузки фото', true) }
    finally { setBusy(false) }
  }
  async function remove(index: number) {
    if (!window.confirm('Удалить фотографию?')) return
    setBusy(true)
    try {
      await saveLibraryPhotos(table, row.id, localPhotos.filter((_, i) => i !== index))
      notify('Фотография удалена')
    } catch (e) { notify(e instanceof Error ? e.message : 'Ошибка удаления фото', true) }
    finally { setBusy(false) }
  }
  return <section className="library-photo-panel" aria-label="Фотографии">
    <div className="library-photo-head">
      <h3><Camera size={16}/> Фотографии · {photos.length}/{MAX_PHOTOS}</h3>
      <label className={'button secondary library-file-button' + (busy || localPhotos.length >= MAX_PHOTOS ? ' library-upload-disabled' : '')}>
        <ImagePlus size={16}/> Добавить фото
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple
          aria-label="Выбрать фотографии" disabled={busy || photos.length >= MAX_PHOTOS}
          onChange={event => void upload(event)}/>
      </label>
    </div>
    {photos.length ? <div className="library-photos-grid">
      {photos.map((p, i) => <figure key={i} className="library-photo-item">
        <img loading="lazy" src={p.src} alt={'Фото: ' + p.name}/>
        <figcaption title={p.name}>{p.name}</figcaption>
        {!showPublic && <button type="button" className="library-photo-remove" title="Удалить"
          aria-label={'Удалить фото ' + (i + 1)} disabled={busy} onClick={() => void remove(i)}><Trash2 size={15}/></button>}
      </figure>)}
    </div> : <div className="library-photo-empty"><Camera size={25}/><span>Фотографии пока не добавлены</span></div>}
    {showPublic && <p className="library-photo-caption">Фото из предоставленной папки Google Drive, встроено в публичную версию Hiking Planner. Свой снимок можно добавить вместо него.</p>}
    <p className="library-photo-caption">JPG/PNG/WebP до 8 МБ. Пользовательские фото уменьшаются до 640 px и хранятся в браузере; JSON-бэкап включает их.</p>
  </section>
}
