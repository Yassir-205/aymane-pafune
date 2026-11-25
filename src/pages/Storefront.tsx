import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Banknote, ChevronLeft, Search, Truck } from 'lucide-react'
import { catalog, db, photos, variants, price, money, settings, defaults, photoUrl, isDiscounted, type Product } from '../lib/store'
import { collectionProducts, publishedCollections } from '../lib/collections'
import { useShop } from '../contexts/Shop'
import { ProductGrid, ProductPhoto } from '../components/StoreUI'

const categories = ['Homme', 'Femme', 'Unisexe']
const searchText = (value: string) => value.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '')
const hasDiscount = (product: Product) => variants(product).some(isDiscounted)
const usePublishedCatalog = () => useQuery({ ...catalog, refetchOnMount: 'always', refetchOnWindowFocus: 'always' })
function catalogError(isError: boolean) {
 if (!db) return 'Le catalogue est indisponible. La connexion à la boutique doit être configurée.'
 if (isError) return 'Le catalogue est momentanément indisponible.'
}

export function Home() {
 const { data: collections = [], isPending, isError } = useQuery(publishedCollections)
 const { data: config } = useQuery(settings)
 const headline = config?.headline?.trim()
 const customHeadline = headline && !['Le parfum est\nun art.', 'Le parfum, une signature.', defaults.headline].includes(headline)
 return <div className="collection-home">
   <section className="container boutique-intro" aria-labelledby="hero-title">
    <img className="boutique-art" src={config?.banner ? photoUrl(config.banner) : '/ambre-editorial.webp'} alt="" fetchPriority="high"/>
    <div className="boutique-intro-copy">
     <h1 id="hero-title">{customHeadline ? headline : <><span>Un parfum, </span><span>mille émotions.</span></>}</h1>
    </div>
   </section>
  <section className="container storefront-section store-collections" id="collections" aria-labelledby="collections-title">
   <h2 id="collections-title">Les collections</h2>
   {isPending && <p role="status">Chargement des collections…</p>}
   {isError && <p role="alert">Les collections sont momentanément indisponibles.</p>}
   {!isPending && !isError && !collections.length && <p>Aucune collection disponible pour le moment.</p>}
   <div className="store-collection-grid">
    {collections.map(collection => <Link key={collection.id} to={'/collections/'+collection.slug} className="store-collection">
      <div className="collection-media"><img src={collection.imageUrl || '/ambre-editorial.webp'} loading="lazy" alt=""/></div>
      <div className="collection-caption"><span>{collection.name}</span><ArrowRight size={18} aria-hidden/></div>
    </Link>)}
   </div>
  </section>
 </div>
}

export function Collection() {
 const { slug } = useParams()
 const listing = useQuery(publishedCollections)
 const collection = listing.data?.find(item => item.slug === slug)
 const { data: products = [], isPending, isError } = useQuery(collectionProducts(collection?.id))
 const heading = collection?.name ?? (listing.isPending || listing.isError ? 'Collection' : 'Collection introuvable')
 return <section className="container storefront-section catalog-page collection-page" aria-labelledby="catalogue-title">
  <Link className="store-back" to="/#collections"><ChevronLeft size={17} aria-hidden/> Toutes les collections</Link>
  <header className="catalog-heading"><h1 id="catalogue-title">{heading}</h1></header>
  {listing.isPending && <p role="status">Chargement de la collection…</p>}
  {listing.isError && <p role="alert">La collection est momentanément indisponible.</p>}
  {collection && <ProductGrid products={products} loading={isPending} error={catalogError(isError)} emptyMessage="Aucun parfum disponible dans cette collection."/>}
 </section>
}

export function Shop() {
 const [params, setParams] = useSearchParams()
 const { data: products = [], isPending, isError } = usePublishedCatalog()
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
   (selection !== 'promotions' || hasDiscount(product))
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
 return <section className="container storefront-section catalog-page" id="catalogue" aria-labelledby="catalogue-title">
  <header className="catalog-heading"><h1 id="catalogue-title">Tous les parfums</h1></header>
  <div className="catalog-tools">
   <label className="catalog-search"><span className="sr-only">Rechercher un parfum</span><Search size={18} aria-hidden/><input id="recherche" type="search" value={search} onChange={event => change('q', event.target.value)} placeholder="Rechercher un parfum"/></label>
   <div className="catalog-categories" role="group" aria-label="Catégorie">
    {['', ...categories].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => change('collection', value)}>{value || 'Tous'}</button>)}
   </div>
  </div>
  {(brand || selection || maxPrice || (category && !categories.includes(category))) && <p><button className="text-link" onClick={() => setParams({}, { replace: true })}>Effacer les filtres</button></p>}
  <ProductGrid products={filtered} loading={Boolean(db) && isPending} error={catalogError(isError)} emptyMessage={products.length ? 'Aucun parfum disponible dans cette sélection.' : 'Aucun parfum n’est actuellement publié.'}/>
 </section>
}

export function Details() {
 const { id } = useParams()
 return <ProductDetails key={id} id={id}/>
}

function ProductDetails({ id }: { id?: string }) {
 const { data: products = [], isPending, isError } = useQuery(catalog)
 const product = products.find(item => item.id === id)
 const { add } = useShop()
 const [selected, setSelected] = useState('')
 const [quantity, setQuantity] = useState(1)
 const [image, setImage] = useState(0)
 if (!product) return <section className="container page"><p>{isPending ? 'Chargement…' : isError ? 'Catalogue indisponible.' : 'Parfum introuvable.'}</p><Link className="text-link" to="/#collections">Toutes les collections</Link></section>

 const sizes = variants(product)
 const variant = sizes.find(item => item.id === selected) ?? sizes.find(item => item.stock > 0) ?? sizes[0]
 const limit = Math.min(variant?.stock ?? 0, 20)
 const selectedQuantity = Math.min(quantity, Math.max(1, limit))
 const gallery = photos(product)
 return <section className="container page product-detail">
  <Link className="store-back" to="/#collections"><ChevronLeft size={17} aria-hidden/> Toutes les collections</Link>
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
    <div className="variant-list" id="choisir-format" role="group" aria-labelledby="variant-heading">
     {sizes.map(item => <button type="button" key={item.id} className="button" aria-pressed={variant?.id === item.id} onClick={() => { setSelected(item.id); setQuantity(1) }}>{item.size_ml} ml{item.stock === 0 ? ' · Épuisé' : ''}</button>)}
    </div></>}
    {variant && limit > 0 ? <>
     <p className="detail-stock">{variant.stock} en stock</p>
     <div className="order-controls">
      <div className="detail-quantity"><label htmlFor="detail-quantity">Quantité</label><select id="detail-quantity" value={selectedQuantity} onChange={event => setQuantity(Number(event.target.value))}>{Array.from({ length: limit }, (_,i) => <option key={i+1}>{i+1}</option>)}</select></div>
      <Link className="button primary" to={'/commande?'+new URLSearchParams({ variante: variant.id, quantite: String(selectedQuantity) })}>Commander maintenant</Link>
      <button className="button" type="button" onClick={() => add(variant.id, variant.stock, selectedQuantity)}>Ajouter au panier</button>
     </div>
    </> : <p>Ce parfum est actuellement épuisé.</p>}
    <ul className="detail-assurance"><li><Truck size={18} aria-hidden/> Livraison au Maroc</li><li><Banknote size={18} aria-hidden/> Paiement à la livraison</li></ul>
    {product.description && <p className="product-description">{product.description}</p>}
   </div>
  </div>
 </section>
}

