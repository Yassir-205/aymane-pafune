import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useMatch } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ShopProvider } from './contexts/Shop'
import { StoreLayout } from './components/StoreUI'
import { Details, Shop } from './pages/Storefront'
import { brandName, catalog, settings } from './lib/store'

const Cart = lazy(() => import('./pages/Checkout').then(module => ({ default: module.Cart })))
const Checkout = lazy(() => import('./pages/Checkout').then(module => ({ default: module.Checkout })))
const Confirmation = lazy(() => import('./pages/Checkout').then(module => ({ default: module.Confirmation })))
const AdminRoutes = lazy(() => import('./pages/admin/Routes'))
const query = new QueryClient({defaultOptions:{queries:{staleTime:15000,retry:1}}})
class Boundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<main className="container page"><h1>Une erreur est survenue</h1><button className="button" onClick={()=>location.reload()}>Recharger la page</button></main>:this.props.children}
}
function SiteRoutes(){
 const location=useLocation()
 const {data:config}=useQuery(settings)
 const productId=useMatch('/parfum/:id')?.params.id
 const {data:products}=useQuery({...catalog,enabled:!!productId})
 const productName=products?.find(product=>product.id===productId)?.name
 const titles:Record<string,string>={'/boutique':'Boutique','/panier':'Panier','/commande':'Livraison','/confirmation':'Confirmation'}
 useEffect(()=>{
  window.scrollTo(0,0)
 },[location.pathname])
 useEffect(()=>{
  const name=config?.name??brandName
  const prefix=productName??titles[location.pathname]??(location.pathname.startsWith('/admin')?'Administration':'')
  document.title=prefix?prefix+' · '+name:name+' · Parfumerie de prestige'
  document.querySelector('meta[property="og:title"]')?.setAttribute('content',document.title)
  document.querySelector('meta[property="og:site_name"]')?.setAttribute('content',name)
  if(config?.description) for(const selector of ['meta[name="description"]','meta[property="og:description"]'])document.querySelector(selector)?.setAttribute('content',config.description)
 },[location.pathname,config,productName])
 return <Suspense fallback={<main className="container page">Chargement…</main>}><Routes>
 <Route path="/admin/*" element={<Suspense fallback={<main className="container page">Chargement…</main>}><AdminRoutes/></Suspense>}/>
 <Route element={<StoreLayout/>}><Route index element={<Shop/>}/><Route path="boutique" element={<Shop/>}/><Route path="parfum/:id" element={<Details/>}/><Route path="panier" element={<Cart/>}/><Route path="commande" element={<Checkout/>}/><Route path="confirmation" element={<Confirmation/>}/><Route path="*" element={<section className="container page"><h1>Page introuvable</h1><Link className="button" to="/">Retour à l’accueil</Link></section>}/></Route>
 </Routes></Suspense>
}
export default function App(){
 return <Boundary><QueryClientProvider client={query}><ShopProvider><BrowserRouter><SiteRoutes/></BrowserRouter></ShopProvider></QueryClientProvider></Boundary>
}

