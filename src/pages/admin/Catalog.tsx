import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ImagePlus, X } from 'lucide-react'
import { brandName, catalog, db, money, photos, photoUrl, price, productFields, variants, type Product, type Taxon, type Variant } from '../../lib/store'
import { adminCollections, isCollectionSchemaMissing, productMemberships } from '../../lib/collections'
import { ProductPhoto } from '../../components/StoreUI'
import { useShop } from '../../contexts/Shop'
import { fetchAll } from './Admin'
import { mediaId, uploadImage } from './media'
import { adminStatisticsKey } from '../../lib/adminStatistics'

const productsQuery={queryKey:['admin-products'],queryFn:async()=> (await fetchAll<Product>('products',productFields)).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
type TaxonTable='brands'|'categories'
function useTaxons(table:TaxonTable) {
 return useQuery({queryKey:[table],queryFn:async()=> (await fetchAll<Taxon>(table,'id,name')).sort((a,b)=>a.name.localeCompare(b.name))})
}
const presetSizes = ['30','50','100','200']
let nextDraftKey = 0
function draft(variant?:Variant) {
 const size = variant ? String(variant.size_ml) : ''
 const custom = Boolean(size && !presetSizes.includes(size))
 return {
  key: variant?.id ?? ('draft-' + ++nextDraftKey),
  size: custom ? 'custom' : size,
  customSize: custom ? size : '',
  price: variant ? String(variant.price) : '',
  stock: variant ? String(variant.stock) : undefined,
  saved: Boolean(variant)
 }
}
type DraftVariant = ReturnType<typeof draft>

function Preview({file}:{file:File}) {
 const [url,setUrl]=useState('')
 useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file])
 return url&&<img className="admin-preview" src={url} alt="Aperçu avant envoi"/>
}

function ProductEditor({product,onClose}:{product?:Product;onClose:()=>void}) {
 const client=useQueryClient()
 const {setNotice}=useShop()
 const brands=useTaxons('brands')
 const categories=useTaxons('categories')
 const collections=useQuery(adminCollections)
 const memberships=useQuery(productMemberships(product?.id))
 const [selection,setSelection]=useState<string[]|null>(null)
 const selectedCollections=selection??memberships.data??[]
 const selectedCollectionNames=collections.data?.filter(collection=>selectedCollections.includes(collection.id)).map(collection=>collection.name)??[]
 const existing=product?photos(product):[]
 const [originalVariants]=useState(()=>product?.product_variants??[])
 const [removed,setRemoved]=useState<string[]>([])
 const [files,setFiles]=useState<File[]>([])
 const [brandId,setBrandId]=useState(product?.brand_id??'')
 const [brandDraft,setBrandDraft]=useState('')
 const [brandBusy,setBrandBusy]=useState(false)
 const [brandError,setBrandError]=useState('')
 const [brandNotice,setBrandNotice]=useState('')
 const brandDialog=useRef<HTMLDialogElement>(null)
 const [categoryId,setCategoryId]=useState(product?.category_id??'')
 const [published,setPublished]=useState(product?.published??false)
 const [rows,setRows]=useState(()=> {
  const active=originalVariants.filter(variant=>variant.active).sort((a,b)=>a.size_ml-b.size_ml)
  return active.length ? active.map(draft) : [draft()]
 })
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const title=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{title.current?.focus()},[])
 function edit(key:string,values:Partial<DraftVariant>) {
  setRows(current=>current.map(row=>row.key===key?{...row,...values}:row))
 }
 function getSize(row:DraftVariant) {
  return Number(row.size==='custom'?row.customSize:row.size)
 }
 function getPreviousVariant(row:DraftVariant) {
  return originalVariants.find(variant=>variant.size_ml===getSize(row))
 }
 async function saveBrand(event:FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (brandBusy) return
  const name=brandDraft.trim()
  if (!name) {
   setBrandError('Saisissez le nom de la marque.')
   return
  }
  setBrandBusy(true)
  setBrandError('')
  try {
   const current=await fetchAll<Taxon>('brands','id,name')
   if (current.some(brand=>brand.name.trim().toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr'))) {
    setBrandError('Une marque porte déjà ce nom.')
    return
   }
   const {data,error}=await db!.from('brands').insert({name}).select('id,name').single()
   if (error) {
    setBrandError(error.code==='23505'?'Une marque porte déjà ce nom.':'Impossible d’enregistrer la marque. Réessayez.')
    return
   }
   await client.cancelQueries({queryKey:['brands'],exact:true})
   client.setQueryData<Taxon[]>(['brands'],cached=>{
    const updated=new Map([...current,...(cached??[]),data].map(brand=>[brand.id,brand]))
    return [...updated.values()].sort((a,b)=>a.name.localeCompare(b.name))
   })
   setBrandId(data.id)
   setBrandNotice(`La marque « ${data.name} » a été créée et sélectionnée.`)
   brandDialog.current?.close()
   void client.invalidateQueries({queryKey:['brands'],exact:true})
   void client.invalidateQueries({queryKey:adminStatisticsKey})
  } catch {
   setBrandError('Impossible d’enregistrer la marque. Réessayez.')
  } finally {
   setBrandBusy(false)
  }
 }
 async function save(event:FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (busy) return
  const form=new FormData(event.currentTarget)
  const name=String(form.get('name')).trim()
  if (!name || !categoryId || !brandId) {
   setError('Renseignez le nom, la marque et la catégorie du parfum.');return
  }
  const variants=rows.map(row=>{
   const previous=getPreviousVariant(row)
   const price=Number(row.price)
   const sale=previous?.sale_price
   return {
    size_ml:getSize(row),price,
    sale_price:sale!=null&&sale<price?sale:null,
    stock:Number(row.stock??previous?.stock??0)
   }
  })
  for (const [index,variant] of variants.entries()) {
   const format=`Format ${index+1}`
   if (!Number.isInteger(variant.size_ml)||variant.size_ml<1||variant.size_ml>5000) {
    setError(format+' — choisissez une taille entre 1 et 5 000 ml.');return
   }
   if (!Number.isFinite(variant.price)||variant.price<0.01||variant.price>999999.99) {
    setError(format+' — saisissez un prix valide en MAD.');return
   }
   if (!Number.isInteger(variant.stock)||variant.stock<0||variant.stock>100000) {
    setError(format+' — saisissez un stock entier entre 0 et 100 000.');return
   }
  }
  const stockChanges=variants.flatMap(variant=>{
   const previous=originalVariants.find(item=>item.size_ml===variant.size_ml)
   return previous && previous.stock!==variant.stock ? [{size_ml:variant.size_ml,expected:previous.stock,quantity:variant.stock}] : []
  })
  const kept=existing.filter(photo=>!removed.includes(photo.path)).map(photo=>photo.path)
  if (new Set(variants.map(variant=>variant.size_ml)).size!==rows.length) {
   setError('Choisissez une contenance différente pour chaque format.');return
  }
  if (kept.length+files.length>12) {
   setError('Sélectionnez au maximum 12 images.');return
  }
  const record={
   name,description:String(form.get('description')).trim(),brand_id:brandId,category_id:categoryId,
   published,featured:product?.featured??false,bestseller:product?.bestseller??false
  }
  const staged:string[]=[]
  let saved=false
  let saveUncertain=false
  setBusy(true);setError('')
  try {
   const folder=product?.id??mediaId()
   for (const file of files) staged.push(await uploadImage(file,folder))
   const args={p_id:product?.id??null,p_product:record,p_variants:variants,p_images:[...kept,...staged]}
   saveUncertain=true
   const result=selection!==null
    ? await db!.rpc('save_product_with_collections',{...args,p_stock_changes:stockChanges,p_collection_ids:selection})
    : stockChanges.length
    ? await db!.rpc('save_product_with_stock',{...args,p_stock_changes:stockChanges})
    : await db!.rpc('save_product',args)
   saveUncertain=result.status===0||result.status>=500
   if (result.error) {
    if(result.error.message==='STOCK_CHANGED') throw new Error('Le stock a changé depuis l’ouverture. Rouvrez le parfum pour voir le stock actuel, puis réessayez.')
    if(result.error.code==='PGRST202' && selection!==null) throw new Error('Appliquez la migration Supabase 202611240004 pour enregistrer les collections.')
    if(result.error.code==='PGRST202') throw new Error(stockChanges.length?'La modification du stock nécessite la migration Supabase 202611240002. Vous pouvez publier sans modifier le stock après avoir rouvert le parfum.':'La fonction d’enregistrement est indisponible. Vérifiez les migrations Supabase.')
    if(result.error.code==='42501'||result.error.message==='FORBIDDEN') throw new Error('Enregistrement refusé. Reconnectez-vous avec un compte administrateur autorisé.')
    if(result.error.code==='23503') throw new Error('La marque, la catégorie ou une collection a changé. Rouvrez le formulaire et vérifiez la sélection.')
    if(result.error.code==='23514') throw new Error('Supabase a refusé les données. Vérifiez la taille, le prix et la quantité en stock.')
    if(saveUncertain) throw new Error('La réponse du serveur est incertaine. Vérifiez le statut du parfum dans Produits avant de réessayer.')
    throw new Error(published?'Publication impossible. Vérifiez les champs et réessayez.':'Enregistrement impossible. Vérifiez les champs et réessayez.')
   }
   saved=true
   if (removed.length) await db!.storage.from('store-media').remove(removed)
   await client.invalidateQueries()
   setNotice(record.published ? 'Parfum publié dans la boutique.' : 'Parfum enregistré.')
   onClose()
  } catch (failure) {
   if (!saved&&!saveUncertain&&staged.length) await db!.storage.from('store-media').remove(staged)
   if (!saved) {
    void client.invalidateQueries({queryKey:productsQuery.queryKey})
    if (saveUncertain) void client.invalidateQueries({queryKey:adminStatisticsKey})
   }
   setError(failure instanceof Error?failure.message:'Enregistrement impossible. Réessayez.')
  } finally {setBusy(false)}
 }
 return <><form id="product-editor" className="panel fields admin-block simple-product-form" onSubmit={save} aria-labelledby="product-editor-title" aria-busy={busy}>
  <header className="product-form-header">
   <div><h2 ref={title} tabIndex={-1} id="product-editor-title">{product?'Modifier '+product.name:'Ajouter un parfum'}</h2><p>{product?'Modifier le produit':'Nouveau produit'} · {brandName}</p></div>
   <button className="icon product-form-close" type="button" aria-label="Fermer le formulaire" disabled={busy} onClick={onClose}><X size={19} aria-hidden/></button>
  </header>
  <fieldset className="fields product-form-fields" disabled={busy}>
   <div className="fields">
    <label className="product-upload">
     <span className="product-upload-icon"><ImagePlus size={23} aria-hidden/></span>
     <span>Photo du parfum</span>
     <span className="product-upload-hint">Choisir une image sur votre appareil</span>
     <input type="file" aria-label="Photo du parfum" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={event=>setFiles(Array.from(event.target.files??[]))}/>
    </label>
    {(existing.length>0||files.length>0)&&<div className="actions product-photo-previews">{existing.map(photo=><label key={photo.id}><img className="admin-preview" src={photoUrl(photo.path)} alt={product?.name}/><span className="check"><input type="checkbox" checked={removed.includes(photo.path)} onChange={event=>setRemoved(current=>event.target.checked?[...current,photo.path]:current.filter(path=>path!==photo.path))}/> Retirer</span></label>)}{files.map((file,index)=><Preview key={file.name+index} file={file}/>)}</div>}
   </div>
   <label>Nom du parfum<input name="name" defaultValue={product?.name} placeholder="Saisir le nom du parfum" required maxLength={150}/></label>
   <div className="product-form-pair">
   <div className="product-brand-field">
    <label>Marque<select value={brandId} onChange={event=>setBrandId(event.target.value)} required><option value="">Choisir la marque</option>{brands.data?.map(brand=><option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
    <button type="button" className="button" aria-haspopup="dialog" onClick={()=>{
     setBrandDraft('')
     setBrandError('')
     setBrandNotice('')
     brandDialog.current?.showModal()
    }}>+ Ajouter</button>
   </div>
   <label>Catégorie<select value={categoryId} onChange={event=>setCategoryId(event.target.value)} required><option value="">Choisir la catégorie</option>{categories.data?.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
   </div>
   {brandNotice&&<p role="status">{brandNotice}</p>}
   {(brands.isPending||categories.isPending)&&<p role="status">Chargement des marques et catégories…</p>}
   {(brands.isError||categories.isError)&&<p role="alert">Marques ou catégories indisponibles. <button type="button" className="text-link" onClick={()=>{void brands.refetch();void categories.refetch()}}>Réessayer</button></p>}
   {categories.data?.length===0&&<p>Aucune catégorie n’est disponible.</p>}
   <fieldset className="product-format product-collections">
    <legend>Collections</legend>
    {(collections.isPending || (product && memberships.isPending)) && <p role="status">Chargement des collections…</p>}
    {(collections.isError || memberships.isError) && <p role="alert">{[collections.error,memberships.error].some(isCollectionSchemaMissing) ? 'Appliquez la migration Supabase 202611240004 pour assigner des collections.' : 'Collections indisponibles.'} <button type="button" className="text-link" onClick={()=>{void collections.refetch();if(product)void memberships.refetch()}}>Réessayer</button></p>}
    {collections.data?.length===0 && <p>Aucune collection. Créez-en une dans le menu Collections.</p>}
    {!collections.isError && (!product || memberships.isSuccess) && Boolean(collections.data?.length) && <details className="product-collection-picker" onBlur={event=>{
     if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open=false
    }} onKeyDown={event=>{
     if (event.key==='Escape' && event.currentTarget.open) {
      event.currentTarget.querySelector('summary')?.focus()
      event.currentTarget.open=false
     }
    }}>
     <summary>
      <span>{selectedCollectionNames.join(', ') || 'Choisir la collection'}</span>
      <ChevronDown size={16} aria-hidden/>
     </summary>
     <div className="product-collection-options">
      {collections.data?.map(collection=><label className="check" key={collection.id}>
       <input type="checkbox" checked={selectedCollections.includes(collection.id)} onChange={event=>{
        const checked=event.target.checked
        setSelection(current=>{
         const ids=current??memberships.data??[]
         return checked ? [...ids,collection.id] : ids.filter(id=>id!==collection.id)
        })
       }}/>
       {collection.name}{!collection.published && ' (brouillon)'}
      </label>)}
     </div>
    </details>}
   </fieldset>
   {rows.map((row,index)=><fieldset key={row.key} className="product-format">
    {rows.length>1&&<legend>Format {index+1}</legend>}
    <div className="product-form-pair">
     <label>Taille<select value={row.size} onChange={event=>edit(row.key,{size:event.target.value,stock:undefined})} required disabled={row.saved}><option value="">Choisir la taille</option>{presetSizes.map(size=><option key={size} value={size}>{size} ml</option>)}<option value="custom">Personnalisée</option></select></label>
     <label>Prix (MAD)<input type="number" min="0.01" max="999999.99" step="0.01" placeholder="0,00" required value={row.price} onChange={event=>edit(row.key,{price:event.target.value})}/></label>
     {row.size==='custom'&&<label className="product-field-wide">Taille personnalisée (ml)<input type="number" min="1" max="5000" required readOnly={row.saved} value={row.customSize} onChange={event=>edit(row.key,{customSize:event.target.value,stock:undefined})}/></label>}
    </div>
    <label>Quantité en stock<input type="number" min="0" max="100000" required value={row.stock??getPreviousVariant(row)?.stock??0} onChange={event=>edit(row.key,{stock:event.target.value})}/></label>
    {rows.length>1&&<button className="text-link" type="button" onClick={()=>setRows(current=>current.filter(item=>item.key!==row.key))}>Retirer ce format</button>}
   </fieldset>)}
   {product&&<button className="button add-format" type="button" disabled={rows.length>=30} onClick={()=>setRows(current=>[...current,draft()])}>Ajouter une contenance</button>}
   <label>Description (facultative)<textarea name="description" defaultValue={product?.description} placeholder="Décrire le parfum en quelques mots" maxLength={5000}/></label>
   <label className="product-publish"><span>Publier ce parfum dans la boutique</span><input name="published" type="checkbox" role="switch" checked={published} onChange={event=>setPublished(event.target.checked)}/><span className="product-switch" aria-hidden/></label>
   <p className="product-upload-hint">{published?'Enregistrez pour afficher ce parfum dans la boutique.':'Brouillon. Ce parfum reste visible uniquement dans l’administration.'}</p>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
  {busy&&<p role="status">Enregistrement du parfum…</p>}
  <button className="button primary product-form-submit" disabled={busy||brands.isPending||!categories.data?.length}>Enregistrer le parfum</button>
 </form>
 <dialog ref={brandDialog} className="panel product-brand-dialog" aria-labelledby="product-brand-title" onCancel={event=>{
  if (brandBusy) event.preventDefault()
 }}>
  <form className="fields" onSubmit={saveBrand} aria-busy={brandBusy}>
   <h2 id="product-brand-title">Ajouter une marque</h2>
   <label>Nom de la marque<input value={brandDraft} onChange={event=>setBrandDraft(event.target.value)} required maxLength={100} autoFocus disabled={brandBusy}/></label>
   {brandError&&<p role="alert">{brandError}</p>}
   <div className="actions">
    <button type="submit" className="button primary" disabled={brandBusy}>{brandBusy?'Enregistrement…':'Enregistrer'}</button>
    <button type="button" className="button" disabled={brandBusy} onClick={()=>brandDialog.current?.close()}>Annuler</button>
   </div>
  </form>
 </dialog></>
}
function ProductListCard({product,onEdit}:{product:Product;onEdit:()=>void}) {
 const client=useQueryClient()
 const {setNotice}=useShop()
 const [operation,setOperation]=useState<'publication'|'delete'|'archive'|'restore'|null>(null)
 const [error,setError]=useState('')
 const image=photos(product)[0]
 const sizes=variants(product)
 const archived=Boolean(product.archived_at)
 async function togglePublication() {
  const published=!product.published
  setOperation('publication');setError('')
  try {
   const {error}=await db!.rpc('save_product',{p_id:product.id,p_product:{published},p_variants:null,p_images:null})
   if(error) throw error
   client.setQueryData<Product[]>(productsQuery.queryKey,current=>current?.map(item=>item.id===product.id?{...item,published}:item))
   await Promise.all([client.invalidateQueries({queryKey:productsQuery.queryKey}),client.invalidateQueries({queryKey:catalog.queryKey}),client.invalidateQueries({queryKey:['collection-products']}),client.invalidateQueries({queryKey:adminStatisticsKey})])
   setNotice(published?'Parfum publié dans la boutique.':'Parfum remis en brouillon.')
  } catch (failure) {
   const code=(failure as {message?:string})?.message
   if(code==='PRODUCT_HAS_NO_VARIANTS') setError('Ajoutez une taille et un prix avant de publier ce parfum.')
   else if(code==='INVALID_PRODUCT_PAYLOAD'||(failure as {code?:string})?.code==='23502') setError('Appliquez la migration Supabase 202611240003 pour publier depuis la liste.')
   else setError('Le statut n’a pas pu être enregistré. Actualisez la liste avant de réessayer.')
   void client.invalidateQueries({queryKey:productsQuery.queryKey})
   void client.invalidateQueries({queryKey:adminStatisticsKey})
  } finally {setOperation(null)}
 }
 async function remove() {
  if(!confirm(`Supprimer définitivement « ${product.name} » ? Il sera retiré du catalogue et de la boutique. Les commandes et les ventes passées seront conservées. Cette action est irréversible.`))return
  setOperation('delete');setError('')
  try {
   const {data,error}=await db!.rpc('delete_unused_product',{p_id:product.id})
   if(error) throw error
   const refresh=client.invalidateQueries()
   const mediaError=data?.length ? await db!.storage.from('store-media').remove(data).then(result=>result.error,()=>true) : null
   await refresh
   setNotice(mediaError?'Parfum supprimé. Certaines photos restent dans le stockage.':'Parfum supprimé.')
  } catch (failure) {
   const code=(failure as {message?:string})?.message
   if(code==='PRODUCT_HAS_ORDER_HISTORY') setError('Appliquez la migration Supabase 202611250006 pour supprimer ce parfum tout en conservant ses commandes.')
   else if(code==='PRODUCT_HAS_PROTECTED_DEPENDENCIES') setError('Ce parfum est lié à des données protégées. La suppression a été annulée.')
   else if(code==='PRODUCT_HAS_HISTORY') setError('Appliquez la migration Supabase 202611250005 pour autoriser la suppression des parfums ayant uniquement des mouvements de stock.')
   else if(code==='FORBIDDEN') setError('La suppression est réservée aux administrateurs autorisés.')
   else if(code==='PRODUCT_NOT_FOUND') {
    setNotice('Ce parfum a déjà été supprimé.')
    void client.invalidateQueries()
   }
   else if(code==='PRODUCT_IS_PUBLISHED') setError('Appliquez la migration Supabase 202611250001 pour supprimer un parfum publié.')
   else setError('Suppression impossible. Actualisez la liste avant de réessayer.')
  } finally {setOperation(null)}
 }
 async function changeArchiveStatus() {
  if (!archived && !confirm(`Archiver « ${product.name} » ? Il sera retiré de la boutique et pourra être restauré en brouillon.`)) return
  setOperation(archived?'restore':'archive')
  setError('')
  try {
   const {error}=await db!.rpc('set_product_archived',{p_id:product.id,p_archived:!archived})
   if (error) throw error
   await client.invalidateQueries()
   setNotice(archived?'Parfum restauré en brouillon.':'Parfum archivé.')
  } catch (failure) {
   if ((failure as {code?:string})?.code==='PGRST202') setError('Appliquez la migration Supabase 202611250001 pour gérer les archives.')
   else setError(archived?'Restauration impossible. Actualisez la liste avant de réessayer.':'Archivage impossible. Actualisez la liste avant de réessayer.')
  } finally {setOperation(null)}
 }
 return <article className="panel admin-perfume" aria-busy={operation!==null}>
  <div className="admin-perfume-heading">
   <ProductPhoto key={image?.id} photo={image} name={product.name} sizes="72px"/>
   <div>{product.brands&&<p className="eyebrow">{product.brands.name}</p>}<h2>{product.name}</h2><span className="publication-badge" data-published={product.published}>{archived?'Archivé':product.published?'Publié':'Brouillon'}</span></div>
  </div>
  {sizes.length>0?<dl className="admin-perfume-variants">{sizes.map(variant=><div key={variant.id}><dt>{variant.size_ml} ml</dt><dd>{money(price(variant))}</dd><dd>{variant.stock} en stock</dd></div>)}</dl>:<p>Aucune taille active.</p>}
  <div className="actions admin-perfume-actions">
   {!archived&&<>
   <button type="button" className="button" disabled={operation!==null} onClick={onEdit}>Modifier</button>
   <button type="button" className={product.published?'button':'button primary'} disabled={operation!==null} onClick={togglePublication}>{operation==='publication'?'Enregistrement…':product.published?'Dépublier':'Publier'}</button>
   </>}
   <button type="button" className="button" disabled={operation!==null} onClick={changeArchiveStatus}>{operation==='archive'?'Archivage…':operation==='restore'?'Restauration…':archived?'Restaurer':'Archiver'}</button>
   <button type="button" className="text-link" disabled={operation!==null} onClick={remove}>{operation==='delete'?'Suppression…':'Supprimer définitivement'}</button>
  </div>
  {error&&<p role="alert">{error}</p>}
 </article>
}
export function Products() {
 const [params]=useSearchParams()
 return <ProductList key={params.toString()}/>
}
function ProductList() {
 const [params,setParams]=useSearchParams()
 const productId=params.get('id')
 const query=useQuery(productsQuery)
 const [edit,setEdit]=useState<string|null>(null)
 const [search,setSearch]=useState('')
 const status=params.get('status')
 const [publication,setPublication]=useState(status==='published'||status==='draft'||status==='archived'?status:'')
 const addButton=useRef<HTMLButtonElement>(null)
 const restoreFocus=useRef(false)
 useEffect(()=>{
  if(edit===null&&restoreFocus.current){addButton.current?.focus();restoreFocus.current=false}
 },[edit])
 function closeEditor(){restoreFocus.current=true;setEdit(null)}
 const selectedProduct=query.data?.find(product=>product.id===edit&&!product.archived_at)
 if(edit==='new'||selectedProduct) return <ProductEditor key={edit} product={selectedProduct} onClose={closeEditor}/>
 const products=query.data?.filter(product=>
  (!productId||product.id===productId) &&
  (publication==='archived'?Boolean(product.archived_at):!product.archived_at&&(!publication||product.published===(publication==='published'))) &&
  [product.name,product.brands?.name??''].some(value=>value.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')))
 )??[]
 return <>
  <div className="admin-page-heading"><h1>Produits</h1><button ref={addButton} type="button" className="button primary" onClick={()=>setEdit('new')}>Ajouter un parfum</button></div>
  <div className="admin-product-filters">
   <label>Rechercher un parfum<input type="search" placeholder="Nom ou marque" value={search} onChange={event=>setSearch(event.target.value)}/></label>
   <label>Statut<select value={publication} onChange={event=>setPublication(event.target.value)}><option value="">Tous les parfums non archivés</option><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivés</option></select></label>
  </div>
  {productId&&<button type="button" className="text-link" onClick={()=>setParams(publication?{status:publication}:{})}>Afficher tous les parfums de ce statut</button>}
  {query.isError?<p role="alert">Chargement des produits impossible.</p>:query.isPending?<p role="status">Chargement des parfums…</p>:products.length?<div className="admin-perfume-list">{products.map(product=><ProductListCard key={product.id} product={product} onEdit={()=>setEdit(product.id)}/>)}</div>:<p className="empty">{query.data.length?'Aucun parfum ne correspond aux filtres.':'Aucun parfum enregistré.'}</p>}
 </>
}
interface Movement {id:number;variant_id:string;quantity:number;reason:string;created_at:string}
const reasons:Record<string,string>={initial:'Stock initial',adjustment:'Ajustement',reservation:'Réservation',cancellation:'Annulation'}
function StockRow({variant,product}:{variant:Variant;product:Product}) {
 const client=useQueryClient()
 const {setNotice}=useShop()
 const [busy,setBusy]=useState(false)
 async function update(e:FormEvent<HTMLFormElement>){
  e.preventDefault()
  const form=e.currentTarget
  setBusy(true)
  const result=await db!.rpc('adjust_stock',{p_id:variant.id,p_delta:Number(new FormData(form).get('delta'))})
  if(result.error)setNotice('Ajustement impossible. Vérifiez la quantité.')
  else{form.reset();await client.invalidateQueries();setNotice('Stock ajusté.')}
  setBusy(false)
 }
 return <form className="panel list-row" onSubmit={update}><div><h2>{product.name} · {variant.size_ml} ml</h2><p>{variant.stock} en stock {variant.active&&variant.stock<=3?(variant.stock===0?'· Rupture de stock':'· Stock faible'):''} {!variant.active?'· Variante archivée':''} {product.archived_at?'· Parfum archivé':''}</p></div><div className="inline-form"><label>Quantité à ajouter ou retirer<input name="delta" type="number" min="-100000" max="100000" required/></label><button className="button" disabled={busy}>Ajuster</button></div></form>
}
export function Inventory(){
 const result=useQuery(productsQuery)
 const [params,setParams]=useSearchParams()
 const log=useQuery({queryKey:['stock-log'],queryFn:async()=>{const {data,error}=await db!.from('inventory_movements').select('id,variant_id,quantity,reason,created_at').order('id',{ascending:false}).limit(100);if(error)throw error;return data as Movement[]}})
 const stock=params.get('stock')??''
 const publishedOnly=params.get('scope')==='published'
 const entries=result.data?.flatMap(p=>p.product_variants.map(v=>({p,v})))??[]
 const visible=entries.filter(({p,v})=>(!publishedOnly||(v.active&&p.published&&!p.archived_at))&&(!stock||(v.active&&!p.archived_at&&(
  stock==='active'||(stock==='out'&&v.stock===0)||(stock==='low'&&v.stock>0&&v.stock<=3)
 ))))
 return <><h1>Inventaire</h1><label>Stock<select value={stock} onChange={e=>setParams({...e.target.value&&{stock:e.target.value},...publishedOnly&&{scope:'published'}})}><option value="">Tous les formats</option><option value="active">Formats actifs</option><option value="low">Stock faible (1 à 3 unités)</option><option value="out">Rupture de stock</option></select></label>
 <label className="check"><input type="checkbox" checked={publishedOnly} onChange={e=>setParams({...stock&&{stock},...e.target.checked&&{scope:'published'}})}/> Produits publiés uniquement</label>
 {result.isError?<p role="alert">Inventaire indisponible.</p>:result.isPending?<p>Chargement…</p>:visible.length?visible.map(({p,v})=><StockRow variant={v} product={p} key={v.id}/>):<p>Aucun format ne correspond à ce filtre.</p>}
 <section className="panel admin-block"><h2>Derniers mouvements</h2>{log.isError?<p role="alert">Historique indisponible.</p>:log.isPending?<p>Chargement…</p>:log.data.length? <ul>{log.data.map(m=>{const entry=entries.find(({v})=>v.id===m.variant_id);return <li key={m.id}>{new Date(m.created_at).toLocaleString('fr-MA')} · {entry?entry.p.name+' '+entry.v.size_ml+' ml':m.variant_id} · {reasons[m.reason]} · {m.quantity>0?'+':''}{m.quantity}</li>})}</ul>:<p>Aucun mouvement.</p>}</section></>
}

