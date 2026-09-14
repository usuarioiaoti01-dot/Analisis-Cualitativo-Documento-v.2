/**
 * Segmentación del texto extraído en secciones numeradas.
 *
 * Sin esto un hallazgo solo puede apuntar a un desplazamiento de caracteres.
 * Con esto puede decir «Sección 4.2 · pág. 7», que es lo que un revisor
 * necesita para ir al párrafo y verificarlo.
 *
 * El reconocimiento es por patrón sobre el encabezado, porque los documentos
 * institucionales peruanos son muy regulares en su numeración: romanos para las
 * secciones de primer nivel («I. OBJETO»), decimal para los numerales
 * («4.2 Del procedimiento») y «Artículo N.º» en normativa.
 */

export interface Seccion {
  ordinal: number;
  /** Numeración tal como aparece: «I», «4.2», «Artículo 12». Nulo si no la tiene. */
  numbering: string | null;
  heading: string;
  content: string;
  pageFrom: number | null;
  pageTo: number | null;
  charStart: number;
  charEnd: number;
}

/** Marca de página que inserta la extracción de PDF. */
const MARCA_PAGINA = /^--- Página (\d+) ---$/;
/** Marca de hoja que inserta la extracción de XLSX. */
const MARCA_HOJA = /^--- Hoja: (.+) ---$/;

/**
 * Encabezados reconocidos, en orden de prioridad:
 *  - «Artículo 12.-» / «Artículo N.º 12»
 *  - «I.», «II.», «VIII.» seguido de texto en el mismo renglón
 *  - «4.», «4.2», «4.2.1» seguido de texto
 *  - Renglón corto íntegramente en mayúsculas (títulos sin numerar)
 */
const PATRONES: { regex: RegExp; numero: (m: RegExpMatchArray) => string }[] = [
  {
    regex: /^(Art[íi]culo\s+(?:N\.?º\s*)?(\d+)[.\-–—]?)\s*(.*)$/i,
    numero: (m) => `Artículo ${m[2]}`,
  },
  {
    regex: /^((?:X{0,3})(?:IX|IV|V?I{0,3}))[.\-–—)]\s+(.{2,120})$/,
    numero: (m) => m[1],
  },
  {
    regex: /^(\d+(?:\.\d+){0,3})[.\-–—)]?\s+(.{2,120})$/,
    numero: (m) => m[1],
  },
];

/** Un renglón en mayúsculas y sin punto final se trata como título. */
function esTituloEnMayusculas(linea: string): boolean {
  const limpio = linea.trim();
  if (limpio.length < 4 || limpio.length > 120) return false;
  if (!/[A-ZÁÉÍÓÚÑ]/.test(limpio)) return false;
  return limpio === limpio.toUpperCase() && !limpio.endsWith('.');
}

function detectarEncabezado(linea: string): { numbering: string | null; heading: string } | null {
  const limpio = linea.trim();
  if (limpio.length === 0) return null;

  for (const patron of PATRONES) {
    const coincidencia = limpio.match(patron.regex);
    if (!coincidencia) continue;

    const numbering = patron.numero(coincidencia);
    // El texto del encabezado es el último grupo capturado que tenga contenido.
    const texto = coincidencia[coincidencia.length - 1]?.trim() || limpio;

    // Un numeral seguido de una frase larga suele ser un párrafo, no un título.
    if (texto.length > 120) continue;
    return { numbering, heading: texto };
  }

  if (esTituloEnMayusculas(limpio)) return { numbering: null, heading: limpio };
  return null;
}

/**
 * Divide el texto en secciones. Si no reconoce ningún encabezado devuelve una
 * sección única con todo el documento, de modo que la evaluación siempre tenga
 * al menos un ancla donde situar la evidencia.
 */
export function segmentar(texto: string): Seccion[] {
  const lineas = texto.split('\n');
  const secciones: Seccion[] = [];

  let paginaActual: number | null = null;
  let desplazamiento = 0;

  let actual: {
    numbering: string | null;
    heading: string;
    cuerpo: string[];
    pageFrom: number | null;
    charStart: number;
  } | null = null;

  function cerrar(charEnd: number) {
    if (!actual) return;
    secciones.push({
      ordinal: secciones.length + 1,
      numbering: actual.numbering,
      heading: actual.heading,
      content: actual.cuerpo.join('\n').trim(),
      pageFrom: actual.pageFrom,
      pageTo: paginaActual,
      charStart: actual.charStart,
      charEnd,
    });
    actual = null;
  }

  for (const linea of lineas) {
    const inicioLinea = desplazamiento;
    desplazamiento += linea.length + 1;

    const marcaPagina = linea.match(MARCA_PAGINA);
    if (marcaPagina) {
      paginaActual = Number(marcaPagina[1]);
      continue;
    }
    if (MARCA_HOJA.test(linea)) {
      // En una hoja de cálculo cada hoja es una sección por sí misma.
      cerrar(inicioLinea);
      const nombre = linea.match(MARCA_HOJA)![1];
      actual = {
        numbering: null,
        heading: `Hoja: ${nombre}`,
        cuerpo: [],
        pageFrom: paginaActual,
        charStart: inicioLinea,
      };
      continue;
    }

    const encabezado = detectarEncabezado(linea);
    if (encabezado) {
      // Un título en mayúsculas que ocupa varios renglones llega aquí como
      // varios encabezados seguidos sin cuerpo. Se unen en uno solo.
      if (
        encabezado.numbering === null &&
        actual !== null &&
        actual.numbering === null &&
        actual.cuerpo.every((l) => l.trim().length === 0)
      ) {
        actual.heading = `${actual.heading} ${encabezado.heading}`.trim();
        actual.cuerpo = [];
        continue;
      }

      cerrar(inicioLinea);
      actual = {
        numbering: encabezado.numbering,
        heading: encabezado.heading,
        cuerpo: [],
        pageFrom: paginaActual,
        charStart: inicioLinea,
      };
      continue;
    }

    if (actual) {
      actual.cuerpo.push(linea);
    } else if (linea.trim().length > 0) {
      // Texto antes del primer encabezado: encabezamiento del documento.
      actual = {
        numbering: null,
        heading: 'Encabezamiento',
        cuerpo: [linea],
        pageFrom: paginaActual,
        charStart: inicioLinea,
      };
    }
  }

  cerrar(desplazamiento);

  if (secciones.length === 0 && texto.trim().length > 0) {
    return [
      {
        ordinal: 1,
        numbering: null,
        heading: 'Documento completo',
        content: texto.trim(),
        pageFrom: null,
        pageTo: null,
        charStart: 0,
        charEnd: texto.length,
      },
    ];
  }

  return secciones;
}

/** Etiqueta legible de una sección, tal como aparecerá en un hallazgo. */
export function ubicacionDe(seccion: Pick<Seccion, 'numbering' | 'heading' | 'pageFrom'>): string {
  const nombre = seccion.numbering ? `${seccion.numbering}. ${seccion.heading}` : seccion.heading;
  return seccion.pageFrom ? `${nombre} · pág. ${seccion.pageFrom}` : nombre;
}
