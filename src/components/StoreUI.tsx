import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { BadgeCheck, Camera, MessageCircle, Moon, ShoppingBag, Sun, Truck, Droplets } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useShop } from '../contexts/Shop'
import { brandName, money, photos, photoUrl, price, settings, variants, type Product, type Photo } from '../lib/store'

export function ThemeButton() {
 const { theme, toggleTheme } = useShop()
 return <button className="icon" onClick={toggleTheme} aria-label="Changer le thème">{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
}
export function BrandMark() {
 return <span className="store-mark" aria-hidden>AP</span>
}
export function StoreLayout() {
 const { cart } = useShop()
 const { data } = useQuery(settings)
 const name = data?.name ?? brandName
 const count = Object.values(cart).reduce((a,b) => a+b, 0)
 const whatsapp = data?.whatsapp.replace(/\D/g,'')
 return <div className="storefront">
 <a className="skip" href="#contenu">Aller au contenu</a>
 <div className="store-assurance"><span><BadgeCheck size={15} aria-hidden/> Parfums authentiques</span><span><Truck size={15} aria-hidden/> Livraison au Maroc</span></div>
 <header className="store-header">
  <div className="nav-inner storefront-nav">
   <Link className="wordmark" to="/">{data?.logo ? <img src={photoUrl(data.logo)} alt={name}/> : <><BrandMark/><span>{name}</span></>}</Link>
   <div className="nav-tools"><ThemeButton/>{count > 0 && <Link className="icon bag" aria-label={`Panier, ${count} articles`} to="/panier"><ShoppingBag size={20}/><span>{count}</span></Link>}</div>
  </div>
 </header>
 <main id="contenu"><Outlet/></main>
 <footer className="store-footer"><div className="container footer-grid"><div><Link to="/" className="wordmark"><BrandMark/><span>{name}</span></Link>{data?.description&&<p>{data.description}</p>}</div><div><h2>La boutique</h2><Link to="/boutique">Tous les parfums</Link><p>{data?.delivery || 'Paiement à la livraison'}</p></div><div><h2>Nous contacter</h2>{data?.contact && <p>{data.contact}</p>}{whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={17} aria-hidden/> WhatsApp</a>}{data?.instagram && <a href={data.instagram} rel="noreferrer" target="_blank"><Camera size={17} aria-hidden/> Instagram</a>}</div></div></footer>
 {whatsapp && <a className="whatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" aria-label="Nous contacter sur WhatsApp"><MessageCircle size={23}/></a>}
 </div>
}
export function ProductPhoto({ photo, name, eager = false, sizes }: { photo?: Photo; name: string; eager?: boolean; sizes?: string }) {
 const [fallback, setFallback] = useState(false)
 const original = photo ? photoUrl(photo.path) : ''
 const transforms = !!photo && import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORMS === 'true'
 const [useOriginal, setUseOriginal] = useState(false)
 const srcSet = transforms && !useOriginal ? [320,640,960].map(width => photoUrl(photo.path,width)+' '+width+'w').join(', ') : undefined
 return <div className="product-photo">{original && !fallback ? <img loading={eager ? 'eager' : 'lazy'} decoding="async" src={original} srcSet={srcSet} sizes={sizes ?? (eager ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 1320px) 302px, (min-width: 1150px) 25vw, (min-width: 768px) 33vw, 50vw')} alt={name} onError={() => { if(srcSet) setUseOriginal(true); else setFallback(true) }}/> : <Droplets size={44} strokeWidth={1} aria-hidden/>}</div>
}
function ProductCard({ product, first }: { product: Product; first: boolean }) {
 const available = variants(product)
 const stocked = available.filter(variant => variant.stock > 0)
 const priced = stocked.length ? stocked : available
 const cheapest = [...priced].sort((a,b) => price(a)-price(b))[0]
 const detail = `/parfum/${product.id}`
 const cover = photos(product)[0]
 return <article className="card catalog-card">
  <Link className="photo-wrap" to={detail} aria-label={product.name}><ProductPhoto key={cover?.id} photo={cover} name={product.name} eager={first} sizes="(min-width: 1200px) 260px, (min-width: 1150px) 23vw, (min-width: 768px) 30vw, 45vw"/>{!stocked.length && <span className="tag">Épuisé</span>}</Link>
  <div className="card-copy">
   <span className="eyebrow">{product.brands?.name}</span>
   <h2><Link to={detail}>{product.name}</Link></h2>
   {cheapest && <div className="catalog-card-meta"><p>{priced.length > 1 ? 'Dès ' : ''}{money(price(cheapest))} {cheapest.sale_price !== null && <del>{money(cheapest.price)}</del>}</p>{priced.length===1&&<span>{cheapest.size_ml} ml</span>}</div>}
   {stocked.length>0&&<p className="catalog-availability">En stock</p>}
   <Link className={stocked.length ? 'button primary' : 'button'} to={detail} aria-label={(stocked.length ? 'Commander ' : 'Voir ')+product.name}>{stocked.length ? 'Commander' : 'Voir le parfum'}</Link>
  </div>
 </article>
}
export function ProductGrid({ products, loading, error, emptyMessage }: { products: Product[]; loading?: boolean; error?: string; emptyMessage: string }) {
 if (error) return <p role="alert" className="empty">{error}</p>
 if (loading) return <div className="product-grid" aria-label="Chargement">{[1,2,3,4].map(n => <div className="skeleton" key={n}/>)}</div>
 if (!products.length) return <p className="empty">{emptyMessage}</p>
 return <div className="product-grid">{products.map((product,index) => <ProductCard key={product.id} product={product} first={index===0}/>)}</div>
}

