---
name: catalogo-rose-colombia
description: Mantiene el catálogo web de Rose Boutique Colombia (jeans y sandalias) publicado en Cloudflare Workers con panel /admin. Úsala cuando Orlando pida cambios de diseño, agregar productos con fotos, o publicar el catálogo de Colombia.
---

# Catálogo Rose Boutique Colombia (Cloudflare)

## Piezas
- `public/index.html`: catálogo. Lee `/catalog.json` y arma tarjetas (foto por color, tallas, precio detalle/mayor, botón WhatsApp con REF, color y talla).
- `public/admin/index.html`: panel (login, editar productos, subir fotos, colores, orden, textos, WhatsApp, cambiar contraseña).
- `src/worker.js`: `/catalog.json` (KV `catalog`, caché 60 s), `/u/<foto>` (KV `img:<foto>`), `/api/me|setup|login|logout|catalog|save|upload|password`.
- KV `rose-colombia-catalogo` (binding `DB`): `catalog`, `img:*`, `auth`, `bk:*` (respaldos de 30 días).
- Fotos iniciales en `public/uploads/` (rutas `uploads/...`). Fotos subidas desde el panel: rutas `u/...`.

## Reglas
- No inventar precios, tallas ni referencias.
- El catálogo vivo está en KV. Para agregar productos tú mismo: inicia sesión en `/api/login`, lee `/api/catalog`, agrega, sube las fotos por `/api/upload` y guarda con `/api/save`. Nunca reemplaces KV con `src/seed.json`.
- Cambios de diseño: edita `public/` o `src/`, prueba con `npx wrangler dev` y haz push a `main` (Workers Builds publica solo).
- No tocar el catálogo de Chile en Hostinger ni los DNS de jeanscolombianosrose.cl (salvo agregar el registro del subdominio de Colombia si Orlando lo pide).
