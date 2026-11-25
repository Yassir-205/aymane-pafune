import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, ClipboardList, LayoutDashboard, Layers, LogOut, Menu, Truck, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { BrandMark, ThemeButton } from '../../components/StoreUI'
import { brandName, db, type Order } from '../../lib/store'
import { useShop } from '../../contexts/Shop'
import { adminStatisticsKey } from '../../lib/adminStatistics'

export function useAdmin() {
 const [session,setSession] = useState<Session | null | undefined>(undefined)
 useEffect(()=>{
   if (!db) { setSession(null); return }
   const {data:{subscription}} = db.auth.onAuthStateChange((_event,next)=>setSession(next))
   return ()=>subscription.unsubscribe()
 },[])
 const role = useQuery({
   queryKey:['admin-role',session?.user.id], enabled:!!session,
   queryFn:async()=>{ const {data,error}=await db!.rpc('is_admin'); if(error) throw error; return data === true }
 })
 return {ready:session !== undefined && (!session || !role.isPending), allowed:!!session && role.data === true}
}
export function Login() {
 const {allowed} = useAdmin()
 const [error,setError] = useState('')
 const [busy,setBusy] = useState(false)
 if(allowed) return <Navigate to="/admin" replace/>
 async function submit(e:FormEvent<HTMLFormElement>) {
   e.preventDefault()
   if(!db) return
   const values=new FormData(e.currentTarget)
   setBusy(true); setError('')
   try {
     const login=await db.auth.signInWithPassword({email:String(values.get('email')),password:String(values.get('password'))})
     if(login.error) { setError('Identifiants invalides.'); return }
     const role=await db.rpc('is_admin')
     if(role.data !== true) { await db.auth.signOut({scope:'local'}); setError('Accès administrateur requis.') }
   } catch { setError('Connexion momentanément indisponible.') }
   finally { setBusy(false) }
 }
 return <main className="container page login"><ThemeButton/><form className="panel fields" onSubmit={submit}><p className="wordmark"><BrandMark/>{brandName}</p><h1>Administration</h1><label>E-mail<input name="email" type="email" required autoComplete="username"/></label><label>Mot de passe<input name="password" type="password" required autoComplete="current-password"/></label>{!db && <p>Configurez Supabase pour ouvrir l’administration.</p>}{error && <p role="alert">{error}</p>}<button className="button primary" disabled={!db||busy}>Se connecter</button><NavLink to="/">Retour à la boutique</NavLink></form></main>
}
const links=[['','Vue d’ensemble',LayoutDashboard],['/orders','Commandes',ClipboardList],['/products','Produits',Boxes],['/collections','Collections',Layers],['/delivery','Livraison',Truck]] as const
export function AdminLayout() {
 const {ready,allowed}=useAdmin()
 const [open,setOpen]=useState(false)
 const [signingOut,setSigningOut]=useState(false)
 const drawerToggle=useRef<HTMLButtonElement>(null)
 const location=useLocation()
 const navigate=useNavigate()
 const query=useQueryClient()
 const {setNotice}=useShop()
 useEffect(()=>{
  if(!allowed||!db) return
  const client=db
  const refreshOrders=()=>{
   void query.invalidateQueries({queryKey:['admin-orders']})
   void query.invalidateQueries({queryKey:['admin-products']})
   void query.invalidateQueries({queryKey:adminStatisticsKey})
  }
  const channel=client.channel('admin-order-updates')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},refreshOrders)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders'},refreshOrders)
   .subscribe(status=>{if(status==='SUBSCRIBED') refreshOrders()})
  return ()=>{void client.removeChannel(channel)}
 },[allowed,query])
 useEffect(()=>setOpen(false),[location.pathname])
 useEffect(()=>{
  if(!open) return
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);drawerToggle.current?.focus()}}
  window.addEventListener('keydown',close)
  return ()=>window.removeEventListener('keydown',close)
 },[open])
 if(!ready) return <main className="container page">Vérification de l’accès…</main>
 if(!allowed) return <Navigate to="/admin/login" replace/>
 async function signOut() {
   setSigningOut(true)
   try {
    const {error}=await db!.auth.signOut({scope:'local'})
    if(error) throw error
    query.clear()
    navigate('/admin/login',{replace:true})
   } catch { setNotice('La déconnexion a échoué. Réessayez.') }
   finally {setSigningOut(false)}
 }
 return <div className="admin-shell">
  <header className="admin-top"><button ref={drawerToggle} className="icon menu-trigger" aria-label="Menu administration" aria-controls="admin-sidebar" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button><NavLink className="wordmark" to="/admin"><BrandMark/>{brandName}</NavLink><ThemeButton/></header>
  {open&&<div className="admin-scrim" aria-hidden="true" onClick={()=>{setOpen(false);drawerToggle.current?.focus()}}/>}
  <aside id="admin-sidebar" className={open?'admin-side open':'admin-side'}>
   <nav aria-label="Administration">{links.map(([path,label,Icon])=><NavLink end={!path} to={'/admin'+path} key={path} onClick={()=>setOpen(false)}><Icon size={18} aria-hidden/>{label}</NavLink>)}</nav>
   <button className="button admin-logout" disabled={signingOut} onClick={signOut}><LogOut size={18} aria-hidden/>{signingOut?'Déconnexion…':'Se déconnecter'}</button>
  </aside>
  <main className="admin-content"><Outlet/></main>
 </div>
}
export async function fetchAll<T>(table: string, fields: string) {
 const rows:T[]=[]
 for(let start=0;;start+=500) {
   const {data,error}=await db!.from(table).select(fields).order('id').range(start,start+499)
   if(error) throw error
   rows.push(...data as T[])
   if(data.length<500) return rows
 }
}
export const orderQuery={queryKey:['admin-orders'],refetchInterval:15000,queryFn:async()=> (await fetchAll<Order>('orders','id,reference,status,customer_name,phone,city_name,address,notes,internal_note,subtotal,delivery_fee,total,created_at,order_items(*),order_status_history(status,created_at)')).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
