import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { db, money, statuses, photoUrl, type City, type Order, type Settings, type Status, settings, defaults } from '../../lib/store'
import { orderQuery } from './Admin'
import { useShop } from '../../contexts/Shop'
import { uploadImage } from './media'

const next:Partial<Record<Status,Status>>={pending:'confirmed',confirmed:'preparing',preparing:'shipped',shipped:'delivered'}
const orderDate = new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Casablanca'})
function OrderEditor({order,expanded}:{order:Order;expanded:boolean}) {
 const query=useQueryClient()
 const {setNotice}=useShop()
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 async function save(e:FormEvent<HTMLFormElement>) {
   e.preventDefault()
   const submitter = (e.nativeEvent as SubmitEvent).submitter
   const data = new FormData(e.currentTarget,submitter)
   const status = String(data.get('action') ?? data.get('status'))
   if(status==='cancelled' && order.status!=='cancelled' && !confirm('Annuler cette commande et remettre les articles en stock ?')) return
   setBusy(true); setError('')
   try {
    const result=await db!.rpc('manage_order',{p_id:order.id,p_status:status,p_note:String(data.get('note'))})
    if(result.error) throw result.error
    await query.invalidateQueries()
    setNotice('Commande mise à jour.')
   } catch { setError('Modification impossible. Actualisez la commande et réessayez.') }
   finally { setBusy(false) }
 }
 return <details className="panel order-entry" open={expanded||undefined}>
 <summary><div className="order-summary"><div><strong>{order.customer_name}</strong><span>{order.reference}</span></div><div><strong>{money(order.total)}</strong><span className="order-status" data-status={order.status}>{statuses[order.status]}</span></div><time dateTime={order.created_at}>{orderDate.format(new Date(order.created_at))}</time></div></summary>
 <div className="order-details"><dl className="order-contact"><div><dt>Téléphone</dt><dd><a className="text-link" href={'tel:'+order.phone}>{order.phone}</a></dd></div><div><dt>Adresse de livraison</dt><dd>{order.address}, {order.city_name}</dd></div></dl>
 {order.notes&&<p>{order.notes}</p>}<h3>Parfums commandés</h3><ul>{order.order_items.map(i=><li key={i.variant_id}>{i.quantity} × {i.product_name} · {i.size_ml} ml · {money(i.quantity*i.unit_price)}</li>)}</ul><p>Sous-total {money(order.subtotal)} · Livraison {money(order.delivery_fee)}</p>
 <form className="fields" onSubmit={save} key={order.status+order.internal_note}><label>Statut<select name="status" defaultValue={order.status}><option value={order.status}>{statuses[order.status]}</option>{next[order.status]&&<><option value={next[order.status]}>{statuses[next[order.status]!]}</option><option value="cancelled">Annulée</option></>}</select></label><label>Note interne<textarea name="note" defaultValue={order.internal_note} maxLength={2000}/></label>{error&&<p role="alert">{error}</p>}<div className="actions"><button className="button" disabled={busy}>Enregistrer</button>{order.status==='pending'&&<button className="button primary" name="action" value="confirmed" disabled={busy}>Confirmer la commande</button>}</div></form>
 <h3>Historique</h3><ul>{[...order.order_status_history].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(h=><li key={h.created_at+h.status}>{statuses[h.status]} · {orderDate.format(new Date(h.created_at))}</li>)}</ul></div></details>
}
export function Orders(){
 const [params]=useSearchParams()
 const [search,setSearch]=useState(params.get('ref')??'')
 const [status,setStatus]=useState('')
 const result=useQuery(orderQuery)
 const filtered=result.data?.filter(o=>(!status||o.status===status)&&[o.reference,o.customer_name,o.phone,o.city_name,...o.order_items.map(item=>item.product_name)].some(v=>v.toLowerCase().includes(search.trim().toLowerCase())))
 return <><h1>Commandes</h1><div className="admin-order-filters"><label>Recherche<input type="search" placeholder="Référence, client, parfum…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Statut<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous</option>{Object.entries(statuses).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
 {result.isError?<p role="alert">Impossible de charger les commandes.</p>:result.isPending?<p>Chargement…</p>:filtered?.length?filtered.map(order=><OrderEditor key={order.id} order={order} expanded={params.get('ref')===order.reference}/>):<p>Aucune commande trouvée.</p>}</>
}
function CityEditor({city,onClose}:{city?:City;onClose:()=>void}) {
 const query=useQueryClient()
 const {setNotice}=useShop()
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 async function save(event:FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if(busy||!db)return
  const values=new FormData(event.currentTarget)
  const name=String(values.get('name')).trim()
  const option=String(values.get('option')).trim()
  const feeText=String(values.get('fee')).trim()
  const fee=Number(feeText)
  if(!name||!option||!feeText||!Number.isFinite(fee)||fee<0||fee>10000){
   setError('Renseignez le nom, le mode de livraison et des frais valides en MAD.');return
  }
  setBusy(true);setError('')
  try {
   const changes={name,fee,option,enabled:values.has('enabled')}
   const table=db.from('delivery_cities')
   const {error}=await (city?table.update(changes).eq('id',city.id):table.insert(changes)).select('id').single()
   if(error){setError(error.code==='23505'?'Cette ville existe déjà.':'Enregistrement impossible. Vérifiez les données puis réessayez.');return}
   await Promise.all([
    query.invalidateQueries({queryKey:['admin-cities']}),
    query.invalidateQueries({queryKey:['cities']})
   ])
   setNotice('Ville enregistrée.')
   onClose()
  } catch {
   setError('Enregistrement impossible. Vérifiez la connexion puis réessayez.')
  } finally {setBusy(false)}
 }
 return <form className="panel fields delivery-editor" aria-labelledby="delivery-editor-title" aria-busy={busy} onSubmit={save}>
  <h2 id="delivery-editor-title">{city?'Modifier '+city.name:'Ajouter une ville'}</h2>
  <fieldset className="fields delivery-editor-fields" disabled={busy}>
   <div className="form-grid">
    <label>Ville<input name="name" defaultValue={city?.name} required maxLength={100}/></label>
    <label>Frais de livraison (MAD)<input name="fee" type="number" min="0" max="10000" step="0.01" defaultValue={city?.fee} required/></label>
   </div>
   <label className="check"><input type="checkbox" name="enabled" defaultChecked={city?.enabled??true}/> Livraison disponible</label>
   <details><summary>Mode de livraison</summary><label>Libellé du mode de livraison<input name="option" defaultValue={city?.option??'Livraison à domicile'} maxLength={150}/></label></details>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
  <div className="actions"><button className="button primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer'}</button><button className="button" type="button" disabled={busy} onClick={onClose}>Annuler</button></div>
 </form>
}
export function Delivery() {
 const result=useQuery({queryKey:['admin-cities'],queryFn:async()=>{
  const {data,error}=await db!.from('delivery_cities').select('id,name,fee,enabled,option').order('name')
  if(error)throw error
  return data as City[]
 }})
 const [editing,setEditing]=useState<string|null>(null)
 const selected=result.data?.find(city=>city.id===editing)
 return <section className="admin-delivery">
  <div className="admin-page-heading"><h1>Livraison</h1><button type="button" className="button primary" onClick={()=>setEditing('new')}>Ajouter une ville</button></div>
  {editing==='new'&&<CityEditor key="new" onClose={()=>setEditing(null)}/>}
  {result.isError?<p role="alert">Impossible de charger les villes. <button type="button" className="text-link" onClick={()=>void result.refetch()}>Réessayer</button></p>:result.isPending?<p role="status">Chargement des villes…</p>:result.data.length===0?<p className="empty">Aucune ville de livraison configurée.</p>:<div className="delivery-city-list">
   {result.data.map(city=>selected?.id===city.id?<CityEditor key={city.id} city={city} onClose={()=>setEditing(null)}/>:<article className="panel delivery-city-row" key={city.id}>
    <div><h2>{city.name}</h2><span className="publication-badge" data-published={city.enabled}>{city.enabled?'Activée':'Désactivée'}</span></div>
    <span className="delivery-fee">{money(city.fee)}</span>
    <button type="button" className="button" onClick={()=>setEditing(city.id)} aria-label={'Modifier '+city.name}>Modifier</button>
   </article>)}
  </div>}
 </section>
}
const configFields: [keyof Settings,string,boolean?][] = [['name','Nom de la boutique'],['headline','Titre de la bannière',true],['description','Description',true],['promotion','Promotion',true],['instagram','URL Instagram'],['whatsapp','Numéro WhatsApp (212…)'],['contact','Coordonnées',true],['delivery','Informations de livraison',true]]
function SettingsEditor({config}:{config:Settings}) {
 const query=useQueryClient()
 const {setNotice}=useShop()
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 async function save(e:FormEvent<HTMLFormElement>){
   e.preventDefault()
   const form=new FormData(e.currentTarget)
   const values={...config}
   for(const [field] of configFields) values[field]=String(form.get(field)).trim()
   const staged:string[]=[]
   setBusy(true);setError('')
   try {
     for(const field of ['logo','banner'] as const){
       const file=form.get(field)
       if(file instanceof File && file.size) { values[field]=await uploadImage(file,'site'); staged.push(values[field]) }
       else if(form.has('remove-'+field)) values[field]=''
     }
     const result=await db!.from('store_settings').update(values).eq('id',1).select('id').single()
     if(result.error) throw result.error
     const replaced=[config.logo,config.banner].filter(path=>path&&path!==values.logo&&path!==values.banner)
     if(replaced.length) await db!.storage.from('store-media').remove(replaced)
     await query.invalidateQueries({queryKey:['settings']});setNotice('Paramètres enregistrés.')
   } catch {
     if(staged.length) await db!.storage.from('store-media').remove(staged)
     setError('Enregistrement impossible. Vérifiez notamment les liens et le numéro WhatsApp.')
   } finally {setBusy(false)}
 }
 return <form className="panel fields" onSubmit={save}>{configFields.map(([key,label,multi])=><label key={key}>{label}{multi?<textarea name={key} defaultValue={config[key]} maxLength={1500} required={key==='headline'}/>:<input name={key} defaultValue={config[key]} maxLength={200} required={key==='name'} type={key==='instagram'?'url':'text'}/>}</label>)}
 {(['logo','banner'] as const).map(key=><div key={key}>{config[key]&&<img className="admin-preview" src={photoUrl(config[key])} alt={key==='logo'?'Logo':'Bannière'}/>}<label>{key==='logo'?'Logo':'Bannière'}<input name={key} type="file" accept="image/jpeg,image/png,image/webp,image/avif"/></label>{config[key]&&<label className="check"><input type="checkbox" name={'remove-'+key}/> Retirer cette image</label>}</div>)}
 {error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>Enregistrer</button></form>
}
export function StoreSettings(){const {data,isPending,isError}=useQuery(settings);return <><h1>Paramètres</h1>{isError?<p role="alert">Impossible de charger les paramètres.</p>:isPending?<p>Chargement…</p>:<SettingsEditor key={JSON.stringify(data)} config={data??defaults}/>}</>}

