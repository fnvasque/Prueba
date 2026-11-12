#!/usr/bin/env python3
"""Genera resumen.md a partir de auditoria.csv y evidencia.json."""
import csv
import json
import sys
from collections import defaultdict

csv_path = sys.argv[1] if len(sys.argv) > 1 else "auditoria.csv"
ev_path = sys.argv[2] if len(sys.argv) > 2 else "evidencia.json"
out_path = sys.argv[3] if len(sys.argv) > 3 else "resumen.md"

rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
ev = {e["dominio"]: e for e in json.load(open(ev_path, encoding="utf-8"))}
SCORES = ["datos_estructurados", "rastreadores_ia", "precio_visible"]


def avg_table(key_fn, title):
    groups = defaultdict(list)
    for r in rows:
        groups[key_fn(r)].append(r)
    out = [f"### {title}", "",
           "| Grupo | Sitios | Datos estructurados | Rastreadores IA | Precio visible | Total (0-6) |",
           "|---|---|---|---|---|---|"]
    order = sorted(groups, key=lambda k: (-len(groups[k]), k))
    for g in order:
        rs = groups[g]
        cells = []
        complete = [r for r in rs if all(r[s] != "" for s in SCORES)]
        for s in SCORES:
            vals = [int(r[s]) for r in rs if r[s] != ""]
            cells.append(f"{sum(vals) / len(vals):.2f} (n={len(vals)})" if vals else "—")
        tot = [sum(int(r[s]) for s in SCORES) for r in complete]
        cells.append(f"{sum(tot) / len(tot):.2f} (n={len(tot)})" if tot else "—")
        out.append(f"| {g} | {len(rs)} | " + " | ".join(cells) + " |")
    out.append("")
    return out


def dist(score):
    c = defaultdict(int)
    for r in rows:
        if r[score] != "":
            c[r[score]] += 1
    return ", ".join(f"{k}→{c[k]}" for k in ("2", "1", "0"))


lines = ["# Auditoría de legibilidad para agentes de IA — tiendas de mascotas (Chile)", ""]
fecha = min((e.get("fecha") or "") for e in ev.values()) if ev else ""
lines += [
    f"Sitios auditados: **{len(rows)}**. Lectura solo de páginas públicas (GET), sin sesión, "
    "sin ejecutar JavaScript, máx. 1 solicitud/s por host, User-Agent de Chrome. "
    "Detalle por sitio en `auditoria.csv`; evidencia (lo que se encontró en cada página) en "
    "`evidencia.json`; método en `METODO.md`.", ""]

activos = [r for r in rows if r["activo"] == "sí"]
lines += ["## Cifras generales", "",
          f"- Tiendas activas confirmadas: **{len(activos)}** de {len(rows)}.",
          f"- Distribución de puntajes (puntaje→sitios): datos estructurados {dist('datos_estructurados')}; "
          f"rastreadores IA {dist('rastreadores_ia')}; precio visible {dist('precio_visible')}.",
          ""]

sd0 = [r["dominio"] for r in rows if r["datos_estructurados"] == "0"]
blk = [r for r in rows if r["rastreadores_ia"] in ("0", "1")]
pv2 = [r["dominio"] for r in rows if r["precio_visible"] == "2"]
pv_n = sum(1 for r in rows if r["precio_visible"] != "")
lines += ["## Hallazgos principales", "",
          f"- **Datos estructurados:** {len(sd0)} fichas sin ningún schema Product "
          f"({', '.join(sd0)}). Todas son WooCommerce y las seis usan una plantilla de ficha de "
          "Elementor (`data-elementor-type=\"product\"`); causa probable: esa plantilla no ejecuta "
          "el hook que imprime el JSON-LD Product de WooCommerce. Tres tienen JSON-LD de Yoast, "
          "pero sin Product. Ningún sitio quedó con Product parcial (puntaje 1).",
          f"- **Rastreadores IA:** {len(blk)} sitios bloquean bots de IA en robots.txt: " +
          "; ".join(f"{r['dominio']} ({r['notas'].split('bloquea: ')[1].split(';')[0]})"
                    for r in blk if 'bloquea: ' in r['notas']) +
          ". En ambos casos siguen permitidos OAI-SearchBot, ChatGPT-User y PerplexityBot "
          "(los bots de búsqueda/consulta en vivo). Ningún sitio tiene `User-agent: * / Disallow: /`.",
          f"- **Precio y stock sin JavaScript:** el precio aparece en el HTML de las {pv_n} fichas "
          f"revisadas, pero solo {len(pv2)} muestran además stock/disponibilidad en texto "
          f"({', '.join(pv2)}). En el resto un agente que no ejecuta JS ve el precio pero no si hay stock "
          "(salvo que lea el JSON-LD).",
          "- **Bloqueos anti-bot:** en la primera pasada 5 sitios (gourpet, arenasdelmundo, "
          "puntomascotas, bestforpets: desafío JS de SiteGround; barfood: firewall anti-spam) "
          "devolvieron una página de desafío en vez del contenido. Al reintentar ~20 min después "
          "respondieron normal y se auditaron; lavictoria.cl siguió bloqueado por Cloudflare. "
          "Para un agente esto significa acceso intermitente.",
          "- **Muestra:** cada puntaje de ficha se basa en **una** ficha de producto por sitio "
          "(tomada del medio del sitemap de productos); otras fichas del mismo sitio pueden diferir "
          "(p. ej. el stock en WooCommerce solo se muestra si el producto gestiona inventario).",
          ""]

lines += ["## Promedios por plataforma", "",
          "Promedio de cada puntaje (0-2) sobre los sitios con valor; `n` = sitios con dato. "
          "La plataforma es la detectada por huellas en el HTML (no la del directorio).", ""]
lines += avg_table(lambda r: r["plataforma"] or "(no identificada o no legible)", "Por plataforma detectada")
grupo = {d: e.get("grupo", "") for d, e in ev.items()}
lines += avg_table(lambda r: grupo.get(r["dominio"], ""), "Por grupo del directorio")

# plataforma directorio vs detectada
lines += ["## Plataforma: directorio vs. detectada", ""]
mism = []
for r in rows:
    g = grupo.get(r["dominio"], "")
    exp = "WooCommerce" if "WooCommerce" in g else "Shopify" if "Shopify" in g else None
    if exp and not r["plataforma"]:
        mism.append(f"- {r['dominio']}: directorio {exp}, no verificable (sitio no legible)")
    if exp and r["plataforma"] and r["plataforma"] != exp:
        mism.append(f"- {r['dominio']}: directorio {exp}, detectada {r['plataforma']}")
    if not exp:
        mism.append(f"- {r['dominio']} (por verificar): {r['plataforma'] or 'no identificada'}")
ok = sum(1 for r in rows if r["plataforma"] and (
    ("WooCommerce" in grupo.get(r["dominio"], "") and r["plataforma"] == "WooCommerce") or
    ("Shopify" in grupo.get(r["dominio"], "") and r["plataforma"] == "Shopify")))
lines += [f"Coinciden con el directorio: {ok} sitios. Diferencias o casos a verificar:", ""]
lines += mism + [""]

# no revisados
lines += ["## Sitios que no se pudieron revisar", ""]
for r in rows:
    if r["activo"] != "sí":
        lines.append(f"- **{r['dominio']}** — {r['notas']}")
lines += ["", "## Revisión parcial (alguna celda vacía)", ""]
for r in rows:
    if r["activo"] == "sí":
        empty = [c for c in SCORES + ["plataforma", "productos_aprox", "medios_de_pago"] if r[c] == ""]
        if empty:
            lines.append(f"- **{r['dominio']}** — sin {', '.join(empty)}. {r['notas']}")
lines.append("")

open(out_path, "w", encoding="utf-8").write("\n".join(lines))
print("\n".join(lines))
