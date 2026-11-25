import { queryOptions } from '@tanstack/react-query'
import { db, productFields, type Product } from './store'

export const collectionBucket = 'collection-media'
export function isCollectionSchemaMissing(error: unknown) {
 return typeof error === 'object' && error !== null && 'code' in error
  && (error.code === 'PGRST205' || error.code === '42P01')
}
export interface StoreCollection {
 id: string
 name: string
 slug: string
 image_path: string | null
 published: boolean
 sort_order: number
 imageUrl?: string
 product_collections?: { count: number }[]
}
const fields = 'id,name,slug,image_path,published,sort_order'

async function loadCollections(admin: boolean) {
 const rows: StoreCollection[] = []
 for (let start = 0; ; start += 500) {
  let request = db!.from('collections').select(admin ? fields + ',product_collections(count)' : fields)
  if (!admin) request = request.eq('published', true)
  const { data, error } = await request.order('sort_order').order('created_at').order('id').range(start, start+499)
  if (error) throw error
  const page = data as unknown as StoreCollection[]
  const paths = page.flatMap(collection => collection.image_path ? [collection.image_path] : [])
  if (paths.length) {
   const signed = await db!.storage.from(collectionBucket).createSignedUrls(paths, 3600)
   const urls = new Map(signed.data?.map(item => [item.path, item.signedUrl]))
   for (const collection of page) collection.imageUrl = urls.get(collection.image_path) ?? undefined
  }
  rows.push(...page)
  if (page.length < 500) return rows
 }
}

export const publishedCollections = queryOptions({
 queryKey: ['collections', 'published'],
 queryFn: () => db ? loadCollections(false) : Promise.resolve([]),
})
export const adminCollections = queryOptions({
 queryKey: ['collections', 'admin'],
 queryFn: () => loadCollections(true),
})

export const productMemberships = (productId?: string) => queryOptions({
 queryKey: ['collection-memberships', productId],
 enabled: Boolean(productId),
 queryFn: async () => {
  const ids: string[] = []
  for (let start = 0; ; start += 500) {
   const { data, error } = await db!.from('product_collections').select('collection_id').eq('product_id', productId!).order('collection_id').range(start,start+499)
   if (error) throw error
   ids.push(...data.map(row => row.collection_id as string))
   if (data.length < 500) return ids
  }
 },
})

export const collectionProducts = (id?: string) => queryOptions({
 queryKey: ['collection-products', id],
 refetchOnMount: 'always',
 enabled: Boolean(id),
 queryFn: async () => {
  const products: Product[] = []
  for (let start = 0; ; start += 500) {
   const { data, error } = await db!.from('products').select(productFields + ',product_collections!inner(collection_id)')
    .eq('published',true).eq('product_collections.collection_id',id!).order('created_at',{ ascending:false }).order('id').range(start,start+499)
   if (error) throw error
   products.push(...data as unknown as Product[])
   if (data.length < 500) return products
  }
 },
})
