import { useState, type FormEvent } from 'react'
import { adminStatisticsKey } from '../../lib/adminStatistics'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { adminCollections, collectionBucket, isCollectionSchemaMissing, type StoreCollection } from '../../lib/collections'
import { db } from '../../lib/store'
import { useShop } from '../../contexts/Shop'
import { mediaId, uploadImage } from './media'

function slugFor(name: string) {
 const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
 return (base || 'collection') + '-' + mediaId().slice(0, 12)
}

export function Collections() {
 const query = useQuery(adminCollections)
 const client = useQueryClient()
 const { setNotice } = useShop()
 const [editor, setEditor] = useState<StoreCollection | 'new' | null>(null)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const rows = query.data ?? []
 const current = editor === 'new' ? undefined : editor ?? undefined
 const schemaMissing = isCollectionSchemaMissing(query.error)

 async function refresh() {
  await Promise.all([
   client.invalidateQueries({ queryKey: ['collections'] }),
   client.invalidateQueries({ queryKey: ['collection-products'] }),
   client.invalidateQueries({ queryKey: ['collection-memberships'] }),
   client.invalidateQueries({ queryKey: adminStatisticsKey }),
  ])
 }

 async function save(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (busy) return
  const form = new FormData(event.currentTarget)
  const name = String(form.get('name') ?? '').trim()
  const file = form.get('cover')
  const id = current?.id ?? crypto.randomUUID()
  if (!name) { setError('Saisissez le nom de la collection.'); return }
  setBusy(true)
  setError('')
  let staged: string | undefined
  let removeStaged = true
  try {
   if (file instanceof File && file.size) staged = await uploadImage(file, id, collectionBucket)
   const changes = { name, published: form.has('published'), ...(staged ? { image_path: staged } : {}) }
   removeStaged = false
   let request = current
    ? db!.from('collections').update(changes).eq('id', id)
    : db!.from('collections').insert({ ...changes, id, slug: slugFor(name) })
   if (current && staged) request = current.image_path ? request.eq('image_path', current.image_path) : request.is('image_path', null)
   const result = await request.select('id').single()
   if (result.error) {
    removeStaged = result.status > 0 && result.status < 500
    throw new Error(removeStaged ? 'Enregistrement impossible. Actualisez la liste puis réessayez.' : 'Réponse incertaine. Vérifiez la liste avant de réessayer.')
   }
   setEditor(null)
   if (staged && current?.image_path) await db!.storage.from(collectionBucket).remove([current.image_path])
   setNotice('Collection enregistrée.')
  } catch (failure) {
   if (staged && removeStaged) await db!.storage.from(collectionBucket).remove([staged])
   setError(failure instanceof Error ? failure.message : 'Enregistrement impossible.')
  } finally {
   await refresh()
   setBusy(false)
  }
 }

 async function change(row: StoreCollection, action: 'publish' | 'delete' | 'move', neighbor?: StoreCollection, direction?: number) {
  if (busy) return
  if (action === 'delete' && !window.confirm('Supprimer la collection « ' + row.name + ' » ? Les parfums seront conservés.')) return
  setBusy(true)
  setError('')
  try {
   const result = action === 'move'
    ? await db!.rpc('move_collection', { p_id: row.id, p_neighbor_id: neighbor?.id, p_direction: direction })
    : action === 'delete'
     ? await db!.from('collections').delete().eq('id', row.id).select('id').single()
     : await db!.from('collections').update({ published: !row.published }).eq('id', row.id).select('id').single()
   if (result.error) throw result.error
   if (action === 'delete' && row.image_path) await db!.storage.from(collectionBucket).remove([row.image_path])
  } catch {
   setError('Modification impossible. La liste a été actualisée. Réessayez.')
  } finally {
   await refresh()
   setBusy(false)
  }
 }

 function open(item: StoreCollection | 'new' | null) {
  setError('')
  setEditor(item)
 }

 return <>
  <div className="admin-page-heading"><h1>Collections</h1><button className="button primary" disabled={busy || Boolean(editor) || !query.isSuccess} onClick={()=>open('new')}>Ajouter une collection</button></div>
  {editor && <form className="panel fields admin-block collection-editor" key={current?.id ?? 'new'} onSubmit={save} aria-busy={busy}>
   <h2>{current ? 'Modifier la collection' : 'Nouvelle collection'}</h2>
   <fieldset className="fields collection-editor-fields" disabled={busy}>
    <label>Nom de la collection<input name="name" defaultValue={current?.name} maxLength={150} required/></label>
    {current?.imageUrl && <img className="admin-preview" src={current.imageUrl} alt="Couverture actuelle"/>}
    <label>Image de couverture<input name="cover" type="file" accept="image/jpeg,image/png,image/webp,image/avif"/></label>
    <label className="check"><input name="published" type="checkbox" defaultChecked={current?.published}/> Publier sur la boutique</label>
    <div className="actions"><button className="button primary">Enregistrer</button><button className="button" type="button" onClick={()=>open(null)}>Annuler</button></div>
   </fieldset>
  </form>}
  {error && <p role="alert">{error}</p>}
  {query.isPending && <p role="status">Chargement des collections…</p>}
  {query.isError && <p role="alert">{schemaMissing ? 'Appliquez la migration Supabase 202611240004 pour activer les collections.' : 'Collections indisponibles.'} <button className="text-link" onClick={()=>void query.refetch()}>Réessayer</button></p>}
  {query.isSuccess && !rows.length && <p className="empty">Aucune collection pour le moment.</p>}
  <ol className="admin-collection-list">
   {rows.map((row,index)=><li className="panel admin-collection" key={row.id}>
    {row.imageUrl && <img className="admin-preview" src={row.imageUrl} alt=""/>}
    <div>
     <h2>{row.name}</h2>
     <span className="publication-badge" data-published={row.published}>{row.published ? 'Publiée' : 'Brouillon'}</span>
     <p>{row.product_collections?.[0]?.count ?? 0} parfum(s)</p>
    </div>
    <div className="actions">
     <button className="icon" disabled={busy || Boolean(editor) || index===0} aria-label={'Monter '+row.name} onClick={()=>void change(row,'move',rows[index-1],-1)}><ArrowUp size={17}/></button>
     <button className="icon" disabled={busy || Boolean(editor) || index===rows.length-1} aria-label={'Descendre '+row.name} onClick={()=>void change(row,'move',rows[index+1],1)}><ArrowDown size={17}/></button>
     <button className="button" disabled={busy || Boolean(editor)} onClick={()=>open(row)}>Modifier</button>
     <button className="button" disabled={busy || Boolean(editor)} onClick={()=>void change(row,'publish')}>{row.published ? 'Dépublier' : 'Publier'}</button>
     <button className="text-link" disabled={busy || Boolean(editor)} onClick={()=>void change(row,'delete')}>Supprimer</button>
    </div>
   </li>)}
  </ol>
 </>
}
