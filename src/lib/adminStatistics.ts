import { queryOptions } from '@tanstack/react-query'
import { db, type Order, type Status } from './store'

interface CatalogStatistics {
 products: { published: number; draft: number; archived: number }
 collections: number
 brands: number
 inventory: { variants: number; units: number; low_stock: number; out_of_stock: number }
}

interface SalesStatistics {
 orders: number
 statuses: Partial<Record<Status, number>>
 revenue: number
 sales: { date: string; amount: number }[]
 best_sellers: { id: string; name: string; archived: boolean; deleted?: boolean; units: number; amount: number }[]
 collection_sales: { id: string | null; name: string | null; amount: number }[]
 recent: Pick<Order, 'id' | 'reference' | 'total' | 'status' | 'created_at'>[]
}

export const adminStatisticsKey = ['admin-statistics'] as const
const storeDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca', dateStyle: 'short' })
export const storeDay = (date: string | Date) => storeDate.format(new Date(date))

export const catalogStatistics = queryOptions({
 queryKey: [...adminStatisticsKey, 'catalog'],
 refetchInterval: 15000,
 queryFn: async ({ signal }): Promise<CatalogStatistics> => {
  const { data, error } = await db!.rpc('admin_catalog_statistics').abortSignal(signal)
  if (error?.code==='PGRST202') throw new Error('Appliquez la migration 202611250004 pour charger les chiffres du catalogue.')
  if (error) throw error
  const counts=[data?.products?.published,data?.products?.draft,data?.products?.archived,data?.collections,data?.brands,
   data?.inventory?.variants,data?.inventory?.units,data?.inventory?.low_stock,data?.inventory?.out_of_stock]
  if (!counts.every(value=>Number.isSafeInteger(value)&&value>=0)) {
   throw new Error('Les chiffres du catalogue sont incomplets.')
  }
  return data
 },
})

export const salesStatistics = (from: string, to: string) => queryOptions({
 queryKey: [...adminStatisticsKey, 'sales', from, to],
 refetchInterval: 15000,
 queryFn: async ({ signal }): Promise<SalesStatistics> => {
  const { data, error } = await db!.rpc('admin_dashboard_statistics', {
   p_from: from || null,
   p_to: to || null,
  }).abortSignal(signal)
  if (error) throw error
  if (!Array.isArray(data?.best_sellers) || !Array.isArray(data?.collection_sales)) {
   throw new Error('La migration des statistiques 202611250003 est requise.')
  }
  if (!Number.isSafeInteger(data.orders) || !Number.isFinite(data.revenue) || !data.statuses ||
      !Array.isArray(data.sales) || !Array.isArray(data.recent)) {
   throw new Error('Les chiffres des commandes et des ventes sont incomplets.')
  }
  return data
 },
})
