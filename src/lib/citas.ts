/**
 * Etapa 5 — reconocimiento de citas normativas en el texto de un documento.
 *
 * Las normas peruanas se citan de muchas formas para referirse a lo mismo:
 * «Ley N° 29763», «Ley N.º 29763» y «Ley 29763» son la misma norma, igual que
 * «Decreto Supremo N.º 085-2023-PCM» y «D.S. 085-2023-PCM». El reconocimiento
 * separa el tipo del número y normaliza ambos, de modo que la comparación
 * contra el catálogo no dependa de cómo se escribió la cita.
 *
 * Este módulo no usa modelos de lenguaje: es coincidencia de patrones, y por
 * eso corre entero dentro del perímetro de la entidad.
 */

export interface Cita {
  /** Tipo normalizado: «Ley», «Decreto Supremo», «Directiva General»… */
  tipo: string;
  /** Número de la norma, ya sin los cortes de renglón. */
  numero: string;
  /** Texto de la cita tal como se escribió, con los espacios normalizados. */
  textoCitado: string;
  /** Clave de comparación, insensible a la forma de escritura. */
  clave: string;
  /** Posición en el texto donde empieza la cita. */
  indice: number;
  /** Fragmento alrededor de la cita, que sirve de evidencia. */
  contexto: string;
}

/**
 * Tipos de norma reconocidos, del más específico al más general: «Directiva
 * General» debe intentarse antes que «Directiva», y «Resolución de Secretaría
 * General» antes que cualquier otra resolución.
 */
const TIPOS: { etiqueta: string; patron: string }[] = [
  { etiqueta: 'Directiva General', patron: 'Directiva\\s+General' },
  {
    etiqueta: 'Resolución de Secretaría General',
    patron: 'Resoluci[óo]n\\s+de\\s+Secretar[íi]a\\s+General|R\\.?\\s?S\\.?\\s?G\\.?',
  },
  { etiqueta: 'Resolución Ministerial', patron: 'Resoluci[óo]n\\s+Ministerial|R\\.?\\s?M\\.?' },
  { etiqueta: 'Resolución Directoral', patron: 'Resoluci[óo]n\\s+Directoral|R\\.?\\s?D\\.?' },
  { etiqueta: 'Resolución Jefatural', patron: 'Resoluci[óo]n\\s+Jefatural|R\\.?\\s?J\\.?' },
  { etiqueta: 'Resolución Ejecutiva', patron: 'Resoluci[óo]n\\s+Ejecutiva' },
  { etiqueta: 'Decreto Supremo', patron: 'Decreto\\s+Supremo|D\\.?\\s?S\\.?' },
  { etiqueta: 'Decreto Legislativo', patron: 'Decreto\\s+Legislativo|D\\.?\\s?L\\.?' },
  { etiqueta: 'Decreto de Urgencia', patron: 'Decreto\\s+de\\s+Urgencia|D\\.?\\s?U\\.?' },
  { etiqueta: 'Directiva', patron: 'Directiva' },
  { etiqueta: 'Ley', patron: 'Ley' },
];

/**
 * Número de norma. Cubre el número simple («29763»), el correlativo con año y
 * entidad («085-2023-PCM», «018-2017-SERFOR-SG») y el correlativo con prefijo
 * de letra («D00005-2022-MIDAGRI-SERFOR-GG»), con la variante que separa la
 * unidad con barra («001-2026-PCM/SGTD»).
 *
 * Admite un espacio tras los guiones porque el corte de renglón de un PDF
 * parte el correlativo en dos: «004-2019-» al final de un renglón y «JUS» al
 * comienzo del siguiente.
 */
const NUMERO = '([A-Z]{0,2}\\d{3,6}(?:-\\s?[A-Za-zÑÁÉÍÓÚ0-9]+)*(?:\\s?/\\s?[A-Za-zÑ0-9]+)?)';

/** Marca opcional de número: «N°», «N.º», «Nº», «No.» o nada. */
const MARCA_NUMERO = '(?:\\s*N\\s*[.°ºo]{0,2}\\s*)?';

const EXPRESIONES = TIPOS.map((tipo) => ({
  etiqueta: tipo.etiqueta,
  regex: new RegExp(`\\b(?:${tipo.patron})${MARCA_NUMERO}\\s*${NUMERO}`, 'g'),
}));

/** Rango de marcas diacríticas combinantes, para poder quitar los acentos. */
const DIACRITICOS = /[̀-ͯ]/g;

/**
 * El texto de un PDF parte las citas entre dos renglones con frecuencia («Ley»
 * al final de uno y «N° 30225» al comienzo del siguiente). La búsqueda se hace
 * sobre una copia con los saltos convertidos en espacios: al sustituir un
 * carácter por otro, los índices siguen valiendo sobre el texto original.
 */
function aplanar(texto: string): string {
  return texto.replace(/\n/g, ' ');
}

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}

/**
 * Clave de comparación: minúsculas, sin acentos ni signos, y sin los ceros a la
 * izquierda del primer tramo numérico, para que «085-2023-PCM» y «85-2023-PCM»
 * se reconozcan como la misma norma.
 */
export function clavear(tipo: string, numero: string): string {
  const tipoLimpio = sinAcentos(tipo).replace(/[^a-z]/g, '');
  const numeroLimpio = sinAcentos(numero)
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '');

  return `${tipoLimpio}:${numeroLimpio}`;
}

/** Extrae todas las citas normativas del texto, en orden de aparición. */
export function extraerCitas(texto: string): Cita[] {
  const plano = aplanar(texto);
  const encontradas: Cita[] = [];

  // Intervalos ya cubiertos, para que «Directiva General N.º X» no genere
  // además una cita suelta de «Directiva N.º X».
  const cubiertos: [number, number][] = [];

  for (const expresion of EXPRESIONES) {
    expresion.regex.lastIndex = 0;
    let coincidencia: RegExpExecArray | null;

    while ((coincidencia = expresion.regex.exec(plano)) !== null) {
      const inicio = coincidencia.index;
      const fin = inicio + coincidencia[0].length;

      if (cubiertos.some(([a, b]) => inicio < b && fin > a)) continue;
      cubiertos.push([inicio, fin]);

      // El guion de corte de renglón deja un espacio dentro del número.
      const numero = coincidencia[1].replace(/\s+/g, '');

      encontradas.push({
        tipo: expresion.etiqueta,
        numero,
        textoCitado: coincidencia[0].replace(/\s+/g, ' ').trim(),
        clave: clavear(expresion.etiqueta, numero),
        indice: inicio,
        contexto: ventanaDe(plano, inicio, fin),
      });
    }
  }

  return encontradas.sort((a, b) => a.indice - b.indice);
}

/**
 * Deduce la clave de una norma del catálogo aplicándole el mismo reconocimiento
 * que al texto del documento. Así ambos lados se normalizan igual.
 */
export function clavesDeNorma(code: string, aliases: string | null): string[] {
  const fuentes = [code, ...(aliases ? aliases.split('|') : [])];
  const claves = new Set<string>();

  for (const fuente of fuentes) {
    for (const cita of extraerCitas(fuente)) claves.add(cita.clave);
  }

  return [...claves];
}

/**
 * Evidencia textual: la cita con algo de texto alrededor. Se usa una ventana y
 * no el renglón porque una cita partida entre dos renglones quedaría cortada.
 */
function ventanaDe(plano: string, inicio: number, fin: number): string {
  const MARGEN = 90;
  const desde = Math.max(0, inicio - MARGEN);
  const hasta = Math.min(plano.length, fin + MARGEN);

  const fragmento = plano.slice(desde, hasta).replace(/\s+/g, ' ').trim();
  const prefijo = desde > 0 ? '…' : '';
  const sufijo = hasta < plano.length ? '…' : '';

  return `${prefijo}${fragmento}${sufijo}`;
}
