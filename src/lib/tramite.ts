/**
 * Separa el encabezado de trámite del cuerpo evaluable de un documento.
 *
 * Un memorando empieza con su número, el destinatario, el remitente, el asunto
 * y la fecha. La segmentación las ve como secciones porque lo parecen —un
 * renglón corto en mayúsculas—, pero no son contenido del documento: son su
 * carátula. Evaluarlas contamina el análisis, que acaba observando que «JAIME
 * DELGADO RAMOS» no desarrolla su argumento.
 *
 * La clasificación es por posición y forma, no por adivinanza: solo puede ser
 * trámite lo que está **antes** de la primera sección de cuerpo, y la corrida
 * se detiene en cuanto aparece algo que se comporta como contenido —un título
 * conocido, una sección numerada o un encabezado largo—.
 *
 * Es deliberadamente una función pura sobre la lista de secciones y no una
 * columna en la base: así vale también para los documentos ya cargados, sin
 * migrarlos ni volver a segmentarlos.
 */

export type RolSeccion = 'tramite' | 'cuerpo';

/** Lo mínimo que hace falta de una sección para clasificarla. */
export interface SeccionClasificable {
  numbering: string | null;
  heading: string;
}

/**
 * Títulos que abren el cuerpo del documento. Ninguno de ellos es trámite,
 * aunque aparezca al principio y tenga la forma de un rótulo.
 */
const TITULOS_DE_CUERPO =
  /^(antecedentes?|analisis|base legal|marco (legal|normativo)|objet(o|ivos?)|finalidad|alcance|conclusion|recomendacion|considerando|disposicion|contenido|introduccion|resumen|justificacion|desarrollo|responsabilidad|vigencia|glosario|siglas|definiciones|abreviaturas|propuesta|diagnostico|situacion|anexo|articulo|visto|hechos|fundamento|opinion|informacion)/;

/**
 * Rótulos inequívocos de la carátula. Los que se rotulan con una sola letra
 * —«A:», «DE:»— no están aquí: los recoge la regla de renglón corto, que no
 * arriesga confundirlos con un «DE LAS DISPOSICIONES…» del cuerpo.
 */
const ROTULOS_DE_TRAMITE =
  /^(asunto|referencia|ref|fecha|destinatario|remitente|con copia|atencion|atte|expediente|folios?|se[nñ]or(a|es|ita)?|doctor(a)?|ingenier[oa]|licenciad[oa]|abogad[oa]|magister)\b/;

/**
 * Cabecera con el número del documento: «MEMORANDO N° 000123-2026-…». Se exige
 * la marca de número para no confundirla con un título que empiece igual.
 */
const CABECERA_CON_NUMERO =
  /^(memorando|memorandum|oficio|carta|nota|prove[ií]do|hoja de (env[ií]o|ruta)|informe(\s+t[eé]cnico|\s+legal)?)\b[^]{0,60}\bn\b/;

/** Como mucho, la carátula ocupa las primeras secciones. */
const MAXIMO_SECCIONES_DE_TRAMITE = 8;

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** ¿El encabezado parece un rótulo de carátula y no un título de contenido? */
function pareceTramite(seccion: SeccionClasificable): boolean {
  // Lo que la segmentación no supo nombrar, por estar antes del primer título,
  // es por definición la carátula.
  if (seccion.heading === 'Encabezamiento') return true;

  // Una sección numerada pertenece al índice del documento, no a su carátula.
  if (seccion.numbering !== null) return false;

  const limpio = normalizar(seccion.heading);
  if (TITULOS_DE_CUERPO.test(limpio)) return false;

  if (CABECERA_CON_NUMERO.test(limpio)) return true;
  if (ROTULOS_DE_TRAMITE.test(limpio)) return true;

  // Nombres y cargos del destinatario y del remitente: renglones cortos, sin
  // puntuación de frase. Un título de contenido de esta forma ya quedó
  // descartado por la lista de arriba.
  return seccion.heading.trim().length <= 45 && !/[.:;]$/.test(seccion.heading.trim());
}

/**
 * Rol de cada sección, en el mismo orden en que se reciben. Devuelve siempre al
 * menos una sección de cuerpo: si todo pareciera trámite, es que la heurística
 * se equivocó, y es preferible analizar de más que no analizar nada.
 */
export function clasificarSecciones(secciones: SeccionClasificable[]): RolSeccion[] {
  let corte = 0;
  while (
    corte < secciones.length &&
    corte < MAXIMO_SECCIONES_DE_TRAMITE &&
    pareceTramite(secciones[corte])
  ) {
    corte += 1;
  }

  if (corte === secciones.length) corte = 0;

  return secciones.map((_, indice) => (indice < corte ? 'tramite' : 'cuerpo'));
}

/**
 * Texto evaluable del documento: todo a partir de la primera sección de cuerpo.
 *
 * Se corta por el desplazamiento de esa sección y no reensamblando las
 * secciones, para conservar el texto tal cual —incluidos los cortes de renglón
 * y los saltos de página— y que las citas del modelo sigan siendo literales
 * frente al documento completo.
 */
export function textoEvaluable(
  contenido: string,
  // La base devuelve `char_start` y la segmentación `charStart`: se admiten las
  // dos formas para no tener que traducir en cada llamada.
  secciones: (SeccionClasificable & {
    char_start?: number;
    charStart?: number;
    page_from?: number | null;
    pageFrom?: number | null;
  })[],
): { texto: string; omitidas: number } {
  const roles = clasificarSecciones(secciones);
  const primeraDeCuerpo = roles.indexOf('cuerpo');

  if (primeraDeCuerpo <= 0) return { texto: contenido, omitidas: 0 };

  const seccion = secciones[primeraDeCuerpo];
  const inicio = seccion.char_start ?? seccion.charStart;
  if (inicio === undefined) return { texto: contenido, omitidas: 0 };

  const cuerpo = contenido.slice(inicio);

  // El corte deja fuera la marca de la página en curso; sin ella el modelo
  // creería que el documento empieza en la página que marque el primer salto.
  const pagina = seccion.page_from ?? seccion.pageFrom;
  const texto = pagina ? `--- Página ${pagina} ---\n${cuerpo}` : cuerpo;

  return { texto, omitidas: primeraDeCuerpo };
}
