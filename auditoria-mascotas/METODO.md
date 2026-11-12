# Método de la auditoría

Ejecutado el 12-11-2026 con `auditar.py` (Python + requests + BeautifulSoup).

## Reglas de acceso
- Solo solicitudes `GET` a páginas públicas. No se enviaron formularios, no se agregó nada al
  carro, no se abrieron checkout ni cuentas.
- Máximo 1 solicitud cada 1,1 s por host (las redirecciones se siguen manualmente y también
  respetan el límite). User-Agent de Chrome 130 de escritorio.
- No se ejecuta JavaScript ni se intenta superar desafíos anti-bot. Si un sitio devuelve un
  desafío, se registra y la celda queda vacía.
- Los sitios que en la primera pasada devolvieron desafío anti-bot o error se reintentaron una
  sola vez (~20 min después). Para centralvet.cl se consultó además el DNS público
  (dns.google) para explicar la falla.

## Columnas
| Columna | Cómo se obtiene |
|---|---|
| activo | `sí` si la portada responde 200 y hay señales de tienda (plataforma de e-commerce o carro/fichas). Vacío si un desafío anti-bot impide saberlo. |
| plataforma | Huellas en HTML y cabeceras: `cdn.shopify.com`/`Shopify.theme` (Shopify), `wp-content/plugins/woocommerce`/clases `woocommerce-` + WordPress (WooCommerce), `var prestashop`/`/modules/ps_` (PrestaShop), y equivalentes para Jumpseller, VTEX, Tiendanube, Magento, Wix, Bsale, etc. |
| datos_estructurados | En la ficha revisada: JSON-LD (`@type` Product/ProductGroup, incluso dentro de `@graph` o `hasVariant`) o microdatos `schema.org/Product`. 2 = con precio (`price`/`lowPrice`) **y** `availability`; 1 = Product sin alguno de los dos; 0 = sin Product. |
| rastreadores_ia | `/robots.txt` interpretado según RFC 9309 (grupo más específico por user-agent, regla de coincidencia más larga, `*` y `$`). Cada bot (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, CCBot) cuenta como bloqueado si no puede acceder a `/` **o** a la ruta de la ficha revisada. 2 = ninguno bloqueado; 1 = algunos; 0 = todos. Sin robots.txt (404) = 2. |
| precio_visible | HTML de la ficha sin JS, quitando `<script>`, `<style>`, `<template>`, cabecera/pie/nav del sitio, carro lateral y bloques de productos relacionados. Se ubica la zona del producto (contenedor de WooCommerce, formulario `/cart/add`, `itemtype=Product`, etc.) y se buscan montos (`$12.990`, o números dentro de elementos `itemprop=price`/clase `price`). Stock = texto de disponibilidad (“7 disponibles”, “En stock”, “Agotado”, “Sin existencias”, “Solo queda 1 unidad”…). Los textos “Agotado” de plantilla que el tema oculta/muestra por CSS (p. ej. Dawn de Shopify) no cuentan cuando el JSON-LD dice `InStock`. 2 = precio y stock; 1 = solo precio; 0 = ninguno. |
| medios_de_pago | Menciones en texto visible, atributos (`alt`, `title`, `src`, `href`, `class`) y URLs de scripts/estilos externos (p. ej. `plugins/transbank-webpay-plus-rest`) de la portada, la ficha y hasta 2 páginas enlazadas tipo “medios de pago / cómo comprar”. No se usan scripts inline (Shopify menciona PayPal en su código aunque la tienda no lo ofrezca). Vacío = no se menciona en esas páginas; puede aparecer solo en el checkout, que no se abrió. |
| productos_aprox | URLs de producto en el sitemap: se siguen los sitemaps declarados en robots.txt (o `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`); si hay sub-sitemaps de producto (`product-sitemap.xml`, `sitemap_products_1.xml`…) se cuentan todas sus URLs, si no, las URLs con patrón de producto (`/producto/`, `/products/`, `/<id>-slug.html`…). Se excluyen sitemaps de categorías/etiquetas, la página de tienda y duplicados por idioma (`/es/products/x` = `/products/x`). |
| url_producto_revisada | Ficha tomada del medio de la lista del sitemap (para evitar el primer producto, a menudo antiguo); si no hay sitemap útil, de enlaces de la portada o de `/tienda/`/`/shop/`. |

## Limitaciones
- Una ficha por sitio: el stock y los datos estructurados pueden variar entre productos.
- Las celdas vacías significan “no se pudo determinar”, no “0”. El motivo está en `notas`.
- La evidencia de cada puntaje (montos y textos de stock encontrados, veredicto por bot,
  sitemaps leídos, páginas de pago visitadas) está en `evidencia.json`.

## Reproducir
```
python3 auditar.py --cache cache/ --out auditoria.csv --evidence evidencia.json
python3 resumen.py auditoria.csv evidencia.json resumen.md
```
