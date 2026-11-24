import { db } from '../../lib/store'

export function mediaId() {
 return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')
}

export async function uploadImage(file:File, folder:string) {
 if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type) || file.size>20*1024*1024) throw new Error('Format ou taille d’image invalide.')
 const bitmap=await createImageBitmap(file)
 const factor=Math.min(1,1600 / Math.max(bitmap.width,bitmap.height))
 const canvas=document.createElement('canvas')
 canvas.width=Math.max(1,Math.round(bitmap.width*factor))
 canvas.height=Math.max(1,Math.round(bitmap.height*factor))
 const context=canvas.getContext('2d')
 if(!context){ bitmap.close(); throw new Error('Image illisible.') }
 context.drawImage(bitmap,0,0,canvas.width,canvas.height)
 bitmap.close()
 const image=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',0.85))
 if(!image || image.size>5*1024*1024) throw new Error('Image trop volumineuse.')
 const path=folder+'/'+mediaId()+(image.type==='image/webp'?'.webp':'.png')
 const {error}=await db!.storage.from('store-media').upload(path,image,{contentType:image.type,cacheControl:'86400'})
 if(error) throw error
 return path
}

