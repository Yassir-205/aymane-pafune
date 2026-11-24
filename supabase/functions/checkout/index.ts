import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";

const schema = z.object({
  key: z.uuid(), name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^(?:0|\+?212)[5-7][0-9]{8}$/),
  cityId: z.uuid(), address: z.string().trim().min(8).max(300),
  notes: z.string().trim().max(500).default(""),
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) })).min(1).max(20),
});
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2,"0")).join("");
const errors: Record<string,string> = {
  INVALID_STOCK: "Certains articles ne sont plus disponibles dans les quantités demandées.",
  INVALID_CITY: "La livraison dans cette ville est indisponible.",
  KEY_CONFLICT: "Ce lien de commande a déjà été utilisé.",
  INVALID_ITEMS: "Vérifiez les articles du panier.",
};
function parseOrigin(value: string): string | null {
  if (!/^https?:\/\/[^\s/?#\\]+\/?$/i.test(value) || value.includes("*")) return null;
  try {
    const url = new URL(value);
    return url.username || url.password || url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

Deno.serve(async request => {
  const origin = request.headers.get("origin");
  const entries = (Deno.env.get("STORE_ORIGINS") ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const allowed = entries.map(parseOrigin).filter(value => value !== null);
  const requestOrigin = origin === null ? null : parseOrigin(origin);
  const allowedOrigin = requestOrigin !== null && requestOrigin === origin && allowed.includes(requestOrigin);
  const headers = new Headers({
    "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  if (allowedOrigin) headers.set("Access-Control-Allow-Origin", requestOrigin);
  const respond = (status:number, body:unknown) => new Response(JSON.stringify(body), { status, headers });
  if (origin !== null && !allowedOrigin) {
    console.warn("checkout: origin rejected", { method: request.method, origin: requestOrigin, allowedOriginCount: allowed.length, invalidEntryCount: entries.length - allowed.length });
    return respond(403,{message:"Origine non autorisée."});
  }
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (request.method !== "POST") return respond(405,{message:"Méthode non autorisée."});
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("CHECKOUT_RATE_SECRET");
  if (!url || !serviceKey || !secret?.trim()) {
    console.error("checkout: required environment variables are missing", { supabaseUrl: !url, serviceKey: !serviceKey, rateSecret: !secret?.trim() });
    return respond(503,{message:"Le service de commande est momentanément indisponible."});
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return respond(400,{message:"Données manquantes."});
    let size = 0, body = "";
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return respond(413,{message:"Commande trop volumineuse."}); }
      body += decoder.decode(value,{stream:true});
    }
    const raw = (() => { try { return JSON.parse(body+decoder.decode()); } catch { return null; } })();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return respond(400,{message:"Vérifiez vos coordonnées et les articles du panier."});
    const { key, ...payload } = parsed.data;
    payload.phone = payload.phone.replace(/^\+?212/,"0");
    payload.items.sort((a,b)=>a.variantId.localeCompare(b.variantId));
    if (new Set(payload.items.map(item=>item.variantId)).size !== payload.items.length) return respond(400,{message:errors.INVALID_ITEMS});
    const client = createClient(url,serviceKey,{auth:{persistSession:false}});
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
    const ipLimit = await client.rpc("consume_checkout_limit",{p_identifier:await digest(secret+":ip:"+ip)});
    if (ipLimit.error) {
      console.error("checkout: IP rate-limit RPC failed", ipLimit.error.code);
      return respond(503,{message:"Le service de commande est momentanément indisponible."});
    }
    if (!ipLimit.data) return respond(429,{message:"Trop de tentatives. Réessayez dans quelques minutes."});
    const phoneLimit = await client.rpc("consume_checkout_limit",{p_identifier:await digest(secret+":phone:"+payload.phone)});
    if (phoneLimit.error) {
      console.error("checkout: phone rate-limit RPC failed", phoneLimit.error.code);
      return respond(503,{message:"Le service de commande est momentanément indisponible."});
    }
    if (!phoneLimit.data) return respond(429,{message:"Trop de tentatives. Réessayez dans quelques minutes."});
    const result = await client.rpc("create_checkout",{
      p_key:key,p_hash:await digest(JSON.stringify(payload)),p_name:payload.name,p_phone:payload.phone,
      p_city:payload.cityId,p_address:payload.address,p_notes:payload.notes,p_items:payload.items,
    });
    if (result.error) {
      const message = errors[result.error.message];
      if (!message) console.error("checkout: order RPC failed", result.error.code);
      return respond(message ? 409 : 500,{message:message ?? "La commande n’a pas pu être confirmée."});
    }
    return respond(200,result.data);
  } catch {
    console.error("checkout: unexpected handler failure");
    return respond(500,{message:"La commande n’a pas pu être confirmée."});
  }
});

