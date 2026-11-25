import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Archive, ArrowUpRight, Boxes, CalendarDays, CheckCircle2, Clock3, FileText, Layers, Package, PackageX, ShoppingBag, Tag, TriangleAlert, Wallet, XCircle, type LucideIcon } from 'lucide-react'
import { catalogStatistics, salesStatistics, storeDay } from '../../lib/adminStatistics'
import { money, statuses } from '../../lib/store'
import './dashboard.css'

const periods = [
 ['today', 'Aujourd’hui'], ['week', '7 derniers jours'], ['month', 'Ce mois'],
 ['year', 'Cette année'], ['custom', 'Personnalisée'],
] as const
type Period = typeof periods[number][0]
const integer = new Intl.NumberFormat('fr-MA')
const shortDate = new Intl.DateTimeFormat('fr-MA', { day:'numeric', month:'short', timeZone:'UTC' })
const fullDate = new Intl.DateTimeFormat('fr-MA', { dateStyle:'long', timeZone:'UTC' })
const chartTooltip = { background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, color:'var(--text)' }
const statusColors = ['#b49460','#80664e','#a96b4c','#8a847c','#62856e','#a85856']
const dateOf = (day:string) => new Date(day+'T12:00:00Z')
const dayMs = 86400000

function presetDates(period:Exclude<Period,'custom'>) {
 const today=storeDay(new Date())
 const start=dateOf(today)
 if(period==='week') start.setUTCDate(start.getUTCDate()-6)
 if(period==='month') start.setUTCDate(1)
 if(period==='year') start.setUTCMonth(0,1)
 return [start.toISOString().slice(0,10),today]
}

function Metric({label,value,icon:Icon,to,detail,tone}:{label:string;value:string|number;icon:LucideIcon;to?:string;detail?:string;tone?:'gold'|'alert'}) {
 const content=<>
  <span className="analytics-metric-top"><span className="analytics-icon"><Icon size={18} aria-hidden/></span>{to&&<ArrowUpRight size={16} aria-hidden/>}</span>
  <span className="analytics-metric-label">{label}</span>
  <strong>{typeof value==='number'?integer.format(value):value}</strong>
  {detail&&<small>{detail}</small>}
 </>
 return to?<Link className="analytics-metric" data-tone={tone} to={to}>{content}</Link>
  :<div className="analytics-metric" data-tone={tone}>{content}</div>
}

export function Overview() {
 const [period,setPeriod]=useState<Period>('week')
 const [custom,setCustom]=useState({from:'',to:''})
 const [from,to]=period==='custom'?[custom.from,custom.to]:presetDates(period)
 const incomplete=period==='custom'&&(!from||!to)
 const invalid=Boolean(from&&to&&from>to)
 const statistics=useQuery({...salesStatistics(from,to),enabled:!incomplete&&!invalid})
 const catalog=useQuery(catalogStatistics)
 const stock=catalog.data
 const data=!incomplete&&!invalid&&!statistics.isError?statistics.data:undefined
 const orderLink=(status?:string)=>'/admin/orders?'+new URLSearchParams({from,to,...(status?{status}:{})})
 const breakdown=Object.entries(statuses).map(([status,label],index)=>({
  status,label,count:data?.statuses[status as keyof typeof statuses]??0,color:statusColors[index],
 }))
 const startTime=dateOf(from).getTime()
 const endTime=dateOf(to).getTime()
 const days=(endTime-startTime)/dayMs+1
 const amounts=new Map(data?.sales.map(row=>[dateOf(row.date).getTime(),row.amount]))
 const sales=amounts.size&&days>0&&days<=366
  ? Array.from({length:days},(_,index)=>{
   const time=startTime+index*dayMs
   return {time,amount:amounts.get(time)??0}
  })
  : Array.from(amounts,([time,amount])=>({time,amount}))

 return <div className="analytics">
  <header className="analytics-header">
   <div><h1>Vue d’ensemble</h1><p>Ventes, commandes et inventaire</p></div>
   <div className="analytics-date">
    <CalendarDays size={17} aria-hidden/>
    <time dateTime={from||undefined}>{from&&!invalid?shortDate.format(dateOf(from)):'Début'}</time>
    <span aria-hidden>–</span>
    <time dateTime={to||undefined}>{to&&!invalid?fullDate.format(dateOf(to)):'Fin'}</time>
   </div>
  </header>
  <div className="analytics-period" role="group" aria-label="Période">
   {periods.map(([id,label])=><button key={id} type="button" aria-pressed={period===id} onClick={()=>setPeriod(id)}>{label}</button>)}
  </div>
  {period==='custom'&&<div className="analytics-custom">
   <label>Du<input type="date" value={custom.from} onChange={event=>setCustom({...custom,from:event.target.value})}/></label>
   <label>Au<input type="date" value={custom.to} onChange={event=>setCustom({...custom,to:event.target.value})}/></label>
  </div>}
  {invalid?<p className="analytics-state" role="alert">La date de fin doit être égale ou postérieure à la date de début.</p>
   :incomplete?<p className="analytics-state">Choisissez les dates de début et de fin.</p>
   :statistics.isError?<div className="analytics-state" role="alert"><p>{statistics.error instanceof Error?statistics.error.message:'Impossible de charger les commandes et les ventes.'}</p><button className="button" type="button" onClick={()=>void statistics.refetch()}>Réessayer</button></div>
   :statistics.isPending?<div className="analytics-state" role="status">Chargement des commandes et des ventes…</div>
   :data&&<>
    <section className="analytics-section" aria-labelledby="analytics-commerce">
     <h2 id="analytics-commerce">Activité commerciale</h2>
     <div className="analytics-metrics">
      <Metric label="Chiffre d’affaires livré" value={money(data.revenue)} icon={Wallet} tone="gold" detail="Livraison comprise"/>
      <Metric label="Commandes" value={data.orders} icon={ShoppingBag} to={orderLink()}/>
      <Metric label="En attente" value={data.statuses.pending??0} icon={Clock3} to={orderLink('pending')}/>
      <Metric label="Livrées" value={data.statuses.delivered??0} icon={CheckCircle2} to={orderLink('delivered')}/>
      <Metric label="Annulées" value={data.statuses.cancelled??0} icon={XCircle} to={orderLink('cancelled')}/>
     </div>
    </section>
    <div className="analytics-grid analytics-charts">
     <section className="analytics-panel">
      <header><h2>Évolution des ventes</h2><p>Chiffre d’affaires par date de livraison</p></header>
      {sales.length?<div className="analytics-chart">
       <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sales} margin={{top:12,right:14,bottom:0,left:0}}>
         <defs><linearGradient id="analytics-sales-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity={0.36}/><stop offset="100%" stopColor="var(--gold)" stopOpacity={0.03}/></linearGradient></defs>
         <CartesianGrid stroke="var(--line)" vertical={false}/>
         <XAxis dataKey="time" type="number" scale="utc" domain={days===1?[startTime-dayMs/2,endTime+dayMs/2]:[startTime,endTime]} ticks={days===1?[startTime]:undefined} tickFormatter={value=>shortDate.format(value)} stroke="var(--muted)" fontSize={11} minTickGap={28}/>
         <YAxis width={57} stroke="var(--muted)" fontSize={11} tickFormatter={value=>integer.format(value)}/>
         <Tooltip contentStyle={chartTooltip} labelStyle={{color:'var(--text)'}} itemStyle={{color:'var(--text)'}} labelFormatter={value=>fullDate.format(Number(value))} formatter={value=>[money(Number(value)),'Ventes livrées']}/>
         <Area type="linear" dataKey="amount" stroke="var(--gold)" strokeWidth={2} fill="url(#analytics-sales-fill)" dot={sales.length<=31?{r:3}:false} activeDot={{r:5}}/>
        </AreaChart>
       </ResponsiveContainer>
      </div>:<p className="analytics-empty">Aucune vente livrée sur cette période.</p>}
     </section>
     <section className="analytics-panel">
      <header><h2>Statuts des commandes</h2><p>Commandes reçues sur la période</p></header>
      {data.orders>0?<><div className="analytics-donut">
       <div className="analytics-donut-label"><strong>{integer.format(data.orders)}</strong><small>Commandes</small></div>
       <ResponsiveContainer width="100%" height="100%">
        <PieChart><Pie data={breakdown.filter(row=>row.count>0)} dataKey="count" nameKey="label" innerRadius="66%" outerRadius="89%" stroke="var(--surface)" paddingAngle={2}>
         {breakdown.filter(row=>row.count>0).map(row=><Cell key={row.status} fill={row.color}/>)}
        </Pie><Tooltip contentStyle={chartTooltip} itemStyle={{color:'var(--text)'}} formatter={(value,name)=>[integer.format(Number(value)),String(name)]}/></PieChart>
       </ResponsiveContainer>
      </div><ul className="analytics-legend">{breakdown.map(row=><li key={row.status}><Link to={orderLink(row.status)}><i style={{background:row.color}} aria-hidden/>{row.label}<strong>{integer.format(row.count)}</strong></Link></li>)}</ul></>:<p className="analytics-empty">Aucune commande sur cette période.</p>}
     </section>
    </div>
   </>}
    <section className="analytics-section" aria-labelledby="analytics-stock">
     <h2 id="analytics-stock">Catalogue et stock</h2>
     {catalog.isError?<div className="analytics-state" role="alert"><p>{catalog.error instanceof Error?catalog.error.message:'Impossible de charger le catalogue et le stock.'}</p><button className="button" type="button" onClick={()=>void catalog.refetch()}>Réessayer</button></div>
      :catalog.isPending?<div className="analytics-state" role="status">Chargement du catalogue et du stock…</div>
      :stock&&<div className="analytics-metrics">
       <Metric label="Produits publiés" value={stock.products.published} icon={Package} to="/admin/products?status=published"/>
       <Metric label="Produits en brouillon" value={stock.products.draft} icon={FileText} to="/admin/products?status=draft"/>
       <Metric label="Produits archivés" value={stock.products.archived} icon={Archive} to="/admin/products?status=archived"/>
       <Metric label="Unités disponibles" value={stock.inventory.units} icon={Boxes} to="/admin/inventory?stock=active&scope=published" detail={integer.format(stock.inventory.variants)+' formats actifs de produits publiés'}/>
       <Metric label="Stock faible" value={stock.inventory.low_stock} icon={TriangleAlert} to="/admin/inventory?stock=low&scope=published" detail="1 à 3 unités par format publié" tone={stock.inventory.low_stock?'alert':undefined}/>
       <Metric label="Ruptures de stock" value={stock.inventory.out_of_stock} icon={PackageX} to="/admin/inventory?stock=out&scope=published" detail="Formats de produits publiés" tone={stock.inventory.out_of_stock?'alert':undefined}/>
       <Metric label="Collections" value={stock.collections} icon={Layers} to="/admin/collections"/>
       <Metric label="Marques" value={stock.brands} icon={Tag}/>
      </div>}
    </section>
   {data&&<>
    <div className="analytics-grid analytics-rankings">
     <section className="analytics-panel">
      <header><h2>Parfums les plus vendus</h2><p>Formats regroupés par parfum, selon les unités livrées</p></header>
      {data.best_sellers.length?<ol className="analytics-list">{data.best_sellers.map(product=><li key={product.id}>
       {product.deleted?<div>{product.name}</div>:<Link to={'/admin/products?'+new URLSearchParams({id:product.id,...(product.archived?{status:'archived'}:{})})}>{product.name}</Link>}
       <span><strong>{integer.format(product.units)} unités</strong><small>{money(product.amount)}</small></span>
      </li>)}</ol>:<p className="analytics-empty">Aucun parfum livré sur cette période.</p>}
     </section>
     <section className="analytics-panel">
      <header><h2>Ventes par collection</h2><p>Hors livraison. Pour les parfums supprimés, les collections sont celles enregistrées au moment de la suppression.</p></header>
      {data.collection_sales.length?<ul className="analytics-list analytics-collection-list">{data.collection_sales.map(collection=><li key={collection.id??'unassigned'}>
       <div><span>{collection.name??'Sans collection'}</span><strong>{money(collection.amount)}</strong></div>
       <div className="analytics-track" aria-hidden><span style={{width:(data.collection_sales[0].amount>0?collection.amount/data.collection_sales[0].amount*100:0)+'%'}}/></div>
      </li>)}</ul>:<p className="analytics-empty">Aucune vente à répartir sur cette période.</p>}
     </section>
    </div>
    <section className="analytics-panel analytics-recent">
     <header><div><h2>Commandes récentes</h2><p>Dernières commandes reçues sur la période</p></div><Link className="analytics-link" to={orderLink()}>Voir les commandes <ArrowUpRight size={15} aria-hidden/></Link></header>
     {data.recent.length?<ul className="analytics-list">{data.recent.map(order=><li key={order.id}>
      <Link to={'/admin/orders?'+new URLSearchParams({ref:order.reference})}><strong>{order.reference}</strong><small>{shortDate.format(dateOf(storeDay(order.created_at)))}</small></Link>
      <span className="order-status" data-status={order.status}>{statuses[order.status]}</span><strong>{money(order.total)}</strong>
     </li>)}</ul>:<p className="analytics-empty">Aucune commande reçue sur cette période.</p>}
    </section>
   </>}
 </div>
}

