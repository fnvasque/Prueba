#!/usr/bin/env python3
"""Auditoría de legibilidad para agentes de IA de tiendas online de mascotas (Chile).

Solo lectura de páginas públicas (GET). No envía formularios, no crea cuentas,
no agrega al carro. Máximo 1 solicitud por segundo por host, User-Agent de
navegador. Las respuestas se guardan en caché (CACHE_DIR) para poder repetir el
análisis sin volver a consultar los sitios.

Uso:  python3 auditar.py [--cache DIR] [--out auditoria.csv]
                         [--evidence evidencia.json] [--offline] [dominio ...]
      --offline reutiliza solo la caché (no hace solicitudes nuevas).
"""
import argparse
import csv
import gzip
import hashlib
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
}
MIN_INTERVAL = 1.1  # segundos entre solicitudes al mismo host
TIMEOUT = 25
MAX_SITEMAPS = 40

AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot",
           "PerplexityBot", "Google-Extended", "CCBot"]

DOMINIOS = {
    "objetivo (WooCommerce según directorio)": [
        "fullerton.cl", "happymascota.cl", "lospatiperrosconcepcion.cl",
        "petshopmg.cl", "puranatura.pet", "animal-lovers.cl", "superbarf.cl",
        "bigotesblancos.cl", "mustafapets.cl", "familiapet.cl", "gourpet.cl",
        "lavictoria.cl", "barfood.cl", "elquipetfood.cl", "colapeluda.com",
        "huellasfood.cl", "vetfarma.cl", "socomed.cl", "arenasdelmundo.cl",
        "ama.pet"],
    "control (Shopify según directorio)": [
        "petvet.cl", "bpets.cl", "pyk.cl", "bodegadelamascota.cl",
        "mascotaexpress.cl", "thedogs.cl", "aricapetshop.cl",
        "makondopets.com", "lefov.cl", "loonawell.com", "befoods.cl",
        "smileforpets.cl", "erapetfood.cl"],
    "por verificar": [
        "bestforpets.cl", "pethome.cl", "felinus.cl", "puntomascotas.cl",
        "tiendapet.cl", "centralvet.cl"],
}


# --------------------------------------------------------------------------
# HTTP con caché y límite por host
# --------------------------------------------------------------------------
class Fetcher:
    def __init__(self, cache_dir, offline=False):
        self.cache_dir = cache_dir
        self.offline = offline
        os.makedirs(cache_dir, exist_ok=True)
        self._last = {}
        self._locks = {}
        self._glock = threading.Lock()
        self.session_local = threading.local()

    def _session(self):
        s = getattr(self.session_local, "s", None)
        if s is None:
            s = requests.Session()
            s.headers.update(HEADERS)
            self.session_local.s = s
        return s

    def _host_lock(self, host):
        with self._glock:
            return self._locks.setdefault(host, threading.Lock())

    def _wait(self, host):
        # registra el instante de cada solicitud (incluye redirecciones)
        lock = self._host_lock(host)
        with lock:
            last = self._last.get(host, 0)
            delta = time.time() - last
            if delta < MIN_INTERVAL:
                time.sleep(MIN_INTERVAL - delta)
            self._last[host] = time.time()

    def _path(self, url):
        return os.path.join(self.cache_dir,
                            hashlib.sha1(url.encode()).hexdigest() + ".json.gz")

    def get(self, url, max_bytes=15_000_000):
        p = self._path(url)
        if os.path.exists(p):
            with gzip.open(p, "rt", encoding="utf-8") as f:
                return json.load(f)
        if self.offline:
            return {"url": url, "status": None, "error": "no está en caché",
                    "final_url": None, "history": [], "text": "", "headers": {}}
        res = {"url": url, "status": None, "error": None, "final_url": None,
               "history": [], "text": "", "headers": {}}
        s = self._session()
        cur = url
        try:
            # redirecciones manuales para respetar el límite por host
            for _ in range(8):
                host = urlparse(cur).netloc.lower()
                self._wait(host)
                r = s.get(cur, timeout=TIMEOUT, allow_redirects=False,
                          stream=True)
                if r.status_code in (301, 302, 303, 307, 308) and \
                        r.headers.get("Location"):
                    nxt = urljoin(cur, r.headers["Location"])
                    res["history"].append([r.status_code, cur, nxt])
                    r.close()
                    cur = nxt
                    continue
                content = b""
                for chunk in r.iter_content(65536):
                    content += chunk
                    if len(content) > max_bytes:
                        break
                r._content = content
                res["status"] = r.status_code
                res["final_url"] = cur
                res["headers"] = {k.lower(): v for k, v in r.headers.items()}
                enc = r.encoding
                if not enc or enc.lower() == "iso-8859-1":
                    enc = r.apparent_encoding if "html" in \
                        res["headers"].get("content-type", "") else "utf-8"
                try:
                    res["text"] = content.decode(enc or "utf-8", errors="replace")
                except LookupError:
                    res["text"] = content.decode("utf-8", errors="replace")
                break
            else:
                res["error"] = "demasiadas redirecciones"
        except requests.RequestException as e:
            res["error"] = f"{type(e).__name__}: {str(e)[:200]}"
        res["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        with gzip.open(p, "wt", encoding="utf-8") as f:
            json.dump(res, f)
        return res


# --------------------------------------------------------------------------
# Plataforma
# --------------------------------------------------------------------------
PLATFORM_SIGNS = [
    ("Shopify", [r"cdn\.shopify\.com", r"Shopify\.theme", r"myshopify\.com",
                 r"shopify-section"]),
    ("WooCommerce", [r"wp-content/plugins/woocommerce", r"woocommerce-",
                     r"wc-block", r"wc_add_to_cart", r"class=\"[^\"]*woocommerce"]),
    ("Jumpseller", [r"jumpseller", r"assets\.jumpseller\.com"]),
    ("PrestaShop", [r"prestashop", r"/modules/ps_", r"var prestashop"]),
    ("VTEX", [r"vtex", r"vteximg", r"vtexassets"]),
    ("Tiendanube", [r"tiendanube", r"nuvemshop", r"d26lpennugtm8s\.cloudfront\.net",
                    r"mitiendanube"]),
    ("Magento", [r"Magento_", r"mage/cookies", r"data-mage-init"]),
    ("Wix", [r"static\.wixstatic\.com", r"wix\.com", r"X-Wix"]),
    ("Squarespace", [r"squarespace\.com", r"static1\.squarespace"]),
    ("Bsale", [r"bsale\.cl", r"bsalecdn", r"dojiw2m9tvv09\.cloudfront\.net"]),
    ("Bootic", [r"bootic\.net", r"bootic\.io"]),
    ("BigCommerce", [r"bigcommerce\.com", r"cdn11\.bigcommerce"]),
    ("Ecwid", [r"ecwid\.com", r"app\.ecwid"]),
]


def detect_platform(html, headers):
    hits = {}
    blob = html + "\n" + json.dumps(headers)
    for name, pats in PLATFORM_SIGNS:
        n = sum(1 for p in pats if re.search(p, blob, re.I))
        if n:
            hits[name] = n
    # cabeceras características
    hl = {k.lower(): v for k, v in headers.items()}
    if any(k.startswith("x-shopify") for k in hl) or "x-shopid" in hl:
        hits["Shopify"] = hits.get("Shopify", 0) + 3
    if "x-vtex" in " ".join(hl) or "vtex" in hl.get("server", "").lower():
        hits["VTEX"] = hits.get("VTEX", 0) + 3
    if "x-wix-request-id" in hl:
        hits["Wix"] = hits.get("Wix", 0) + 3
    # WooCommerce requiere WordPress + huellas de Woo; "wp-content" solo = WordPress
    wordpress = bool(re.search(r"wp-content|wp-includes|wp-json", html))
    if "WooCommerce" in hits and not wordpress:
        hits["WooCommerce"] -= 1
        if hits["WooCommerce"] <= 0:
            del hits["WooCommerce"]
    if "Jumpseller" in hits and hits["Jumpseller"] == 1 and \
            not re.search(r"assets\.jumpseller|jumpseller\.com/", html, re.I):
        # una mención aislada (p.ej. un enlace) no basta si hay otra plataforma
        if len(hits) > 1:
            del hits["Jumpseller"]
    if not hits:
        if wordpress:
            return "WordPress (sin WooCommerce detectado)", ["wp-content"]
        return "", []
    best = max(hits.items(), key=lambda kv: kv[1])[0]
    return best, sorted(hits)


# --------------------------------------------------------------------------
# robots.txt
# --------------------------------------------------------------------------
def parse_robots(text):
    """Devuelve lista de grupos [(set(agentes), [(directiva, valor)])] y sitemaps."""
    groups, sitemaps = [], []
    cur_agents, cur_rules, last_was_agent = [], [], False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip().lower(), v.strip()
        if k == "sitemap":
            sitemaps.append(v)
            continue
        if k == "user-agent":
            if not last_was_agent and cur_agents:
                groups.append((cur_agents, cur_rules))
                cur_agents, cur_rules = [], []
            cur_agents.append(v.lower())
            last_was_agent = True
        elif k in ("allow", "disallow"):
            if cur_agents:
                cur_rules.append((k, v))
            last_was_agent = False
        else:
            last_was_agent = False
    if cur_agents:
        groups.append((cur_agents, cur_rules))
    return groups, sitemaps


def _rule_match(pattern, path):
    if pattern == "":
        return -1
    rx = re.escape(pattern).replace(r"\*", ".*")
    if rx.endswith(r"\$"):
        rx = rx[:-2] + "$"
    return len(pattern) if re.match(rx, path) else -1


def robots_allows(groups, agent, path="/"):
    a = agent.lower()
    specific = [g for g in groups if a in g[0]]
    chosen = specific or [g for g in groups if "*" in g[0]]
    if not chosen:
        return True, "sin grupo aplicable"
    rules = [r for g in chosen for r in g[1]]
    best, verdict = -1, True
    for k, v in rules:
        m = _rule_match(v, path)
        if m > best or (m == best and m >= 0 and k == "allow"):
            best, verdict = m, (k == "allow")
    src = "grupo propio" if specific else "grupo *"
    return verdict, src


# --------------------------------------------------------------------------
# Sitemaps
# --------------------------------------------------------------------------
LOC_RX = re.compile(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)", re.I)
PRODUCT_SITEMAP_RX = re.compile(r"product|producto", re.I)
TAXONOMY_SM_RX = re.compile(r"cat|tag|brand|marca|attribute|categor|pa_|vendor|collection", re.I)
LOCALE_PATH_RX = re.compile(r"^/[a-z]{2}(?:-[a-z]{2})?(?=/|$)", re.I)


def is_product_sitemap(u):
    p = urlparse(u)
    name = p.path.rsplit("/", 1)[-1] + "?" + p.query
    return bool(PRODUCT_SITEMAP_RX.search(name)) and not TAXONOMY_SM_RX.search(name)
PRODUCT_URL_RX = re.compile(
    r"/(product|producto|products|productos)/[^/?#]+|/p/?$|/p\?|"
    r"/\d+-[^/]+\.html$|/\d+(?:_m)?\.html$", re.I)
# enlaces de producto en HTML (portada / página de tienda)
LINK_PRODUCT_RX = re.compile(PRODUCT_URL_RX.pattern + r"|^/[^/]+/[^/]+\.html$", re.I)
NOT_PRODUCT_LINK_RX = re.compile(r"^/(info|content|cms|module|blog|categoria|category)/", re.I)


def parse_sitemap(xml):
    is_index = bool(re.search(r"<sitemapindex", xml, re.I))
    locs = [l.replace("&amp;", "&") for l in LOC_RX.findall(xml)]
    return is_index, locs


# --------------------------------------------------------------------------
# Datos estructurados
# --------------------------------------------------------------------------
def _iter_nodes(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _iter_nodes(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _iter_nodes(v)


def _types(node):
    t = node.get("@type")
    if isinstance(t, str):
        return [t]
    if isinstance(t, list):
        return [x for x in t if isinstance(x, str)]
    return []


def _has_price(offer):
    for n in _iter_nodes(offer):
        for k in ("price", "lowPrice", "highPrice"):
            if k in n and str(n[k]).strip() not in ("", "None", "null"):
                return True
    return False


def _has_avail(offer):
    for n in _iter_nodes(offer):
        if "availability" in n and str(n["availability"]).strip():
            return True
    return False


def jsonld_products(soup):
    prods, errors = [], 0
    for tag in soup.find_all("script", type=re.compile(r"ld\+json", re.I)):
        raw = tag.string or tag.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            try:
                data = json.loads(re.sub(r"[\x00-\x1f]", " ", raw))
            except Exception:
                errors += 1
                continue
        for n in _iter_nodes(data):
            if any(t in ("Product", "ProductGroup", "IndividualProduct")
                   for t in _types(n)):
                prods.append(n)
    return prods, errors


def microdata_product(soup):
    items = soup.find_all(attrs={"itemtype": re.compile(r"schema\.org/(Product|IndividualProduct)\b", re.I)})
    if not items:
        return None
    price = avail = False
    for it in items:
        for p in it.find_all(attrs={"itemprop": re.compile(r"\b(price|lowPrice)\b")}):
            val = p.get("content") or p.get_text(strip=True)
            if val and re.search(r"\d", val):
                price = True
        if it.find(attrs={"itemprop": re.compile(r"\bavailability\b")}):
            avail = True
    return {"price": price, "availability": avail}


def score_structured(soup):
    prods, errors = jsonld_products(soup)
    md = microdata_product(soup)
    ev = []
    best = 0
    if prods:
        price = any(_has_price(p.get("offers", {})) or
                    any(_has_price(v.get("offers", {})) for v in
                        (p.get("hasVariant") or []) if isinstance(v, dict))
                    for p in prods)
        avail = any(_has_avail(p.get("offers", {})) or
                    any(_has_avail(v.get("offers", {})) for v in
                        (p.get("hasVariant") or []) if isinstance(v, dict))
                    for p in prods)
        ev.append(f"JSON-LD Product (precio={'sí' if price else 'no'}, "
                  f"disponibilidad={'sí' if avail else 'no'})")
        best = max(best, 2 if (price and avail) else 1)
    if md is not None:
        ev.append(f"microdatos Product (precio={'sí' if md['price'] else 'no'}, "
                  f"disponibilidad={'sí' if md['availability'] else 'no'})")
        best = max(best, 2 if (md["price"] and md["availability"]) else 1)
    if errors:
        ev.append(f"{errors} bloque(s) JSON-LD inválido(s)")
    return best, ev


# --------------------------------------------------------------------------
# Precio y stock visibles en HTML sin JS
# --------------------------------------------------------------------------
PRICE_RX = re.compile(
    r"(?:US\$|\$|CLP)\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])")
# frases de stock inequívocas (válidas dentro de texto largo)
STOCK_STRONG_RX = re.compile(
    r"\b(hay existencias|en existencia|existencias|en stock|sin stock|stock disponible|"
    r"stock\s*:\s*\d+|stock\s*:\s*\w+|\d+\s*(?:en stock|disponibles|unidades disponibles)|"
    r"agotad[oa]s?|fuera de stock|disponibilidad\s*:\s*[\w ]{2,20}|in stock|out of stock|"
    r"sold out|últimas? unidades?|solo quedan? \d+[\w ]{0,12}|quedan \d+[\w ]{0,12})", re.I)
# texto corto de un elemento que por sí solo informa disponibilidad
STOCK_SHORT_RX = re.compile(r"^\W*(disponible|no disponible|agotado|disponibilidad[: ].{0,30}|"
                            r"\d+ disponibles?)\W*$", re.I)
RELATED_SEL = ("ul.products, .related, .upsells, .cross-sells, [class*='related'], "
               "[class*='recommend'], [class*='upsell'], [class*='recently'], "
               "product-recommendations, .cart-drawer, #cart-drawer, cart-drawer, "
               ".mini-cart, .widget_shopping_cart, [class*='minicart'], [class*='mini-cart']")
ANCHOR_SEL = [
    "div.type-product:not(li)", "[data-elementor-type='product']",
    "form.cart", "form[action*='/cart/add']", "product-form",
    "[itemtype*='schema.org/Product']", "#add-to-cart-or-refresh",
    "[class*='add-to-cart']", "[class*='addtocart']", "[class*='product-detail']",
    "[class*='product__info']", "[class*='product-info']", "main",
]


def visible_soup(html):
    s = BeautifulSoup(html, "lxml")
    for t in s(["script", "style", "template", "svg", "head"]):
        t.decompose()
    for t in s.find_all(["header", "footer", "nav", "aside"]):
        if t.attrs is None or t.decomposed:
            continue
        # <header> dentro de <main>/<article> suele ser la cabecera de la ficha
        if t.find_parent(["main", "article"]) is not None or \
                t.find(attrs={"itemprop": "price"}) is not None:
            continue
        t.decompose()
    for t in s.select(RELATED_SEL):
        if t.attrs is None or t.decomposed:
            continue
        cls = t.get("class") or []
        # el contenedor principal de WooCommerce lleva clases como
        # "wc-related-upsell-columns-4": no es una sección de relacionados
        if "type-product" in cls and t.name != "li":
            continue
        t.decompose()
    # textos de plantilla que el tema muestra/oculta por CSS según la variante
    # (p.ej. Dawn de Shopify): no informan stock real
    for t in s.select(".label-unavailable"):
        t.decompose()
    for t in s.select("[class*='badge-sold-out'], [class*='badge--sold-out']"):
        if t.attrs is None or t.decomposed:
            continue
        if not any("sold-out" in " ".join(a.get("class") or []) and a is not t
                   and "price--sold-out" in " ".join(a.get("class") or [])
                   for a in t.parents):
            t.decompose()
    return s


def _prices(text):
    return [m.group(0) for m in PRICE_RX.finditer(text)
            if re.sub(r"\D", "", m.group(1)).strip("0")]


def _stock(area):
    found = []
    for el in area.select(".stock, .in-stock, .out-of-stock, [class*='inventory'], "
                          "[class*='availability'], [class*='disponib'], [class*='stock']"):
        t = el.get_text(" ", strip=True)
        if t and len(t) < 80 and (STOCK_STRONG_RX.search(t) or STOCK_SHORT_RX.search(t)):
            found.append(t)
    text = re.sub(r"\s+", " ", area.get_text(" ", strip=True))
    found += [m.group(0) for m in STOCK_STRONG_RX.finditer(text)]
    for el in area.find_all(string=True):
        t = el.strip()
        if t and STOCK_SHORT_RX.search(t):
            found.append(t)
    return list(dict.fromkeys(found))


NEGATIVE_STOCK_RX = re.compile(r"agotad|sin stock|sin existencias|fuera de stock|"
                               r"no disponible|sold out|out of stock", re.I)


def page_availability(html):
    vals = re.findall(r"schema\.org\\?/(InStock|OutOfStock|PreOrder|BackOrder|"
                      r"LimitedAvailability|SoldOut|Discontinued|InStoreOnly|OnlineOnly)", html)
    return set(vals)


def score_visible(html):
    avail = page_availability(html)
    vs = visible_soup(html)
    anchor, sel = None, None
    for cand in ANCHOR_SEL:
        try:
            anchor = vs.select_one(cand)
        except Exception:
            anchor = None
        if anchor is not None:
            sel = cand
            break
    if anchor is None:
        anchor, sel = (vs.body or vs), "body"
    area, lvl = anchor, 0
    # sube desde el ancla hasta encontrar un precio (máx. 6 niveles)
    while not _prices(area.get_text(" ", strip=True)) and area.parent is not None \
            and area.name not in ("body", "[document]") and lvl < 6:
        area, lvl = area.parent, lvl + 1
    text = re.sub(r"\s+", " ", area.get_text(" ", strip=True))
    prices = _prices(text)
    marked = []
    if True:
        # precio marcado como tal (itemprop o clase), con o sin símbolo "$";
        # se listan primero porque son el precio del producto y no otros
        # montos (ahorro, umbral de despacho gratis, cuotas)
        for el in area.find_all(True):
            if el.attrs is None:
                continue
            cls = " ".join(el.get("class") or [])
            if el.get("itemprop") == "price" or re.search(r"(^|[\s_-])(current-|sale-|regular-)?price($|[\s_-])", cls, re.I):
                t = el.get_text(" ", strip=True)
                m = re.fullmatch(r"(?:\$|CLP)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,})\s*(?:CLP)?", t)
                if m and m.group(1).strip("0"):
                    marked.append(t if "$" in t else t + " (sin símbolo $)")
        prices = list(dict.fromkeys(marked + prices))
    # stock: en la zona del precio o un nivel más arriba
    stock = _stock(area)
    if not stock and area.parent is not None and area.name not in ("body",):
        stock = _stock(area.parent)
    if avail and avail <= {"InStock", "OnlineOnly", "LimitedAvailability"}:
        # el producto está disponible según los datos estructurados: un
        # "agotado" en el HTML es texto de plantilla, no información de stock
        dropped = [x for x in stock if NEGATIVE_STOCK_RX.search(x)]
        stock = [x for x in stock if not NEGATIVE_STOCK_RX.search(x)]
    else:
        dropped = []
    # "Disponibilidad: 24 horas hábiles" es plazo de despacho, no stock
    stock = [x for x in stock if not re.search(r"hábiles|horas|días|despacho", x, re.I)
             and not re.fullmatch(r"disponibilidad\s*:?", x.strip(), re.I)]
    score = 2 if (prices and stock) else (1 if prices else 0)
    ev = {"zona": f"{sel} (+{lvl} niveles)", "precios": prices[:3], "stock": stock[:3],
          "disponibilidad_datos": sorted(avail), "descartado_plantilla": dropped[:3]}
    return score, ev


# --------------------------------------------------------------------------
# Medios de pago
# --------------------------------------------------------------------------
PAY_PATTERNS = [
    ("Webpay/Transbank", r"webpay|transbank|onepay|\bweb pay\b"),
    ("Mercado Pago", r"mercado\s?pago|mercado-pago|mercadopago"),
    ("Flow", r"\bflow\.cl\b|(?:pagos?\s+)?(?:con|v[ií]a|por)\s+flow\b|"
             r"\bflow\s*(?:pagos?|payment|webpay)\b|[/_-]flow[-_.](?:png|svg|jpe?g|webp|logo)|"
             r"alt=\"flow\b|>\s*flow\s*<|woocommerce[-_]flow|flow[-_]?(?:gateway|checkout)"),
    ("Khipu", r"khipu"),
    ("Getnet", r"getnet"),
    ("Fintoc", r"fintoc"),
    ("Transferencia", r"transferencia(?:s)?\s*(?:bancaria|electr[oó]nica)?|dep[oó]sito bancario"),
    ("PayPal", r"paypal"),
    ("MACH", r"pago con mach\b|\bmachbank\b|somosmach|\bmach pay\b|>\s*mach\s*<|alt=\"mach\b"),
    ("Servipag", r"servipag"),
    ("Kushki", r"kushki"),
    ("Payku", r"payku"),
    ("Etpay", r"\betpay\b"),
    ("Klap", r"\bklap\b"),
    ("Venti", r"\bventipay\b|venti\.cl"),
    ("Mercado Crédito", r"mercado\s?cr[eé]dito"),
    ("Compraqui", r"compraqui"),
    ("Tenpo", r"\btenpo\b"),
    ("SweetPay", r"sweet\s?pay"),
    ("Shop Pay", r"\bshop\s?pay\b"),
    ("Google Pay", r"\bgoogle\s?pay\b"),
    ("Apple Pay", r"\bapple\s?pay\b"),
]
PAY_LINK_RX = re.compile(r"(medios?|formas?|m[eé]todos?)[-_ ]de[-_ ]pago|pagos?-y-envios|"
                         r"como-comprar|c[oó]mo comprar", re.I)


def payment_corpus(html):
    """Texto visible + alt/title/src/href/aria-label + <title> de SVG + URLs de
    scripts/estilos externos (p.ej. plugins de pago). Excluye scripts inline,
    que en Shopify mencionan PayPal aunque la tienda no lo ofrezca."""
    s = BeautifulSoup(html, "lxml")
    parts = []
    for t in s.find_all(["script", "link"]):
        src = t.get("src") or t.get("href") or ""
        if src:
            parts.append(src)
    for t in s(["script", "style", "template", "noscript"]):
        t.decompose()
    parts.append(s.get_text(" "))
    for t in s.find_all(True):
        for a in ("alt", "title", "src", "data-src", "href", "aria-label", "class", "id"):
            v = t.get(a)
            if v:
                parts.append(" ".join(v) if isinstance(v, list) else str(v))
    return "\n".join(parts)


def find_payments(htmls):
    corpus = [payment_corpus(h) for h in htmls]
    found = []
    for name, rx in PAY_PATTERNS:
        if any(re.search(rx, c, re.I) for c in corpus):
            found.append(name)
    return found


# --------------------------------------------------------------------------
# Auditoría por dominio
# --------------------------------------------------------------------------
STORE_HINT_RX = re.compile(r"add[-_]to[-_]cart|agregar al carr|añadir al carr|"
                           r"/cart|carrito|/products/|/producto/|/product/", re.I)
PARKED_RX = re.compile(r"domain (is )?for sale|dominio (está )?en venta|"
                       r"parked|this domain|sitio en construcci[oó]n|"
                       r"under construction|coming soon|pr[oó]ximamente|"
                       r"account suspended|cuenta suspendida", re.I)
CHALLENGE_RX = re.compile(r"cf-chl|challenge-platform|Just a moment|<title>Un momento|"
                          r"sgcaptcha|cortafuegos de spam|"
                          r"Attention Required|captcha|sgcaptcha|"
                          r"Checking your browser|_Incapsula_", re.I)


def dns_status(domain):
    """Consulta DNS pública (DNS-over-HTTPS) para explicar una falla de conexión."""
    try:
        r = requests.get("https://dns.google/resolve",
                         params={"name": domain, "type": "A"}, timeout=15)
        j = r.json()
    except Exception as e:  # noqa: BLE001
        return f"no se pudo consultar DNS ({type(e).__name__})"
    st = j.get("Status")
    if st == 0 and j.get("Answer"):
        return "DNS resuelve (" + ", ".join(a.get("data", "") for a in j["Answer"][:3]) + \
            "); el servidor no acepta conexiones"
    names = {2: "SERVFAIL", 3: "NXDOMAIN (no existe)"}
    extra = j.get("Comment", "")
    return f"DNS {names.get(st, st)}" + (f": {extra[:120]}" if extra else "")


def same_site(u, base_host):
    h = urlparse(u).netloc.lower().removeprefix("www.")
    return h == base_host.removeprefix("www.")


def audit(domain, F, log):
    row = {"dominio": domain, "activo": "", "plataforma": "",
           "datos_estructurados": "", "rastreadores_ia": "",
           "precio_visible": "", "medios_de_pago": "", "productos_aprox": "",
           "url_producto_revisada": "", "notas": ""}
    notes, ev = [], {"dominio": domain}

    # 1. portada --------------------------------------------------------
    home = F.get(f"https://{domain}/")
    if home["error"] and not home["status"]:
        alt = F.get(f"http://{domain}/")
        if alt["status"]:
            notes.append(f"HTTPS falló ({home['error'][:80]}); se usó HTTP")
            home = alt
    ev["fecha"] = home.get("fetched_at")
    ev["portada"] = {"status": home["status"], "final_url": home["final_url"],
                     "redirecciones": home["history"], "error": home["error"]}
    if not home["status"]:
        row["activo"] = "no"
        err = home["error"] or ""
        if "502" in err or "resolve" in err.lower() or "Name or service" in err:
            notes.append("portada no responde (el proxy no pudo conectar: 502)")
            dns = dns_status(domain)
            if dns:
                notes.append(dns)
        else:
            notes.append(f"portada no responde: {err[:160]}")
        row["notas"] = "; ".join(notes)
        return row, ev
    final = home["final_url"]
    base = f"{urlparse(final).scheme}://{urlparse(final).netloc}"
    base_host = urlparse(final).netloc.lower()
    if home["history"]:
        if not same_site(final, domain):
            notes.append(f"redirige a {base_host}")
        elif urlparse(final).path not in ("", "/"):
            notes.append(f"portada redirige a {final}")
    html = home["text"]
    hdrs = home["headers"]
    if home["status"] != 200:
        notes.append(f"portada responde HTTP {home['status']}")
        if re.search(r"volvemos pronto|realizando mejoras|mantenci[oó]n|mantenimiento|"
                     r"maintenance", html, re.I):
            notes.append("el sitio muestra una página de mantenimiento")
    platform, plat_hits = detect_platform(html, hdrs)
    row["plataforma"] = platform
    ev["plataforma_huellas"] = plat_hits
    is_store = bool(platform and "sin WooCommerce" not in platform) or \
        bool(STORE_HINT_RX.search(html))
    challenged = bool(CHALLENGE_RX.search(html[:20000])) and len(html) < 60000
    if challenged:
        kind = ("SiteGround" if "Un momento" in html else
                "Cloudflare" if ("cloudflare" in html.lower() or "cf-" in json.dumps(hdrs)) else "WAF")
        notes.append(f"portada devuelve desafío anti-bot ({kind}) que exige JavaScript; "
                     "no se pudo leer el sitio sin ejecutar JS")
        row["activo"] = ""
        row["plataforma"] = ""
    elif home["status"] == 200:
        if PARKED_RX.search(BeautifulSoup(html, "lxml").get_text(" ")[:3000]) and not is_store:
            row["activo"] = "no"
            notes.append("portada 200 pero parece dominio estacionado/en construcción")
        elif is_store:
            row["activo"] = "sí"
        else:
            row["activo"] = "no"
            notes.append("portada 200 pero no se detectan señales de tienda")
    else:
        row["activo"] = "no"
    if challenged:
        pass
    elif not platform and home["status"] == 200:
        notes.append("plataforma no identificada por huellas")

    # 2. robots.txt -----------------------------------------------------
    rob = F.get(f"{base}/robots.txt")
    ev["robots"] = {"status": rob["status"], "error": rob["error"]}
    robots_sitemaps, robots_groups = [], None
    if rob["status"] == 200 and not re.search(r"<html|<!doctype", rob["text"][:500], re.I):
        groups, robots_sitemaps = parse_robots(rob["text"])
        robots_groups = groups
    elif rob["status"] == 200 and CHALLENGE_RX.search(rob["text"][:20000]):
        notes.append("robots.txt no legible: responde con la página de desafío anti-bot")
    elif rob["status"] in (404, 410) or rob["status"] == 200:
        row["rastreadores_ia"] = 2
        notes.append("sin robots.txt (HTTP %s): no hay bloqueos declarados" % rob["status"]
                     if rob["status"] != 200 else
                     "robots.txt devuelve HTML, no un archivo válido: sin bloqueos declarados")
    else:
        notes.append(f"robots.txt no legible (HTTP {rob['status']}, {rob['error']})")

    # 3. sitemap -> URLs de producto -------------------------------------
    queue = [u for u in robots_sitemaps if same_site(u, base_host)]
    ext = [u for u in robots_sitemaps if not same_site(u, base_host)]
    if ext:
        # algunos sitemaps se alojan en otro host (p.ej. CDN); se incluyen
        queue += ext
    defaults = [f"{base}/sitemap.xml", f"{base}/sitemap_index.xml",
                f"{base}/wp-sitemap.xml"]
    if not queue:
        queue = defaults[:]
    tried_defaults = not robots_sitemaps
    seen, product_urls, other_urls = set(), [], []
    fetched_sm, sm_errors = 0, []
    product_sm_used = False
    while fetched_sm < MAX_SITEMAPS:
        if not queue:
            if product_urls or other_urls or tried_defaults:
                break
            # los sitemaps declarados en robots.txt no sirvieron: probar rutas estándar
            tried_defaults = True
            queue = [d for d in defaults if d not in seen]
            if not queue:
                break
            notes.append("el sitemap declarado en robots.txt no es XML válido; "
                         "se probaron rutas estándar")
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        r = F.get(sm)
        fetched_sm += 1
        if r["status"] != 200 or "<" not in r["text"][:200]:
            sm_errors.append(f"{sm} -> {r['status'] or r['error']}")
            continue
        is_index, locs = parse_sitemap(r["text"])
        if not locs and not is_index:
            sm_errors.append(f"{sm} -> sin <loc>")
            continue
        if is_index:
            prod_children = [l for l in locs if is_product_sitemap(l)]
            if prod_children:
                product_sm_used = True
                queue = prod_children + queue
            else:
                queue = locs + queue
            # si ya encontramos índice con hijos, no probar más rutas por defecto
            queue = [q for q in queue if not q.endswith(("/sitemap_index.xml", "/wp-sitemap.xml"))
                     or q in locs]
        else:
            in_prod_sm = is_product_sitemap(sm)
            for l in locs:
                if in_prod_sm or PRODUCT_URL_RX.search(urlparse(l).path):
                    product_urls.append(l)
                else:
                    other_urls.append(l)
            if in_prod_sm:
                product_sm_used = True
            # con un sitemap válido ya no hace falta probar alternativas
            queue = [q for q in queue if not q.endswith(("/sitemap_index.xml", "/wp-sitemap.xml"))]
    if queue:
        notes.append(f"sitemap: se leyeron {fetched_sm} archivos (límite); "
                     f"quedaron {len(queue)} sin leer, conteo es mínimo")
    # quita portada/archivo de tienda que algunos plugins incluyen
    # y deduplica versiones por idioma (/es/products/x = /products/x)
    clean, keys, localized = [], set(), 0
    for u in dict.fromkeys(product_urls):
        p = urlparse(u).path.rstrip("/")
        p2 = LOCALE_PATH_RX.sub("", p)
        if p2 in ("", "/tienda", "/shop", "/productos", "/products", "/producto",
                  "/product", "/collections/all"):
            continue
        if p2 != p:
            localized += 1
        if p2 in keys:
            continue
        keys.add(p2)
        clean.append(u)
    # prioriza URLs sin prefijo de idioma para revisar la ficha
    clean.sort(key=lambda u: bool(LOCALE_PATH_RX.match(urlparse(u).path)))
    if localized:
        notes.append(f"sitemap con versiones por idioma; se deduplicaron {localized} URLs")
    ev["sitemap"] = {"leidos": fetched_sm, "errores": sm_errors[:10],
                     "urls_producto": len(clean), "otras_urls": len(other_urls),
                     "sitemap_de_productos": product_sm_used}
    if clean:
        row["productos_aprox"] = len(clean)
    elif other_urls:
        notes.append(f"el sitemap lista {len(other_urls)} URLs pero ninguna de producto "
                     "(solo páginas/categorías/entradas); productos_aprox no determinado")
    elif fetched_sm:
        notes.append("no se encontró sitemap legible" +
                     (f" ({sm_errors[0]})" if sm_errors else ""))

    # 4. ficha de producto ----------------------------------------------
    candidates = clean[:]

    def links_from(page_html, page_url):
        sp = BeautifulSoup(page_html, "lxml")
        out = []
        for a in sp.find_all("a", href=True):
            u = urljoin(page_url, a["href"].split("#")[0])
            path = urlparse(u).path
            if not same_site(u, base_host) or NOT_PRODUCT_LINK_RX.search(path):
                continue
            cls = " ".join(a.get("class") or [])
            if LINK_PRODUCT_RX.search(path) or "LoopProduct-link" in cls or \
                    (a.find_parent("li", class_="product") is not None and
                     "add_to_cart" not in cls and "?" not in u):
                out.append(u)
        return list(dict.fromkeys(out))

    if not candidates and not challenged and home["status"] == 200:
        candidates = links_from(html, final)
        if candidates:
            notes.append("ficha tomada de enlaces de la portada (no del sitemap)")
        else:
            for shop in ("/tienda/", "/shop/", "/collections/all", "/productos/"):
                if shop.rstrip("/") not in html:
                    continue
                r = F.get(base + shop)
                if r["status"] == 200:
                    candidates = links_from(r["text"], r["final_url"])
                    ev["pagina_tienda"] = {"url": r["final_url"], "enlaces_producto": len(candidates)}
                    if candidates:
                        notes.append(f"ficha tomada de la página de tienda {shop}")
                    else:
                        notes.append(f"la página de tienda {shop} no lista productos")
                    break
    # elegir un producto "del medio" del sitemap para evitar el primero (a menudo antiguo)
    if len(candidates) > 4:
        mid = len(candidates) // 2
        candidates = candidates[mid:mid + 3] + candidates[:1]
    prod, prod_html = None, ""
    for u in candidates[:4]:  # noqa
        r = F.get(u)
        if r["status"] == 200 and r["text"]:
            prod, prod_html = r, r["text"]
            break
        notes.append(f"ficha {u} -> HTTP {r['status'] or r['error']}")
    if prod:
        row["url_producto_revisada"] = prod["final_url"]
        psoup = BeautifulSoup(prod_html, "lxml")
        sd, sd_ev = score_structured(psoup)
        row["datos_estructurados"] = sd
        pv, pv_ev = score_visible(prod_html)
        row["precio_visible"] = pv
        ev["ficha"] = {"url": prod["final_url"], "estructurados": sd_ev,
                       "visible": pv_ev}
        cc = set(re.findall(r'"countryCode"\s*:\s*"([A-Z]{2})"', prod_html))
        if cc and "CL" not in cc:
            notes.append("la tienda Shopify declara país " + "/".join(sorted(cc)) +
                         " (posiblemente no es una tienda chilena)")
        cur = set(re.findall(r'"priceCurrency"\s*:\s*"([A-Z]{3})"', prod_html))
        cur |= set(re.findall(r'og:price:currency"\s+content="([A-Z]{3})"', prod_html))
        if cur and cur != {"CLP"}:
            notes.append("ficha con precios en " + "/".join(sorted(cur)))
        if CHALLENGE_RX.search(prod_html[:5000]) and sd == 0 and pv == 0:
            notes.append("ficha parece página de desafío anti-bot")
    elif row["activo"] == "sí":
        notes.append("no se encontró ficha de producto para revisar; "
                     "datos_estructurados y precio_visible sin evaluar")

    # 4b. robots: cada bot se evalúa sobre "/" y sobre la ruta de la ficha
    if robots_groups is not None:
        paths = ["/"]
        if prod:
            pu = urlparse(prod["final_url"])
            paths.append(pu.path + (("?" + pu.query) if pu.query else ""))
        blocked, detail = [], {}
        for b in AI_BOTS:
            res = [(pth,) + robots_allows(robots_groups, b, pth) for pth in paths]
            bad = [pth for pth, ok, _ in res if not ok]
            detail[b] = ("bloqueado en " + ", ".join(bad) if bad else "permitido") + \
                f" ({res[0][2]})"
            if bad:
                blocked.append(b)
        ev["robots"]["bots"] = detail
        if not blocked:
            row["rastreadores_ia"] = 2
        elif len(blocked) == len(AI_BOTS):
            row["rastreadores_ia"] = 0
            notes.append("robots.txt bloquea a todos los bots de IA revisados")
        else:
            row["rastreadores_ia"] = 1
            notes.append("robots.txt bloquea: " + ", ".join(blocked))

    # 5. medios de pago --------------------------------------------------
    if challenged or home["status"] != 200:
        row["notas"] = "; ".join(notes)
        return row, ev
    pay_html = [html, prod_html]
    soup = BeautifulSoup(html, "lxml")
    pay_links = []
    for a in soup.find_all("a", href=True):
        txt = a.get_text(" ", strip=True)
        if PAY_LINK_RX.search(a["href"]) or PAY_LINK_RX.search(txt):
            u = urljoin(final, a["href"].split("#")[0])
            if same_site(u, base_host):
                pay_links.append(u)
    pay_links = list(dict.fromkeys(pay_links))[:2]
    for u in pay_links:
        r = F.get(u)
        if r["status"] == 200:
            pay_html.append(r["text"])
    ev["paginas_pago"] = pay_links
    pays = find_payments([h for h in pay_html if h])
    row["medios_de_pago"] = "; ".join(pays)
    if not pays and row["activo"] == "sí":
        notes.append("no se mencionan medios de pago en portada/ficha/página de pagos "
                     "(pueden aparecer solo en el checkout)")

    row["notas"] = "; ".join(notes)
    return row, ev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="cache")
    ap.add_argument("--out", default="auditoria.csv")
    ap.add_argument("--evidence", default="evidencia.json")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("dominios", nargs="*")
    a = ap.parse_args()
    F = Fetcher(a.cache, offline=a.offline)
    grupos = {d: g for g, ds in DOMINIOS.items() for d in ds}
    doms = a.dominios or list(grupos)
    lock = threading.Lock()

    def log(*x):
        with lock:
            print(*x, file=sys.stderr, flush=True)

    def run(d):
        t = time.time()
        try:
            row, ev = audit(d, F, log)
        except Exception as e:  # no detener la auditoría por un sitio
            row = {"dominio": d, "notas": f"error interno del script: {type(e).__name__}: {e}"}
            ev = {"dominio": d, "error": repr(e)}
        log(f"{d}: {time.time() - t:.0f}s {row.get('plataforma')} "
            f"{row.get('datos_estructurados')}/{row.get('rastreadores_ia')}/"
            f"{row.get('precio_visible')}")
        ev["grupo"] = grupos.get(d, "")
        return row, ev

    with ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(run, doms))
    cols = ["dominio", "activo", "plataforma", "datos_estructurados",
            "rastreadores_ia", "precio_visible", "medios_de_pago",
            "productos_aprox", "url_producto_revisada", "notas"]
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row, _ in results:
            w.writerow({c: row.get(c, "") for c in cols})
    with open(a.evidence, "w", encoding="utf-8") as f:
        json.dump([ev for _, ev in results], f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
