import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Banknote, ChevronLeft, Search, Truck } from 'lucide-react'
import { catalog, db, photos, variants, price, money } from '../lib/store'
import { ProductGrid, ProductPhoto } from '../components/StoreUI'

const collections = ['Homme', 'Femme', 'Unisexe']
const searchText = (value: string) => value.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '')

export function Shop() {
 const [params, setParams] = useSearchParams()
 const home = useLocation().pathname === '/'
 const { data: products = [], isPending, isError } = useQuery({...catalog,refetchOnMount:'always',refetchOnWindowFocus:'always'})
 const search = params.get('q') ?? ''
 const category = params.get('collection') ?? ''
 const brand = params.get('brand')
 const selection = params.get('selection')
 const maxPrice = params.get('max')
 const sort = params.get('sort')
 const lowest = (product: typeof products[number]) => Math.min(...variants(product).map(price))
 const filtered = products.filter(product =>
   (!category || product.categories?.name === category) &&
   (!brand || product.brands?.name === brand) &&
   (!maxPrice || lowest(product) <= Number(maxPrice)) &&
   (!search.trim() || searchText(product.name + ' ' + (product.brands?.name ?? '')).includes(searchText(search.trim()))) &&
   (selection !== 'featured' || product.featured) &&
   (selection !== 'bestsellers' || product.bestseller) &&
   (selection !== 'promotions' || variants(product).some(variant => variant.sale_price !== null))
 ).sort((a,b) => sort === 'asc' ? lowest(a)-lowest(b) : sort === 'desc' ? lowest(b)-lowest(a) : sort === 'popular' ? Number(b.bestseller)-Number(a.bestseller) : 0)
 function change(key: string, value: string) {
   const next = new URLSearchParams(params)
   if (key === 'collection' && !value) {
     for (const filter of ['brand', 'selection', 'max']) next.delete(filter)
   }
   if (value) next.set(key, value)
   else next.delete(key)
   setParams(next, { replace: true })
 }
 return <>
  {home&&<section className="container boutique-intro" aria-label="Découvrir la boutique">
   <div className="boutique-intro-copy">
    <p>Le parfum, une signature.</p>
    <a className="button primary" href="#catalogue">Découvrir les parfums</a>
   </div>
  </section>}
  <section className="container catalog-page" id="catalogue" aria-labelledby="catalogue-title">
  <header className="catalog-heading"><h1 id="catalogue-title">Tous les parfums</h1></header>
  <div className="catalog-tools">
   <label className="catalog-search"><span className="sr-only">Rechercher un parfum</span><Search size={18} aria-hidden/><input type="search" value={search} onChange={event => change('q', event.target.value)} placeholder="Rechercher un parfum"/></label>
   <div className="catalog-categories" role="group" aria-label="Catégorie">
    {['', ...collections].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => change('collection', value)}>{value || 'Tous'}</button>)}
   </div>
  </div>
  {(brand || selection || maxPrice || (category && !collections.includes(category))) && <p><button className="text-link" onClick={() => setParams({}, { replace: true })}>Effacer les filtres</button></p>}
  <ProductGrid products={filtered} loading={Boolean(db) && isPending} error={!db ? 'Le catalogue est indisponible. La connexion à la boutique doit être configurée.' : isError ? 'Le catalogue est momentanément indisponible.' : undefined} emptyMessage={products.length ? 'Aucun parfum disponible dans cette sélection.' : 'Aucun parfum n’est actuellement publié.'}/>
 </section>
 </>
}

export function Details() {
 const { id } = useParams()
 return <ProductDetails key={id} id={id}/>
}

function ProductDetails({ id }: { id?: string }) {
 const { data: products = [], isPending, isError } = useQuery(catalog)
 const product = products.find(item => item.id === id)
 const [selected, setSelected] = useState('')
 const [quantity, setQuantity] = useState(1)
 const [image, setImage] = useState(0)
 if (!product) return <section className="container page"><p>{isPending ? 'Chargement…' : isError ? 'Catalogue indisponible.' : 'Parfum introuvable.'}</p><Link className="text-link" to="/">Tous les parfums</Link></section>

 const sizes = variants(product)
 const variant = sizes.find(item => item.id === selected) ?? sizes.find(item => item.stock > 0) ?? sizes[0]
 const limit = Math.min(variant?.stock ?? 0, 20)
 const selectedQuantity = Math.min(quantity, Math.max(1, limit))
 const gallery = photos(product)
 return <section className="container page product-detail">
  <Link className="store-back" to="/"><ChevronLeft size={17} aria-hidden/> Tous les parfums</Link>
  <div className="split details">
   <div className="detail-gallery">
    <ProductPhoto key={gallery[image]?.id} photo={gallery[image]} name={product.name} eager/>
    {gallery.length > 1 && <div className="thumbs">{gallery.map((photo,i) => <button key={photo.id} type="button" aria-pressed={image === i} aria-label={'Photo '+(i+1)} onClick={() => setImage(i)}><ProductPhoto photo={photo} name={product.name}/></button>)}</div>}
   </div>
   <div className="detail-content">
    {product.brands && <p className="eyebrow">{product.brands.name}</p>}
    <h1>{product.name}</h1>
    {variant && <p className="detail-price">{money(price(variant))} {variant.sale_price !== null && <del>{money(variant.price)}</del>}</p>}
    {sizes.length>0&&<><p className="detail-field-label" id="variant-heading">Contenance</p>
    <div className="variant-list" role="group" aria-labelledby="variant-heading">
     {sizes.map(item => <button type="button" key={item.id} className="button" aria-pressed={variant?.id === item.id} onClick={() => { setSelected(item.id); setQuantity(1) }}>{item.size_ml} ml{item.stock === 0 ? ' · Épuisé' : ''}</button>)}
    </div></>}
    {variant && limit > 0 ? <>
     <p className="detail-stock">{variant.stock} en stock</p>
     <div className="order-controls">
      <div className="detail-quantity"><label htmlFor="detail-quantity">Quantité</label><select id="detail-quantity" value={selectedQuantity} onChange={event => setQuantity(Number(event.target.value))}>{Array.from({ length: limit }, (_,i) => <option key={i+1}>{i+1}</option>)}</select></div>
      <Link className="button primary" to={'/commande?'+new URLSearchParams({ variante: variant.id, quantite: String(selectedQuantity) })}>Commander maintenant</Link>
     </div>
    </> : <p>Ce parfum est actuellement épuisé.</p>}
    <ul className="detail-assurance"><li><Truck size={18} aria-hidden/> Livraison au Maroc</li><li><Banknote size={18} aria-hidden/> Paiement à la livraison</li></ul>
    {product.description && <p className="product-description">{product.description}</p>}
   </div>
  </div>
 </section>
}

