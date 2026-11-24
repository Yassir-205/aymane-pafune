import { useRef, useState } from 'react'
import { FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Banknote, ChevronLeft, CircleCheck, ShoppingBag, Trash2 } from 'lucide-react'
import { useShop } from '../contexts/Shop'
import { brandName, catalog, cities, db, money, price, photos, settings, variants, type Receipt } from '../lib/store'
import { ProductPhoto } from '../components/StoreUI'

export const phonePattern = /^(?:0|\+?212)[5-7][0-9]{8}$/
const schema = z.object({
 name: z.string().trim().min(2,'Saisissez votre nom complet.').max(100),
 phone: z.string().transform(v=>v.replace(/[ .-]/g,'')).pipe(z.string().regex(phonePattern,'Saisissez un numéro marocain valide.')),
 cityId: z.string().uuid('Choisissez une ville.'),
 address: z.string().trim().min(8,'Saisissez votre adresse complète.').max(300),
 notes: z.string().trim().max(500)
})
function Summary({ subtotal, fee }: { subtotal: number; fee?: number }) {
 return <dl className="summary"><div><dt>Sous-total</dt><dd>{money(subtotal)}</dd></div><div><dt>Livraison</dt><dd>{fee === undefined ? 'Selon la ville' : money(fee)}</dd></div><div><dt>Total</dt><dd>{fee === undefined ? 'À calculer' : money(subtotal+fee)}</dd></div></dl>
}
export function Cart() {
 const { data = [] } = useQuery(cities)
 const { lines, total, update, isPending, clear, cart } = useShop()
 const [city,setCity] = useState('')
 const invalid = lines.length > 20 || lines.some(l => l.quantity > l.variant.stock)
 const stale = Object.keys(cart).filter(id => !lines.some(l => l.variant.id === id))
 return <section className="container page"><h1>Votre panier</h1>
 {isPending ? <p>Chargement…</p> : lines.length === 0 ? <div className="empty"><ShoppingBag/><p>Votre panier est vide.</p>{stale.length > 0 && <button className="button" onClick={clear}>Vider le panier</button>} <Link className="button primary" to="/boutique">Découvrir la boutique</Link></div> :
 <div className="split cart-layout"><div>{stale.length > 0 && <div className="panel"><p>Certains articles ne sont plus disponibles.</p><button className="button" onClick={()=>stale.forEach(id=>update(id,0))}>Retirer les articles indisponibles</button></div>}{lines.map(({product,variant,quantity})=><article className="cart-line" key={variant.id}>
 <ProductPhoto photo={photos(product)[0]} name={product.name}/><div><Link to={'/parfum/'+product.id}>{product.name}</Link><p>{variant.size_ml} ml · {money(price(variant))}</p><label>Quantité<input type="number" min={1} max={Math.min(variant.stock,20)} value={quantity} onChange={e=>{if(e.target.value) update(variant.id,Number(e.target.value))}}/></label>{quantity > variant.stock && <p role="alert">Stock disponible : {variant.stock}</p>}</div><button className="icon" aria-label={'Retirer '+product.name} onClick={()=>update(variant.id,0)}><Trash2 size={17}/></button>
 </article>)}</div><aside className="panel"><h2>Récapitulatif</h2><label>Ville de livraison<select value={city} onChange={e=>setCity(e.target.value)}><option value="">Sélectionner</option>{data.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Summary subtotal={total} fee={data.find(c=>c.id===city)?.fee}/>{lines.length > 20 && <p role="alert">Un maximum de 20 références est autorisé par commande.</p>}{!invalid && <Link className="button primary" state={{city}} to="/commande">Passer la commande</Link>}</aside></div>}
 </section>
}
export function Checkout() {
 const { state } = useLocation()
 const navigate = useNavigate()
 const [params] = useSearchParams()
 const query = useQueryClient()
 const { lines:cartLines, clear } = useShop()
 const products = useQuery(catalog)
 const variantId = params.get('variante')
 const direct = params.has('variante') || params.has('quantite')
 const quantity = Number(params.get('quantite') ?? '1')
 const product = direct ? products.data?.find(item => variants(item).some(variant => variant.id === variantId)) : undefined
 const variant = product && variants(product).find(item => item.id === variantId)
 const directLine = product && variant && Number.isInteger(quantity) && quantity >= 1 && quantity <= 20 ? {product,variant,quantity} : undefined
 const lines = direct ? (directLine ? [directLine] : []) : cartLines
 const total = lines.reduce((sum,line) => sum + line.quantity * price(line.variant),0)
 const back = direct ? (product ? '/parfum/'+product.id : '/') : '/panier'
 const { data = [], isPending: citiesLoading, isError, isFetching: citiesRefreshing, refetch: retryCities } = useQuery({...cities,refetchOnMount:'always'})
 const [message, setMessage] = useState('')
 const lock = useRef(false)
 const { register, handleSubmit, watch, formState:{errors,isSubmitting,isValid} } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
 mode:'onChange', resolver:zodResolver(schema), defaultValues:{ name:'',phone:'',cityId:direct ? '' : state?.city ?? '',address:'',notes:'' }
 })
 const city = data.find(c=>c.id===watch('cityId'))
 const invalid = lines.length > 20 || lines.some(l=>l.quantity>l.variant.stock)
 async function submit(values:z.output<typeof schema>) {
   if (!db || lock.current || !lines.length || isError) return
   if (!data.some(item=>item.id===values.cityId)) {
    setMessage('Sélectionnez une ville de livraison disponible.');return
   }
   lock.current = true
   setMessage('')
   const payload = { ...values, items:lines.map(l=>({variantId:l.variant.id,quantity:l.quantity})).sort((a,b)=>a.variantId.localeCompare(b.variantId)) }
   try {
    const signature = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))),b=>b.toString(16).padStart(2,'0')).join('')
    const attempt = JSON.parse(sessionStorage.getItem('ma-attempt') ?? 'null')
    if (invalid && attempt?.signature !== signature) {
      setMessage('La quantité sélectionnée dépasse le stock disponible.')
      return
    }
    const key = attempt?.signature === signature ? attempt.key : crypto.randomUUID()
    sessionStorage.setItem('ma-attempt',JSON.stringify({signature,key}))
    const { data:receipt,error } = await db.functions.invoke<Receipt>('checkout',{body:{...payload,key}})
    if (error || !receipt?.reference) {
      const response = error?.context instanceof Response ? error.context : undefined
      const reason = response ? await response.json().catch(()=>null) : null
      if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError || [401,403,404,503].includes(response?.status ?? 0)) {
       setMessage('Le service de commande est indisponible pour le moment. Veuillez réessayer ou contacter la boutique.')
      } else {
       setMessage(typeof reason?.message==='string' ? reason.message : 'La commande n’a pas pu être confirmée. Réessayez.')
      }
      return
    }
    sessionStorage.removeItem('ma-attempt')
    if (!direct) clear()
    void query.invalidateQueries({queryKey:catalog.queryKey})
    navigate('/confirmation',{replace:true,state:{receipt}})
   } catch {
    setMessage('La commande n’a pas pu être confirmée. Réessayez.')
   } finally { lock.current = false }
 }
 if (products.isPending) return <section className="container page">Chargement…</section>
 if (!lines.length) return <section className="container page"><h1>Votre commande</h1><p>{products.isError ? 'Le catalogue est momentanément indisponible.' : 'Cette sélection est indisponible.'}</p><Link className="button" to={back}>{direct ? 'Choisir un parfum' : 'Retour au panier'}</Link></section>
 return <section className="container page checkout-page">
  <Link className="store-back" to={back}><ChevronLeft size={17} aria-hidden/> {direct ? 'Modifier la sélection' : 'Retour au panier'}</Link>
  <h1>Livraison</h1>
  <form className="split checkout-form" onSubmit={handleSubmit(submit)} aria-busy={isSubmitting}>
   <section className="panel fields checkout-fields" aria-labelledby="checkout-contact-title">
    <h2 id="checkout-contact-title">Vos coordonnées</h2>
    <div className="checkout-fields-pair">
     <label>Nom complet<input autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name?'name-error':undefined} {...register('name')}/>{errors.name&&<small id="name-error">{errors.name.message}</small>}</label>
     <label>Téléphone marocain<input type="tel" autoComplete="tel" placeholder="06 00 00 00 00" aria-invalid={!!errors.phone} aria-describedby={errors.phone?'phone-error':undefined} {...register('phone')}/>{errors.phone&&<small id="phone-error">{errors.phone.message}</small>}</label>
    </div>
    <div><label htmlFor="checkout-city">Ville</label><select id="checkout-city" autoComplete="address-level2" aria-invalid={!!errors.cityId} aria-describedby={errors.cityId?'city-error':!data.length?'city-status':undefined} disabled={!data.length} {...register('cityId')}><option value="">{citiesLoading?'Chargement des villes…':data.length?'Choisir la ville':'Aucune ville disponible'}</option>{data.map(c=><option key={c.id} value={c.id}>{c.name} · {c.option}</option>)}</select>{errors.cityId&&<small id="city-error">{errors.cityId.message}</small>}
    {citiesLoading?<p id="city-status" role="status">Chargement des villes de livraison…</p>:isError?<p id="city-status" role="alert">Les villes n’ont pas pu être chargées. <button type="button" className="text-link" disabled={citiesRefreshing} onClick={()=>void retryCities()}>Réessayer</button></p>:!data.length&&<p id="city-status">Aucune ville de livraison n’est configurée. Contactez la boutique pour connaître les options de livraison.</p>}</div>
    <label>Adresse complète<textarea autoComplete="street-address" aria-invalid={!!errors.address} aria-describedby={errors.address?'address-error':undefined} {...register('address')}/>{errors.address&&<small id="address-error">{errors.address.message}</small>}</label>
    <label>Notes de livraison (facultatif)<textarea aria-invalid={!!errors.notes} aria-describedby={errors.notes?'notes-error':undefined} {...register('notes')}/>{errors.notes&&<small id="notes-error">{errors.notes.message}</small>}</label>
   </section>
   <aside className="panel checkout-review">
    <h2>Votre commande</h2>
    <ul className="checkout-items">{lines.map(line=><li key={line.variant.id}><ProductPhoto photo={photos(line.product)[0]} name={line.product.name} sizes="56px"/><div><strong>{line.product.name}</strong><span>{line.quantity} × {line.variant.size_ml} ml</span></div><strong>{money(line.quantity*price(line.variant))}</strong></li>)}</ul>
    <Summary subtotal={total} fee={city?.fee}/>
    <p className="checkout-payment"><Banknote size={19} aria-hidden/> Paiement en espèces à la livraison</p>
    {message&&<p role="alert">{message}</p>}
    <button className="button primary" disabled={isSubmitting || !isValid || isError || !city || !db}>{isSubmitting?'Confirmation…':'Confirmer la commande'}</button>
   </aside>
  </form>
 </section>
}
export function Confirmation() {
 const { state } = useLocation()
 const receipt = state?.receipt as Receipt | undefined
 const { data: config } = useQuery(settings)
 return <section className="container page receipt-page">
  <div className="panel confirmation">
   <header className="receipt-heading">
    {receipt&&<span className="receipt-icon"><CircleCheck size={30} aria-hidden/></span>}
    <h1>{receipt?'Commande confirmée':'Confirmation de commande'}</h1>
    {receipt&&<p>Merci, {receipt.customer_name}, d’avoir commandé chez {config?.name ?? brandName}.</p>}
   </header>
   {receipt&&<>
    <dl className="receipt-info"><div><dt>Référence</dt><dd>{receipt.reference}</dd></div><div><dt>Livraison</dt><dd>{receipt.address}, {receipt.city_name}</dd></div></dl>
    <ul className="receipt-items">{receipt.items.map(item=><li key={item.variant_id}>{item.quantity} × {item.product_name} · {item.size_ml} ml</li>)}</ul>
    <Summary subtotal={receipt.subtotal} fee={receipt.delivery_fee}/>
    <p className="checkout-payment"><Banknote size={19} aria-hidden/> Paiement en espèces à la livraison</p>
   </>}
   <Link className="button primary" to="/">Voir tous les parfums</Link>
  </div>
 </section>
}

