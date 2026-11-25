import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, Login } from './Admin'
import { Overview } from './Dashboard'
import { Collections } from './Collections'
import { Inventory, Products } from './Catalog'
import { Delivery, Orders, StoreSettings } from './Operations'

export default function AdminRoutes(){
 return <Routes><Route path="login" element={<Login/>}/><Route element={<AdminLayout/>}><Route index element={<Overview/>}/><Route path="products" element={<Products/>}/><Route path="collections" element={<Collections/>}/><Route path="orders" element={<Orders/>}/><Route path="inventory" element={<Inventory/>}/><Route path="delivery" element={<Delivery/>}/><Route path="settings" element={<StoreSettings/>}/><Route path="*" element={<Navigate to="/admin" replace/>}/></Route></Routes>
}

