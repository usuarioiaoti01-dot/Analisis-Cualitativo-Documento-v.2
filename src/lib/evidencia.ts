/**
 * Verificación de la evidencia que devuelve el motor de análisis.
 *
 * Un hallazgo vale por su evidencia. Si la cita que acompaña a un hallazgo no
 * está realmente en el documento, el hallazgo no sustenta nada y sería peor que
 * no haberlo emitido: un revisor que verifica una cita inexistente pierde la
 * confianza en todo el informe.
 *
 * Por eso toda cita se busca literalmente en el texto antes de guardarse. La
 * que no aparece se descarta, y se informa cuántas se descartaron.
 */

export interface SeccionUbicable {
  id: number;
  numbering: string | null;
  heading: string;
  page_from: number | null;
  char_start: number;
  char_end: number;
}

export interface EvidenciaVerificada {
  /** Texto tal como aparece en el documento, no como lo devolvió el motor. */
  texto: string;
  indice: number;
  seccionId: number | null;
  ubicacion: string;
}

/**
 * Normaliza para comparar sin alterar las posiciones: cada carácter de la copia
 * corresponde al mismo índice del original. Solo se unifican los espacios y las
 * comillas, que es donde difieren la cita del motor y el texto del PDF.
 */
function aplanarConservandoIndices(texto: string): string {
  return texto
    .replace(/[\s ]/g, ' ')
    .replace(/[«»“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

/** La misma normalización para la cita, que sí puede cambiar de longitud. */
function normalizarCita(cita: string): string {
  return cita
    .replace(/[\s ]+/g, ' ')
    .replace(/[«»“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

/**
 * Busca la cita en el documento. Devuelve `null` si no aparece.
 *
 * La búsqueda tolera diferencias de espaciado —un PDF parte las palabras entre
 * renglones— pero no de contenido: si el motor cambió una palabra, la cita se
 * descarta.
 */
export function verificarCita(
  documento: string,
  secciones: SeccionUbicable[],
  cita: string,
): EvidenciaVerificada | null {
  const buscada = normalizarCita(cita);
  if (buscada.length < 15) return null; // Una cita demasiado corta no prueba nada.

  const plano = aplanarConservandoIndices(documento);

  // Primer intento: coincidencia directa sobre el texto aplanado.
  let indice = plano.indexOf(buscada);

  // Segundo intento: el aplanado deja espacios dobles donde el original tenía
  // un salto de línea más sangría; se compara ignorando espacios repetidos.
  if (indice === -1) {
    indice = buscarTolerandoEspacios(plano, buscada);
  }

  if (indice === -1) return null;

  const seccion = secciones.find((s) => indice >= s.char_start && indice < s.char_end);

  return {
    // Se guarda el texto del documento, no el que devolvió el motor.
    texto: documento.slice(indice, indice + cita.trim().length).replace(/\s+/g, ' ').trim(),
    indice,
    seccionId: seccion?.id ?? null,
    ubicacion: ubicacionDe(seccion, documento, indice),
  };
}

/**
 * Coincidencia que trata cualquier racha de espacios como equivalente. Recorre
 * el documento una sola vez comparando carácter a carácter.
 */
function buscarTolerandoEspacios(plano: string, buscada: string): number {
  const objetivo = buscada.replace(/ +/g, ' ');
  if (objetivo.length === 0) return -1;

  const primerCaracter = objetivo[0];

  for (let inicio = 0; inicio < plano.length; inicio += 1) {
    if (plano[inicio] !== primerCaracter) continue;

    let i = inicio;
    let j = 0;

    while (i < plano.length && j < objetivo.length) {
      if (objetivo[j] === ' ') {
        // Una racha de espacios en el documento equivale a un espacio en la cita.
        if (plano[i] !== ' ') break;
        while (i < plano.length && plano[i] === ' ') i += 1;
        j += 1;
        continue;
      }
      if (plano[i] !== objetivo[j]) break;
      i += 1;
      j += 1;
    }

    if (j === objetivo.length) return inicio;
  }

  return -1;
}

/** Etiqueta legible: «4.2. BASE LEGAL · pág. 7». */
export function ubicacionDe(
  seccion: SeccionUbicable | undefined,
  documento: string,
  indice: number,
): string {
  if (seccion) {
    const nombre = seccion.numbering ? `${seccion.numbering}. ${seccion.heading}` : seccion.heading;
    return seccion.page_from ? `${nombre} · pág. ${seccion.page_from}` : nombre;
  }

  const pagina = paginaDe(documento, indice);
  return pagina ? `pág. ${pagina}` : 'Ubicación no determinada';
}

/** Última marca de página que precede a la posición dada. */
export function paginaDe(documento: string, indice: number): number | null {
  const anterior = documento.lastIndexOf('--- Página ', indice);
  if (anterior === -1) return null;

  const coincidencia = documento.slice(anterior, anterior + 30).match(/--- Página (\d+) ---/);
  return coincidencia ? Number(coincidencia[1]) : null;
}
