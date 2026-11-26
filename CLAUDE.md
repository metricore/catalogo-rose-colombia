# Catálogo Rose Boutique Colombia (Cloudflare)

Catálogo de jeans y sandalias de Rose Boutique para Colombia, independiente de Tiendanube, en Cloudflare Workers (worker `catalogo`, KV `rose-colombia-catalogo`). Orlando maneja productos, precios (COP), tallas y fotos desde `/admin`.

- Habla con Orlando en español, breve y claro.
- Sigue la skill `catalogo-rose-colombia` (.claude/skills/catalogo-rose-colombia/SKILL.md).
- Estética negro y rosa claro (Bodoni Moda + Jost). No recortar fotos. No inventar precios, tallas ni referencias.
- Los datos viven en KV: nunca sobrescribas la clave `catalog` con `src/seed.json`.
- No toques el catálogo de Chile (catalogo.jeanscolombianosrose.cl, Hostinger) ni los DNS de la tienda y el correo.
