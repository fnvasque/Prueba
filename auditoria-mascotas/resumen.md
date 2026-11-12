# Auditoría de legibilidad para agentes de IA — tiendas de mascotas (Chile)

Sitios auditados: **39**. Lectura solo de páginas públicas (GET), sin sesión, sin ejecutar JavaScript, máx. 1 solicitud/s por host, User-Agent de Chrome. Detalle por sitio en `auditoria.csv`; evidencia (lo que se encontró en cada página) en `evidencia.json`; método en `METODO.md`.

## Cifras generales

- Tiendas activas confirmadas: **36** de 39.
- Distribución de puntajes (puntaje→sitios): datos estructurados 2→29, 1→0, 0→6; rastreadores IA 2→34, 1→2, 0→0; precio visible 2→11, 1→24, 0→0.

## Hallazgos principales

- **Datos estructurados:** 6 fichas sin ningún schema Product (lospatiperrosconcepcion.cl, petshopmg.cl, superbarf.cl, bigotesblancos.cl, gourpet.cl, huellasfood.cl). Todas son WooCommerce y las seis usan una plantilla de ficha de Elementor (`data-elementor-type="product"`); causa probable: esa plantilla no ejecuta el hook que imprime el JSON-LD Product de WooCommerce. Tres tienen JSON-LD de Yoast, pero sin Product. Ningún sitio quedó con Product parcial (puntaje 1).
- **Rastreadores IA:** 2 sitios bloquean bots de IA en robots.txt: fullerton.cl (GPTBot, ClaudeBot, Google-Extended, CCBot); pethome.cl (GPTBot, ClaudeBot, Google-Extended, CCBot). En ambos casos siguen permitidos OAI-SearchBot, ChatGPT-User y PerplexityBot (los bots de búsqueda/consulta en vivo). Ningún sitio tiene `User-agent: * / Disallow: /`.
- **Precio y stock sin JavaScript:** el precio aparece en el HTML de las 35 fichas revisadas, pero solo 11 muestran además stock/disponibilidad en texto (fullerton.cl, happymascota.cl, petshopmg.cl, animal-lovers.cl, bpets.cl, pyk.cl, aricapetshop.cl, bestforpets.cl, pethome.cl, puntomascotas.cl, tiendapet.cl). En el resto un agente que no ejecuta JS ve el precio pero no si hay stock (salvo que lea el JSON-LD).
- **Bloqueos anti-bot:** en la primera pasada 5 sitios (gourpet, arenasdelmundo, puntomascotas, bestforpets: desafío JS de SiteGround; barfood: firewall anti-spam) devolvieron una página de desafío en vez del contenido. Al reintentar ~20 min después respondieron normal y se auditaron; lavictoria.cl siguió bloqueado por Cloudflare. Para un agente esto significa acceso intermitente.
- **Muestra:** cada puntaje de ficha se basa en **una** ficha de producto por sitio (tomada del medio del sitemap de productos); otras fichas del mismo sitio pueden diferir (p. ej. el stock en WooCommerce solo se muestra si el producto gestiona inventario).

## Promedios por plataforma

Promedio de cada puntaje (0-2) sobre los sitios con valor; `n` = sitios con dato. La plataforma es la detectada por huellas en el HTML (no la del directorio).

### Por plataforma detectada

| Grupo | Sitios | Datos estructurados | Rastreadores IA | Precio visible | Total (0-6) |
|---|---|---|---|---|---|
| WooCommerce | 18 | 1.29 (n=17) | 1.94 (n=18) | 1.24 (n=17) | 4.47 (n=17) |
| Shopify | 14 | 2.00 (n=14) | 1.93 (n=14) | 1.29 (n=14) | 5.21 (n=14) |
| (no identificada o no legible) | 4 | 2.00 (n=1) | 2.00 (n=1) | 2.00 (n=1) | 6.00 (n=1) |
| PrestaShop | 3 | 2.00 (n=3) | 2.00 (n=3) | 1.67 (n=3) | 5.67 (n=3) |

### Por grupo del directorio

| Grupo | Sitios | Datos estructurados | Rastreadores IA | Precio visible | Total (0-6) |
|---|---|---|---|---|---|
| objetivo (WooCommerce según directorio) | 20 | 1.29 (n=17) | 1.94 (n=18) | 1.24 (n=17) | 4.47 (n=17) |
| control (Shopify según directorio) | 13 | 2.00 (n=13) | 2.00 (n=13) | 1.23 (n=13) | 5.23 (n=13) |
| por verificar | 6 | 2.00 (n=5) | 1.80 (n=5) | 1.80 (n=5) | 5.60 (n=5) |

## Plataforma: directorio vs. detectada

Coinciden con el directorio: 31 sitios. Diferencias o casos a verificar:

- lavictoria.cl: directorio WooCommerce, no verificable (sitio no legible)
- ama.pet: directorio WooCommerce, no verificable (sitio no legible)
- bestforpets.cl (por verificar): PrestaShop
- pethome.cl (por verificar): Shopify
- felinus.cl (por verificar): PrestaShop
- puntomascotas.cl (por verificar): PrestaShop
- tiendapet.cl (por verificar): no identificada
- centralvet.cl (por verificar): no identificada

## Sitios que no se pudieron revisar

- **lavictoria.cl** — portada responde HTTP 403; portada devuelve desafío anti-bot (Cloudflare) que exige JavaScript; no se pudo leer el sitio sin ejecutar JS; robots.txt no legible (HTTP 403, None); no se encontró sitemap legible (https://lavictoria.cl/sitemap.xml -> 403)
- **ama.pet** — portada responde HTTP 503; el sitio muestra una página de mantenimiento; robots.txt no legible (HTTP 503, None); no se encontró sitemap legible (https://ama.pet/sitemap.xml -> 503)
- **centralvet.cl** — portada no responde (el proxy no pudo conectar: 502); DNS SERVFAIL: Name servers refused query (lame delegation?) [201.238.248.151, 201.238.248.149].

## Revisión parcial (alguna celda vacía)

- **superbarf.cl** — sin productos_aprox, medios_de_pago. el sitemap lista 18 URLs pero ninguna de producto (solo páginas/categorías/entradas); productos_aprox no determinado; ficha tomada de enlaces de la portada (no del sitemap); no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **gourpet.cl** — sin productos_aprox, medios_de_pago. no se encontró sitemap legible (https://www.gourpet.cl/sitemap.xml -> 404); ficha tomada de la página de tienda /shop/; no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **colapeluda.com** — sin datos_estructurados, precio_visible, productos_aprox, medios_de_pago. el sitemap lista 20 URLs pero ninguna de producto (solo páginas/categorías/entradas); productos_aprox no determinado; la página de tienda /tienda/ no lista productos; no se encontró ficha de producto para revisar; datos_estructurados y precio_visible sin evaluar; no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **vetfarma.cl** — sin medios_de_pago. no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **socomed.cl** — sin medios_de_pago. no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **bodegadelamascota.cl** — sin medios_de_pago. no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **aricapetshop.cl** — sin medios_de_pago. no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **befoods.cl** — sin medios_de_pago. portada redirige a https://www.befoods.cl/collections/; no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **erapetfood.cl** — sin medios_de_pago. sitemap con versiones por idioma; se deduplicaron 21 URLs; no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
- **bestforpets.cl** — sin productos_aprox. portada redirige a https://bestforpets.cl/tienda/; el sitemap declarado en robots.txt no es XML válido; se probaron rutas estándar; no se encontró sitemap legible (https://bestforpets.cl/1_index_sitemap.xml -> 404); ficha tomada de enlaces de la portada (no del sitemap)
- **felinus.cl** — sin productos_aprox. no se encontró sitemap legible (https://felinus.cl/sitemap.xml -> 404); ficha tomada de enlaces de la portada (no del sitemap)
- **tiendapet.cl** — sin plataforma, medios_de_pago. redirige a www.superzoo.cl; plataforma no identificada por huellas; no se mencionan medios de pago en portada/ficha/página de pagos (pueden aparecer solo en el checkout)
