/**
 * Etapa 6 — comparación de un documento contra el repositorio.
 *
 * Usa *shingling* con índice de Jaccard: el texto se corta en secuencias
 * solapadas de K palabras («shingles») y la similitud entre dos documentos es
 * la proporción de shingles que comparten. Es la técnica clásica de detección
 * de duplicados; no requiere modelos de lenguaje ni que el texto salga del
 * equipo, y detecta la reutilización de párrafos aunque estén reordenados.
 */

/** Palabras por shingle. Cinco es suficiente para que una coincidencia no sea casual. */
const K = 5;

/** Por debajo de este índice de Jaccard la coincidencia no se registra. */
export const UMBRAL_JACCARD = 0.15;

/**
 * Umbral de contención. El Jaccard penaliza la diferencia de tamaño: un TDR de
 * cuatro páginas copiado dentro de uno de cuarenta da un índice bajísimo aunque
 * esté reproducido entero. La contención mide qué proporción del documento más
 * pequeño aparece en el otro, y es la que detecta la reutilización parcial.
 */
export const UMBRAL_CONTENCION = 0.3;

export interface Fragmento {
  texto: string;
  palabras: number;
}

export interface Comparacion {
  similarity: number;
  containment: number;
  kind: 'version_previa' | 'reutilizacion' | 'similitud_inusual';
  fragments: Fragmento[];
}

/** Representación de un documento lista para comparar, calculada una sola vez. */
export interface Huella {
  palabras: string[];
  shingles: Set<number>;
  /** Primer índice de palabra en el que aparece cada shingle. */
  posiciones: Map<number, number>;
}

/** Normaliza para comparar: minúsculas, sin acentos, sin signos ni marcas de página. */
function normalizar(texto: string): string[] {
  return texto
    .replace(/^--- .*? ---$/gm, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((palabra) => palabra.length > 0);
}

/** Hash de 32 bits de un shingle. Guardar números en lugar de cadenas mantiene acotada la memoria. */
function hash(palabras: string[], desde: number): number {
  let h = 2166136261;
  for (let i = desde; i < desde + K; i += 1) {
    const palabra = palabras[i];
    for (let j = 0; j < palabra.length; j += 1) {
      h ^= palabra.charCodeAt(j);
      h = Math.imul(h, 16777619);
    }
    h ^= 32;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function huellaDe(texto: string): Huella {
  const palabras = normalizar(texto);
  const shingles = new Set<number>();
  const posiciones = new Map<number, number>();

  for (let i = 0; i + K <= palabras.length; i += 1) {
    const valor = hash(palabras, i);
    shingles.add(valor);
    if (!posiciones.has(valor)) posiciones.set(valor, i);
  }

  return { palabras, shingles, posiciones };
}

/**
 * Jaccard (intersección sobre unión) y contención (intersección sobre el menor
 * de los dos). Se calculan juntos porque comparten el recuento de intersección.
 */
export function comparar(a: Huella, b: Huella): { jaccard: number; contencion: number } {
  if (a.shingles.size === 0 || b.shingles.size === 0) return { jaccard: 0, contencion: 0 };

  // Se recorre el conjunto menor para que el coste sea el del más pequeño.
  const [menor, mayor] = a.shingles.size <= b.shingles.size ? [a, b] : [b, a];

  let interseccion = 0;
  for (const shingle of menor.shingles) {
    if (mayor.shingles.has(shingle)) interseccion += 1;
  }

  const union = a.shingles.size + b.shingles.size - interseccion;

  return {
    jaccard: union === 0 ? 0 : interseccion / union,
    contencion: interseccion / menor.shingles.size,
  };
}

/**
 * Fragmentos textuales que ambos documentos comparten, del más largo al más
 * corto. Son la evidencia que acompaña al hallazgo de coincidencia.
 */
export function fragmentosComunes(a: Huella, b: Huella, maximo = 3): Fragmento[] {
  const fragmentos: Fragmento[] = [];

  let i = 0;
  while (i + K <= a.palabras.length) {
    const valor = hash(a.palabras, i);
    if (!b.shingles.has(valor)) {
      i += 1;
      continue;
    }

    // Coincidencia: se extiende mientras los shingles sigan estando en B.
    let fin = i + K;
    while (fin + 1 <= a.palabras.length && b.shingles.has(hash(a.palabras, fin - K + 1))) {
      fin += 1;
    }

    fragmentos.push({
      texto: a.palabras.slice(i, fin).join(' '),
      palabras: fin - i,
    });
    i = fin;
  }

  return fragmentos
    .sort((x, y) => y.palabras - x.palabras)
    .slice(0, maximo)
    .map((fragmento) => ({
      ...fragmento,
      texto:
        fragmento.texto.length > 400 ? `${fragmento.texto.slice(0, 400)}…` : fragmento.texto,
    }));
}

/**
 * Clasifica la coincidencia. Un título casi idéntico con alta similitud es una
 * versión previa del mismo documento; una similitud alta entre documentos de
 * títulos distintos merece revisión; el tramo intermedio es reutilización.
 */
export function clasificar(
  jaccard: number,
  contencion: number,
  tituloA: string,
  tituloB: string,
): Comparacion['kind'] {
  if (jaccard >= 0.5 && tituloParecido(tituloA, tituloB)) return 'version_previa';
  if (jaccard >= 0.45) return 'similitud_inusual';
  // Contención alta con Jaccard bajo es el patrón de la reutilización parcial:
  // un documento pequeño reproducido dentro de otro mucho mayor.
  if (contencion >= 0.6) return 'similitud_inusual';
  return 'reutilizacion';
}

/** Dos títulos se parecen si comparten la mayoría de sus palabras significativas. */
function tituloParecido(a: string, b: string): boolean {
  const palabrasDe = (texto: string) =>
    new Set(normalizar(texto).filter((palabra) => palabra.length > 3));

  const setA = palabrasDe(a);
  const setB = palabrasDe(b);
  if (setA.size === 0 || setB.size === 0) return false;

  let comunes = 0;
  for (const palabra of setA) if (setB.has(palabra)) comunes += 1;

  return comunes / Math.min(setA.size, setB.size) >= 0.7;
}

/** Riesgo asociado a una coincidencia, según cuán inusual sea. */
export function riesgoDe(jaccard: number, contencion: number): 'bajo' | 'medio' | 'alto' {
  const mayor = Math.max(jaccard, contencion);
  if (mayor >= 0.6) return 'alto';
  if (mayor >= 0.3) return 'medio';
  return 'bajo';
}
