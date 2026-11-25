import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Camera, Menu, MessageCircle, Moon, Search, ShoppingBag, Sun, Droplets, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useShop } from '../contexts/Shop'
import { brandName, money, photos, photoUrl, price, settings, variants, type Product, type Photo } from '../lib/store'

export function ThemeButton() {
 const { theme, toggleTheme } = useShop()
 return <button className="icon" onClick={toggleTheme} aria-label="Changer le thème">{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
}
const officialLogo = "/sabour-logo-header.png"
export function BrandMark() {
 return <img className="store-mark" src={officialLogo} alt="" width={44} height={44}/>
}
export function StoreLayout() {
 const { cart } = useShop()
 const { data } = useQuery(settings)
 const name = brandName
 const location = useLocation()
 const [menuOpen, setMenuOpen] = useState(false)
 const menuTrigger = useRef<HTMLButtonElement>(null)
 useEffect(() => setMenuOpen(false), [location.pathname, location.search, location.hash])
 useEffect(() => {
   if (!menuOpen) return
   function dismiss(event: KeyboardEvent) {
     if (event.key === 'Escape') {
       setMenuOpen(false)
       menuTrigger.current?.focus()
     }
   }
   window.addEventListener('keydown', dismiss)
   return () => window.removeEventListener('keydown', dismiss)
 }, [menuOpen])
 const count = Object.values(cart).reduce((a,b) => a+b, 0)
 const whatsapp = data?.whatsapp.replace(/\D/g,'')
 return <div className="storefront">
 <a className="skip" href="#contenu">Aller au contenu</a>
 <div className="store-assurance">{data?.promotion || 'Livraison au Maroc · Paiement à la livraison'}</div>
 <header className="store-header">
  <div className="nav-inner storefront-nav">
   <button ref={menuTrigger} className="icon menu-trigger" type="button" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-controls="store-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
   <nav id="store-navigation" className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="Navigation principale">
    <NavLink end to="/" onClick={() => setMenuOpen(false)}>Accueil</NavLink>
    <NavLink to="/boutique" onClick={() => setMenuOpen(false)}>Boutique</NavLink>
    <Link to="/#collections" onClick={() => setMenuOpen(false)}>Collections</Link>
   </nav>
   <Link className="wordmark storefront-brand" to="/" aria-label={name}><img src={officialLogo} alt="" width={60} height={54}/></Link>
   <div className="nav-tools">
    <Link className="icon" aria-label="Rechercher un parfum" to="/boutique#recherche"><Search size={21}/></Link>
    <Link className="icon bag" aria-label={count ? `Panier, ${count} articles` : 'Panier'} to="/panier"><ShoppingBag size={21}/>{count > 0 && <span>{count}</span>}</Link>
   </div>
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
 const { add } = useShop()
 const available = variants(product)
 const stocked = available.filter(variant => variant.stock > 0)
 const priced = stocked.length ? stocked : available
 const cheapest = [...priced].sort((a,b) => price(a)-price(b))[0]
 const detail = `/parfum/${product.id}`
 const onlyStocked = stocked.length === 1 ? stocked[0] : undefined
 const cover = photos(product)[0]
 const sizes = available.map(variant => variant.size_ml + ' ml').join(' · ')
 return <article className="card catalog-card">
  <Link className="photo-wrap" to={detail} aria-label={product.name}><ProductPhoto key={cover?.id} photo={cover} name={product.name} eager={first} sizes="(min-width: 1200px) 285px, (min-width: 1150px) 24vw, (min-width: 768px) 32vw, 48vw"/>{!stocked.length && <span className="tag">Épuisé</span>}</Link>
  <div className="card-copy">
   <span className="eyebrow">{product.brands?.name}</span>
   <h3><Link to={detail}>{product.name}</Link></h3>
   <div className="catalog-card-meta">{cheapest && <><span>{priced.length > 1 ? 'Dès ' : ''}{money(price(cheapest))}</span>{cheapest.sale_price !== null && <del>{money(cheapest.price)}</del>}</>}</div>
   <p className="catalog-sizes" title={sizes}>{sizes}</p>
   <div className="catalog-actions">
    <Link className={stocked.length ? 'button primary' : 'button'} to={detail} aria-label={(stocked.length ? 'Acheter ' : 'Voir ')+product.name}>{stocked.length ? 'Acheter' : 'Voir le parfum'}</Link>
    {onlyStocked ? <button className="button" type="button" onClick={() => add(onlyStocked.id, onlyStocked.stock)}>Ajouter au panier</button>
      : stocked.length > 1 && <Link className="button" to={detail+'#choisir-format'} aria-label={'Choisir un format pour ajouter '+product.name+' au panier'}>Ajouter au panier</Link>}
   </div>
  </div>
 </article>
}
export function ProductGrid({ products, loading, error, emptyMessage }: { products: Product[]; loading?: boolean; error?: string; emptyMessage: string }) {
 if (error) return <p role="alert" className="empty">{error}</p>
 if (loading) return <div className="product-grid" aria-label="Chargement">{[1,2,3,4].map(n => <div className="skeleton" key={n}/>)}</div>
 if (!products.length) return <p className="empty">{emptyMessage}</p>
 return <div className="product-grid">{products.map((product,index) => <ProductCard key={product.id} product={product} first={index===0}/>)}</div>
}

