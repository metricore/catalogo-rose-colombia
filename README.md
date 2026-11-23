# Catálogo Rose Boutique Colombia (Cloudflare)

Catálogo web de jeans y sandalias para Colombia, independiente de Tiendanube, publicado en **Cloudflare Workers**. Carga rápido en todo el país porque Cloudflare lo sirve desde servidores cercanos.

- **Catálogo:** la raíz del sitio (`/`).
- **Panel:** `/admin`. Ahí cambias precios, tallas, descripciones, fotos, colores y WhatsApp.

## Cómo funciona

- `public/`: catálogo (`index.html`), panel (`admin/index.html`) y fotos iniciales (`uploads/`).
- `src/worker.js`: entrega `/catalog.json`, las fotos que subes desde el panel (`/u/...`) y la API del panel (`/api/...`).
- Los productos y las fotos nuevas se guardan en Cloudflare KV (`rose-colombia-catalogo`). Cada vez que guardas, queda un respaldo por 30 días.
- `src/seed.json`: datos iniciales; solo se usan si KV está vacío.
- Cada cambio que se sube a GitHub se publica solo (Workers Builds).

## Notas

- Los cambios de precio se ven al instante desde el botón "Ver catálogo" del panel, y para las clientas en máximo 1 minuto.
- Contraseña del panel: se guarda cifrada en KV (`auth`). Para reiniciarla, borra la clave `auth` en Cloudflare → Storage → KV → rose-colombia-catalogo, y el panel pedirá crear una nueva.
