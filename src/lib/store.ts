import { createClient } from '@supabase/supabase-js'
import { queryOptions } from '@tanstack/react-query'

function connectStore() {
 const url = import.meta.env.VITE_SUPABASE_URL?.trim()
 const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
 if (!url || !key || url === 'https://YOUR_PROJECT_REF.supabase.co' || key === 'YOUR_PUBLISHABLE_KEY') return null
 try {
   return createClient(url, key)
 } catch {
   return null
 }
}
export const db = connectStore()

export interface Variant { id: string; size_ml: number; price: number; sale_price: number | null; stock: number; active: boolean }
export interface Photo { id: string; path: string; position: number }
export interface Taxon { id: string; name: string }
export interface Product {
 id: string; name: string; description: string; published: boolean; featured: boolean; bestseller: boolean
 created_at: string; brand_id: string; category_id: string
 brands: Taxon | null; categories: Taxon | null; product_variants: Variant[]; product_images: Photo[]
}
export interface City { id: string; name: string; fee: number; enabled: boolean; option: string }
export interface Settings {
 name: string; headline: string; description: string; promotion: string; instagram: string; whatsapp: string; contact: string; logo: string; banner: string; delivery: string
}
export const brandName = 'Aymane Pafune'
const previousBrand = /\bmaison\s+ambre\b/gi
const rebrand = (text: string) => text.replace(previousBrand, brandName)
export const defaults: Settings = {
 name: brandName, headline: 'Le parfum est\nun art.', description: 'Une sélection de parfums de prestige, choisis pour leur authenticité. Livrés partout au Maroc.',
 promotion: '', instagram: '', whatsapp: '', contact: '', logo: '', banner: '', delivery: 'Paiement à la livraison'
}
export const productFields = '*, brands(*), categories(*), product_variants(*), product_images(*)'
export const catalog = queryOptions({ queryKey: ['catalog'], retry: db ? undefined : false, queryFn: async () => {
 if (!db) throw new Error('Supabase catalog configuration is missing or invalid.')
 const products: Product[] = []
 for (let start=0;;start+=500) {
   const { data, error } = await db.from('products').select(productFields).eq('published',true).order('created_at',{ascending:false}).order('id').range(start,start+499)
   if (error) throw error
   products.push(...data as Product[])
   if (data.length < 500) return products
 }
}})
export const settings = queryOptions({ queryKey: ['settings'], queryFn: async () => {
 if (!db) return defaults
 const { data, error } = await db.from('store_settings').select('*').eq('id', 1).maybeSingle()
 if (error) throw error
 const config = { ...defaults, ...data } as Settings
 return {
   ...config,
   name: rebrand(config.name.trim()) || brandName,
   headline: rebrand(config.headline),
   description: rebrand(config.description),
   promotion: rebrand(config.promotion),
   contact: rebrand(config.contact),
   delivery: rebrand(config.delivery),
 }
}})
export const cities = queryOptions({ queryKey: ['cities'], queryFn: async () => {
 if (!db) return []
 const { data, error } = await db.from('delivery_cities').select('id,name,fee,enabled,option').eq('enabled', true).order('name')
 if (error) throw error
 return data as City[]
}})
const formatter = new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' })
export const money = (value: number) => formatter.format(value)
export const price = (v: Variant) => v.sale_price ?? v.price
export const variants = (p: Product) => p.product_variants.filter(v => v.active).sort((a,b) => a.size_ml-b.size_ml)
export const photoUrl = (path: string, width?: number) => db?.storage.from('store-media').getPublicUrl(path, width ? { transform: { width, quality: 80 } } : undefined).data.publicUrl ?? ''
export const photos = (p: Product) => [...p.product_images].sort((a,b) => a.position-b.position)
export const statuses = { pending:'En attente', confirmed:'Confirmée', preparing:'En préparation', shipped:'Expédiée', delivered:'Livrée', cancelled:'Annulée' }
export type Status = keyof typeof statuses
export interface OrderItem { variant_id: string; product_name: string; size_ml: number; quantity: number; unit_price: number }
export interface Receipt { reference: string; total: number; subtotal: number; delivery_fee: number; customer_name: string; city_name: string; address: string; items: OrderItem[] }
export interface Order extends Omit<Receipt,'items'> { id: string; status: Status; phone: string; notes: string; internal_note: string; created_at: string; order_items: OrderItem[]; order_status_history: { status: Status; created_at: string }[] }

