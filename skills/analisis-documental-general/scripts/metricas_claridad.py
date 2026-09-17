#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
metricas_claridad.py — Métricas objetivas de claridad para documentos en español.

Sirve a la dimensión D4 (Claridad en la exposición) del procedimiento de análisis
cualitativo documental de SERFOR, anclada en ISO 24495-1:2023.

Por qué existe: el juicio de un modelo sobre "si un texto es claro" no es
reproducible entre corridas ni auditable ante control. Estas métricas sí lo son:
son funciones deterministas del texto, y el criterio de aceptación CA-15 del SACD
(dos ejecuciones producen el mismo conjunto de veredictos) depende de que la parte
medible de D4 se calcule, no se estime.

El script NO emite veredictos. Entrega números y localiza pasajes. El veredicto
C/CP/NC/NA/NE lo emite el evaluador aplicando los umbrales de la rúbrica aprobada,
porque el umbral es una decisión institucional versionable, no una constante del
código.

Uso:
    python metricas_claridad.py documento.txt
    python metricas_claridad.py documento.txt --json
    python metricas_claridad.py acta.txt --perfil ciudadano
    python metricas_claridad.py informe.txt --perfil interno --siglas-conocidas SERFOR,OTI,ATFFS
    python metricas_claridad.py --texto "Párrafo suelto a medir."
    cat doc.txt | python metricas_claridad.py -

Sin dependencias externas: solo biblioteca estándar de Python 3.9+.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from typing import Iterable

# --------------------------------------------------------------------------- #
# Léxicos. Se mantienen aquí, visibles y editables, porque son decisiones de
# criterio institucional y deben poder revisarse sin leer el algoritmo.
# --------------------------------------------------------------------------- #

VOCALES = "aeiouáéíóúüAEIOUÁÉÍÓÚÜ"
VOCALES_FUERTES = "aeoáéíóúAEOÁÉÍÓÚ"

# Expresiones vagas: criterio D4.4 del procedimiento. Señalan una obligación o
# una magnitud sin concretarla, lo que traslada al lector la carga de interpretar.
EXPRESIONES_VAGAS = [
    "según corresponda", "de ser el caso", "en lo que resulte aplicable",
    "de acuerdo a lo señalado", "conforme a lo indicado", "entre otros",
    "entre otras", "u otros", "y/o", "lo antes posible", "a la brevedad",
    "oportunamente", "en su momento", "de manera adecuada", "adecuadamente",
    "apropiadamente", "razonablemente", "en lo posible", "de ser necesario",
    "los mismos que", "las mismas que", "diversos", "diversas", "varios",
    "algunos", "ciertos", "significativo", "sustancial", "considerable",
    "óptimo", "idóneo", "periódicamente", "regularmente", "suficiente",
]

# Fórmulas de arrastre burocrático: alargan sin aportar información.
MULETILLAS_BUROCRATICAS = [
    "es de señalar que", "cabe señalar que", "cabe precisar que",
    "cabe indicar que", "es preciso indicar que", "se hace de conocimiento",
    "tengo el agrado de dirigirme", "me dirijo a usted",
    "en el marco de lo dispuesto", "sin otro particular",
    "hago propicia la ocasión", "es menester", "a efectos de",
    "con la finalidad de dar cumplimiento", "en atención al documento de la referencia",
    "de la referencia", "por medio del presente",
]

# Latinismos frecuentes en documentos administrativos peruanos. ISO 24495-1
# exige que el término que el lector no pueda resolver se explique o se sustituya.
LATINISMOS = [
    "prima facie", "ab initio", "in fine", "ut supra", "ut infra", "grosso modo",
    "inter alia", "mutatis mutandis", "sui generis", "de facto", "de iure",
    "ipso facto", "per se", "ad hoc", "a priori", "a posteriori", "in situ",
    "iuris tantum", "iure et de iure", "periculum in mora", "fumus boni iuris",
    "erga omnes", "ultra petita", "sine qua non", "ratio legis", "numerus clausus",
]

# Conectores lógicos: su presencia es indicio de señalización del hilo argumental
# (criterio D4.1 y D4.3). Su ausencia total en un texto largo es una señal.
CONECTORES = [
    "por lo tanto", "en consecuencia", "por consiguiente", "sin embargo",
    "no obstante", "en cambio", "asimismo", "además", "en primer lugar",
    "en segundo lugar", "finalmente", "por ello", "debido a", "porque",
    "a fin de", "para ello", "en efecto", "es decir", "en síntesis",
    "en conclusión", "por el contrario", "de este modo", "así",
]

PARTICIPIOS_IRREGULARES = {
    "hecho", "dicho", "puesto", "visto", "escrito", "abierto", "cubierto",
    "resuelto", "vuelto", "muerto", "roto", "impuesto", "dispuesto",
    "previsto", "suscrito", "inscrito", "descrito", "expuesto", "propuesto",
    "compuesto", "supuesto", "satisfecho", "devuelto", "absuelto",
}

FORMAS_SER = {
    "es", "son", "era", "eran", "fue", "fueron", "será", "serán", "sería",
    "serían", "ha sido", "han sido", "había sido", "habían sido", "sea",
    "sean", "fuera", "fueran", "siendo", "ser",
}

NEXOS_SUBORDINANTES = [
    "que", "quien", "quienes", "cuyo", "cuya", "cuyos", "cuyas", "cual",
    "cuales", "donde", "cuando", "mientras", "aunque", "si", "porque",
    "pues", "ya que", "puesto que", "dado que", "a fin de que", "para que",
    "siempre que", "salvo que", "en tanto", "toda vez que",
]

SUFIJOS_NOMINALIZACION = ("ción", "ciones", "miento", "mientos", "idad", "idades", "anza", "encia")

# Siglas que no se reportan como "sin desarrollar" porque el lector institucional
# las resuelve sin ayuda. Es una lista deliberadamente corta: ante un destinatario
# ciudadano casi ninguna sigla es evidente, y la de la propia entidad tampoco lo es
# para quien la ve por primera vez en una notificación. Amplíela con --siglas-conocidas
# solo cuando el destinatario sea interno.
SIGLAS_INSTITUCIONALES = {"SERFOR", "OTI"}

# Umbrales por destinatario (eje 1 del perfil). Son el piso objetivo que reporta el
# script; el veredicto lo emite el evaluador con la rúbrica aprobada.
UMBRALES_PERFIL = {
    "ciudadano": {"szigriszt_min": 60, "pal_oracion_max": 20, "oracion_max": 35,
                  "oraciones_parrafo_max": 4, "pasiva_max": 15, "nominalizacion_max": 6},
    "externo":   {"szigriszt_min": 50, "pal_oracion_max": 25, "oracion_max": 40,
                  "oraciones_parrafo_max": 5, "pasiva_max": 25, "nominalizacion_max": 8},
    "interno":   {"szigriszt_min": 45, "pal_oracion_max": 28, "oracion_max": 45,
                  "oraciones_parrafo_max": 6, "pasiva_max": 30, "nominalizacion_max": 9},
}


# --------------------------------------------------------------------------- #
# Utilidades de segmentación
# --------------------------------------------------------------------------- #

def _normalizar(texto: str) -> str:
    """Unifica espacios y saltos de línea sin alterar el contenido.

    La normalización debe ser la misma que usa la verificación literal de citas
    del SACD (regla 8.3.2 del procedimiento): si aquí se normaliza distinto, una
    cita válida podría descartarse.
    """
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    texto = re.sub(r"[ \t ]+", " ", texto)
    return texto.strip()


SENTINELA = chr(1)  # marca interna para puntos que no cierran oración

ABREVIATURAS = {
    "sr", "sra", "srta", "dr", "dra", "ing", "lic", "mag", "abog", "arq",
    "av", "jr", "nro", "n", "art", "num", "pág", "págs", "cap", "inc",
    "lit", "ed", "vol", "aprox", "etc", "ee", "uu", "d", "s",
}


def dividir_oraciones(texto: str) -> list[str]:
    """Divide en oraciones evitando los cortes falsos más comunes en español
    administrativo: abreviaturas (Sr., N°, art.), numeración legal (1.2.3) y
    decimales (S/ 1,250.00).
    """
    texto = _normalizar(texto)
    # Protege puntos que no cierran oración.
    protegido = re.sub(r"(\d)\.(\d)", r"\1" + SENTINELA + r"\2", texto)
    for abrev in ABREVIATURAS:
        protegido = re.sub(
            rf"\b({re.escape(abrev)})\.", r"\1" + SENTINELA, protegido, flags=re.IGNORECASE
        )
    partes = re.split(r"(?<=[.;:!?])\s+(?=[\"«¿¡A-ZÁÉÍÓÚÑ0-9])|\n{2,}", protegido)
    oraciones = []
    for p in partes:
        p = p.replace(SENTINELA, ".").strip()
        # Una "oración" sin ningún verbo ni más de dos palabras suele ser un
        # título o un elemento de lista; no debe contaminar la longitud media.
        if len(p.split()) >= 3:
            oraciones.append(p)
    return oraciones


def dividir_parrafos(texto: str) -> list[str]:
    texto = _normalizar(texto)
    crudos = re.split(r"\n\s*\n|\n(?=\s*[-•*–]\s)|\n(?=\s*\d+[\.\)]\s)", texto)
    return [p.strip() for p in crudos if p.strip()]


def extraer_palabras(texto: str) -> list[str]:
    return re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:['-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*", texto)


def contar_silabas(palabra: str) -> int:
    """Cuenta sílabas por agrupación de núcleos vocálicos, resolviendo diptongos
    e hiatos. Es una aproximación fonológica, suficiente y estable para los
    índices de legibilidad, que se calculan sobre cientos de palabras.
    """
    p = palabra.lower()
    p = "".join(c for c in p if c.isalpha())
    if not p:
        return 0
    silabas, i, n = 0, 0, len(p)
    while i < n:
        if p[i] in VOCALES:
            silabas += 1
            j = i + 1
            while j < n and p[j] in VOCALES:
                anterior, actual = p[j - 1], p[j]
                anterior_fuerte = anterior in VOCALES_FUERTES
                actual_fuerte = actual in VOCALES_FUERTES
                # Dos vocales fuertes forman hiato: cuentan como dos sílabas.
                # Débil tildada junto a fuerte también rompe el diptongo.
                if (anterior_fuerte and actual_fuerte) or actual in "íúÍÚ" or anterior in "íúÍÚ":
                    silabas += 1
                j += 1
            i = j
        else:
            i += 1
    return max(silabas, 1)


# --------------------------------------------------------------------------- #
# Resultado
# --------------------------------------------------------------------------- #

@dataclass
class Hallazgo:
    tipo: str
    expresion: str
    ocurrencias: int
    ejemplos: list[str] = field(default_factory=list)


@dataclass
class Metricas:
    palabras: int = 0
    oraciones: int = 0
    parrafos: int = 0
    silabas: int = 0
    palabras_por_oracion: float = 0.0
    silabas_por_palabra: float = 0.0
    oraciones_por_parrafo: float = 0.0
    fernandez_huerta: float = 0.0
    szigriszt_pazos: float = 0.0
    escala_inflesz: str = ""
    oraciones_largas: int = 0
    pct_oraciones_largas: float = 0.0
    oracion_mas_larga: int = 0
    parrafos_largos: int = 0
    densidad_pasiva: float = 0.0
    densidad_subordinacion: float = 0.0
    densidad_nominalizacion: float = 0.0
    densidad_gerundios: float = 0.0
    conectores_distintos: int = 0
    siglas_sin_desarrollar: list[str] = field(default_factory=list)
    perfil_destinatario: str = "interno"
    umbrales: dict = field(default_factory=dict)
    fuera_de_umbral: list[str] = field(default_factory=list)
    hallazgos: list[Hallazgo] = field(default_factory=list)
    pasajes_criticos: list[dict] = field(default_factory=list)


UMBRAL_ORACION_LARGA = 30      # palabras. ISO 24495-1 recomienda la oración breve.
UMBRAL_ORACION_MUY_LARGA = 45
UMBRAL_PARRAFO_LARGO = 6       # oraciones. El manual del PJ fija 4-5 como medida justa.


def _escala_inflesz(puntaje: float) -> str:
    if puntaje < 40:
        return "muy difícil"
    if puntaje < 55:
        return "algo difícil"
    if puntaje < 65:
        return "normal"
    if puntaje < 80:
        return "bastante fácil"
    return "muy fácil"


def _buscar_expresiones(texto_bajo: str, lexico: Iterable[str], tipo: str) -> list[Hallazgo]:
    hallazgos = []
    for expr in lexico:
        patron = re.compile(rf"\b{re.escape(expr)}\b", re.IGNORECASE)
        coincidencias = patron.findall(texto_bajo)
        if coincidencias:
            ejemplos = []
            for m in list(patron.finditer(texto_bajo))[:2]:
                ini, fin = max(0, m.start() - 60), min(len(texto_bajo), m.end() + 60)
                ejemplos.append("…" + texto_bajo[ini:fin].strip() + "…")
            hallazgos.append(Hallazgo(tipo, expr, len(coincidencias), ejemplos))
    return sorted(hallazgos, key=lambda h: -h.ocurrencias)


def _densidad_pasiva(oraciones: list[str]) -> tuple[float, list[str]]:
    con_pasiva = []
    patron_se = re.compile(r"\bse\s+(\w+[aeiá]ron|\w+ará[n]?|\w+a|\w+en)\b", re.IGNORECASE)
    for o in oraciones:
        tokens = [t.lower() for t in extraer_palabras(o)]
        encontrada = False
        for i, t in enumerate(tokens[:-1]):
            if t in FORMAS_SER:
                siguiente = tokens[i + 1]
                if (
                    siguiente.endswith(("ado", "ada", "ados", "adas", "ido", "ida", "idos", "idas"))
                    or siguiente in PARTICIPIOS_IRREGULARES
                ):
                    encontrada = True
                    break
        if not encontrada and patron_se.search(o):
            encontrada = True
        if encontrada:
            con_pasiva.append(o)
    pct = round(100 * len(con_pasiva) / len(oraciones), 1) if oraciones else 0.0
    return pct, con_pasiva


def analizar(texto: str, perfil: str = "interno", siglas_conocidas: set | None = None) -> Metricas:
    texto = _normalizar(texto)
    m = Metricas()

    oraciones = dividir_oraciones(texto)
    parrafos = dividir_parrafos(texto)
    palabras = extraer_palabras(texto)

    m.palabras = len(palabras)
    m.oraciones = len(oraciones)
    m.parrafos = len(parrafos)
    if m.palabras == 0 or m.oraciones == 0:
        return m

    m.silabas = sum(contar_silabas(p) for p in palabras)
    m.palabras_por_oracion = round(m.palabras / m.oraciones, 1)
    m.silabas_por_palabra = round(m.silabas / m.palabras, 2)
    m.oraciones_por_parrafo = round(m.oraciones / m.parrafos, 1) if m.parrafos else 0.0

    # Fernández Huerta (1959): índice de lecturabilidad para el español.
    sil_por_100 = 100 * m.silabas / m.palabras
    frases_por_100 = 100 * m.oraciones / m.palabras
    m.fernandez_huerta = round(206.84 - 0.60 * sil_por_100 - 1.02 * frases_por_100, 1)

    # Szigriszt-Pazos (1993): índice de perspicuidad, base de la escala INFLESZ.
    m.szigriszt_pazos = round(
        206.835 - 62.3 * (m.silabas / m.palabras) - (m.palabras / m.oraciones), 1
    )
    m.escala_inflesz = _escala_inflesz(m.szigriszt_pazos)

    longitudes = [len(extraer_palabras(o)) for o in oraciones]
    m.oracion_mas_larga = max(longitudes)
    m.oraciones_largas = sum(1 for L in longitudes if L > UMBRAL_ORACION_LARGA)
    m.pct_oraciones_largas = round(100 * m.oraciones_largas / m.oraciones, 1)
    m.parrafos_largos = sum(
        1 for p in parrafos if len(dividir_oraciones(p)) > UMBRAL_PARRAFO_LARGO
    )

    m.densidad_pasiva, _ = _densidad_pasiva(oraciones)

    bajo = texto.lower()
    nexos = sum(len(re.findall(rf"\b{re.escape(n)}\b", bajo)) for n in NEXOS_SUBORDINANTES)
    m.densidad_subordinacion = round(nexos / m.oraciones, 2)

    nominal = sum(1 for p in palabras if p.lower().endswith(SUFIJOS_NOMINALIZACION))
    m.densidad_nominalizacion = round(100 * nominal / m.palabras, 1)

    gerundios = sum(1 for p in palabras if re.search(r"(ando|iendo|yendo)$", p.lower()))
    m.densidad_gerundios = round(100 * gerundios / m.palabras, 1)

    m.conectores_distintos = sum(
        1 for c in CONECTORES if re.search(rf"\b{re.escape(c)}\b", bajo)
    )

    # Siglas sin desarrollar: se considera desarrollada si aparece un paréntesis
    # con la sigla, o la sigla seguida de paréntesis con texto.
    # Las líneas íntegramente en mayúsculas son encabezados y numeraciones
    # ("INFORME N° 0142-2026-SERFOR-OTI"): sus mayúsculas son tipográficas, no
    # siglas, y contarlas produce falsos positivos que restan credibilidad.
    cuerpo = "\n".join(
        linea for linea in texto.split("\n")
        if not (linea.strip() and linea.strip() == linea.strip().upper())
    )
    for sigla in sorted(set(re.findall(r"\b[A-ZÁÉÍÓÚÑ]{2,}(?:[-/][A-ZÁÉÍÓÚÑ]{2,})?\b", cuerpo))):
        if sigla in (siglas_conocidas if siglas_conocidas is not None else SIGLAS_INSTITUCIONALES):
            continue
        desarrollada = re.search(rf"\(\s*{re.escape(sigla)}\s*\)", texto) or re.search(
            rf"\b{re.escape(sigla)}\s*\([^)]{{6,}}\)", texto
        )
        if not desarrollada:
            m.siglas_sin_desarrollar.append(sigla)

    m.perfil_destinatario = perfil if perfil in UMBRALES_PERFIL else "interno"
    m.umbrales = dict(UMBRALES_PERFIL[m.perfil_destinatario])
    u = m.umbrales
    m.fuera_de_umbral = sorted(k for k, cond in {
        "szigriszt_pazos": m.szigriszt_pazos < u["szigriszt_min"],
        "palabras_por_oracion": m.palabras_por_oracion > u["pal_oracion_max"],
        "oracion_mas_larga": m.oracion_mas_larga > u["oracion_max"],
        "oraciones_por_parrafo": m.oraciones_por_parrafo > u["oraciones_parrafo_max"],
        "densidad_pasiva": m.densidad_pasiva > u["pasiva_max"],
        "densidad_nominalizacion": m.densidad_nominalizacion > u["nominalizacion_max"],
    }.items() if cond)

    m.hallazgos = (
        _buscar_expresiones(bajo, EXPRESIONES_VAGAS, "expresion_vaga")
        + _buscar_expresiones(bajo, MULETILLAS_BUROCRATICAS, "muletilla_burocratica")
        + _buscar_expresiones(bajo, LATINISMOS, "latinismo")
    )

    # Pasajes críticos: se devuelven literales y con su posición para que el
    # evaluador pueda citarlos como evidencia verificable, no parafraseada.
    for idx, (o, L) in enumerate(zip(oraciones, longitudes), start=1):
        if L > UMBRAL_ORACION_MUY_LARGA:
            m.pasajes_criticos.append(
                {"tipo": "oracion_muy_larga", "orden": idx, "palabras": L, "cita": o}
            )
    m.pasajes_criticos = sorted(
        m.pasajes_criticos, key=lambda d: -d["palabras"]
    )[:10]

    return m


# --------------------------------------------------------------------------- #
# Presentación
# --------------------------------------------------------------------------- #

def informe_texto(m: Metricas) -> str:
    if m.palabras == 0:
        return "Texto vacío o sin contenido analizable."
    L = []
    L.append("MÉTRICAS DE CLARIDAD — ISO 24495-1 / dimensión D4")
    L.append("=" * 58)
    L.append(f"Extensión            : {m.palabras} palabras · {m.oraciones} oraciones · {m.parrafos} párrafos")
    L.append(f"Perfil de umbrales  : destinatario '{m.perfil_destinatario}'")
    L.append(f"Legibilidad Szigriszt: {m.szigriszt_pazos}  (escala INFLESZ: {m.escala_inflesz}) · mínimo {m.umbrales.get('szigriszt_min','-')}")
    L.append(f"Fernández Huerta     : {m.fernandez_huerta}")
    L.append("")
    L.append(f"Palabras por oración : {m.palabras_por_oracion} / máx {m.umbrales.get('pal_oracion_max','-')}   (más larga: {m.oracion_mas_larga} / máx {m.umbrales.get('oracion_max','-')})")
    L.append(f"Oraciones > {UMBRAL_ORACION_LARGA} palabras: {m.oraciones_largas} ({m.pct_oraciones_largas} %)")
    L.append(f"Oraciones por párrafo: {m.oraciones_por_parrafo}   (párrafos > {UMBRAL_PARRAFO_LARGO} oraciones: {m.parrafos_largos})")
    L.append(f"Voz pasiva           : {m.densidad_pasiva} % / máx {m.umbrales.get('pasiva_max','-')} %")
    L.append(f"Subordinación        : {m.densidad_subordinacion} nexos por oración")
    L.append(f"Nominalización       : {m.densidad_nominalizacion} % de las palabras")
    L.append(f"Gerundios            : {m.densidad_gerundios} % de las palabras")
    L.append(f"Conectores distintos : {m.conectores_distintos}")
    if m.fuera_de_umbral:
        L.append("")
        L.append(f"FUERA DE UMBRAL ({m.perfil_destinatario}): {', '.join(m.fuera_de_umbral)}")
    if m.siglas_sin_desarrollar:
        L.append(f"Siglas sin desarrollar: {', '.join(m.siglas_sin_desarrollar[:15])}")
    if m.hallazgos:
        L.append("")
        L.append("EXPRESIONES OBSERVADAS")
        L.append("-" * 58)
        for h in m.hallazgos[:20]:
            L.append(f"  [{h.tipo}] «{h.expresion}» × {h.ocurrencias}")
    if m.pasajes_criticos:
        L.append("")
        L.append("PASAJES CRÍTICOS (citables como evidencia literal)")
        L.append("-" * 58)
        for p in m.pasajes_criticos[:5]:
            L.append(f"  Oración {p['orden']} — {p['palabras']} palabras:")
            L.append(f"    «{p['cita'][:300]}»")
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description="Métricas de claridad ISO 24495-1 para textos en español.")
    ap.add_argument("archivo", nargs="?", help="Ruta del archivo .txt o '-' para entrada estándar")
    ap.add_argument("--texto", help="Texto literal a analizar")
    ap.add_argument("--json", action="store_true", help="Salida en JSON")
    ap.add_argument("--perfil", default="interno", choices=sorted(UMBRALES_PERFIL),
                    help="Destinatario del documento; fija los umbrales reportados (por defecto: interno)")
    ap.add_argument("--siglas-conocidas", default=None,
                    help="Siglas separadas por coma que no deben reportarse como sin desarrollar")
    args = ap.parse_args()

    if args.texto:
        contenido = args.texto
    elif args.archivo == "-" or (args.archivo is None and not sys.stdin.isatty()):
        contenido = sys.stdin.read()
    elif args.archivo:
        with open(args.archivo, encoding="utf-8", errors="replace") as fh:
            contenido = fh.read()
    else:
        ap.print_help()
        return 1

    conocidas = (set(x.strip().upper() for x in args.siglas_conocidas.split(",") if x.strip())
                 if args.siglas_conocidas is not None else None)
    m = analizar(contenido, perfil=args.perfil, siglas_conocidas=conocidas)
    if args.json:
        print(json.dumps(asdict(m), ensure_ascii=False, indent=2))
    else:
        print(informe_texto(m))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
