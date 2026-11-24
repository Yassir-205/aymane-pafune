import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { catalog, price, variants } from '../lib/store'

function read<T,>(key: string, fallback: T): T {
 try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function useStore() {
 const [theme, setTheme] = useState(() => read('ma-theme', 'dark'))
 const [cart, setCart] = useState<Record<string, number>>(() => read('ma-cart', {}))
 const [notice, setNotice] = useState('')
 const { data: products = [], isPending } = useQuery(catalog)
 useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('ma-theme', JSON.stringify(theme)) }, [theme])
 useEffect(() => { localStorage.setItem('ma-cart', JSON.stringify(cart)) }, [cart])
 useEffect(() => {
   if (!notice) return
   const timeout = setTimeout(() => setNotice(''), 3500)
   return () => clearTimeout(timeout)
 }, [notice])
 const lines = products.flatMap(product => variants(product).filter(v => cart[v.id] > 0).map(variant => ({ product, variant, quantity: cart[variant.id] })))
 const total = lines.reduce((sum, line) => sum + price(line.variant) * line.quantity, 0)
 function update(id: string, quantity: number) {
   setCart(current => {
     const next = { ...current }
     if (quantity <= 0) delete next[id]
     else {
       const stock = lines.find(line => line.variant.id === id)?.variant.stock ?? 0
       const allowed = Math.min(stock,20,Math.floor(quantity))
       if (allowed > 0) next[id] = allowed
       else delete next[id]
     }
     return next
   })
 }
 function add(id: string, stock: number) {
   setCart(current => ({ ...current, [id]: Math.min(stock, 20, (current[id] ?? 0) + 1) }))
   setNotice('Parfum ajouté au panier.')
 }
 return { theme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'), cart, lines, total, isPending, update, add, notice, setNotice, clear: () => setCart({}) }
}
const ShopContext = createContext<ReturnType<typeof useStore> | null>(null)
export function ShopProvider({ children }: { children: ReactNode }) {
 const value = useStore()
 return <ShopContext.Provider value={value}>{children}<div role="status" className={value.notice ? 'toast' : 'sr-only'}>{value.notice}</div></ShopContext.Provider>
}
export function useShop() {
 const value = useContext(ShopContext)
 if (!value) throw new Error('ShopProvider absent')
 return value
}

