/**
 * Tipos del catálogo normativo.
 *
 * El catálogo es la línea base de conocimiento de las evaluaciones, y una
 * lista única de decenas de documentos no se gobierna: nadie sabe si están
 * todas las directivas o si falta un lineamiento. Separarlo por tipo convierte
 * el catálogo en un inventario revisable —«directivas: 12»— y permite además
 * que la evaluación pida exactamente lo que necesita.
 *
 * Los tipos reúnen dos familias: las normas propiamente dichas (leyes,
 * decretos, resoluciones, directivas…) y los tipos documentales del numeral
 * 7.2 de la Directiva de Gestión Documental del SERFOR, porque un informe
 * legal o un memorando previo también sirven de antecedente al evaluar.
 */

export interface TipoDeCatalogo {
  /** Identificador estable. Es lo que se guarda en la base. */
  id: string;
  /** Rótulo de la pestaña. */
  etiqueta: string;
  /** Singular, para el selector de carga. */
  singular: string;
  /**
   * Formas con que puede llegar escrito el tipo: el tipo que reconoce el
   * extractor de citas, el que declara el Inventario Normativo o el que
   * elige quien carga el archivo.
   */
  patrones: RegExp[];
}

export const TIPOS_DE_CATALOGO: TipoDeCatalogo[] = [
  { id: 'ley', etiqueta: 'LEYES', singular: 'Ley', patrones: [/^ley\b/] },
  {
    id: 'decreto',
    etiqueta: 'DECRETOS',
    singular: 'Decreto',
    patrones: [/^decreto/],
  },
  {
    id: 'resolucion',
    etiqueta: 'RESOLUCIONES',
    singular: 'Resolución',
    patrones: [/^resoluci/, /^r\.?[sdjmg]/],
  },
  {
    id: 'directiva',
    etiqueta: 'DIRECTIVAS',
    singular: 'Directiva',
    patrones: [/^directiva/],
  },
  {
    id: 'lineamiento',
    etiqueta: 'LINEAMIENTOS',
    singular: 'Lineamiento',
    patrones: [/^lineamiento/],
  },
  { id: 'guia', etiqueta: 'GUÍAS', singular: 'Guía', patrones: [/^guia/] },
  { id: 'manual', etiqueta: 'MANUALES', singular: 'Manual', patrones: [/^manual/] },
  {
    id: 'procedimiento',
    etiqueta: 'PROCEDIMIENTOS',
    singular: 'Procedimiento',
    patrones: [/^procedimiento/],
  },
  { id: 'plan', etiqueta: 'PLANES', singular: 'Plan', patrones: [/^plan\b/, /^politica/] },
  {
    id: 'reglamento',
    etiqueta: 'REGLAMENTOS',
    singular: 'Reglamento',
    patrones: [/^reglamento/],
  },

  // Tipos documentales del numeral 7.2 de la directiva de gestión documental.
  { id: 'carta', etiqueta: 'CARTAS', singular: 'Carta', patrones: [/^carta/] },
  {
    id: 'informe',
    etiqueta: 'INFORMES',
    singular: 'Informe',
    patrones: [/^informe/],
  },
  {
    id: 'memorando',
    etiqueta: 'MEMORANDOS',
    singular: 'Memorando',
    patrones: [/^memorando/, /^memorandum/],
  },
  { id: 'oficio', etiqueta: 'OFICIOS', singular: 'Oficio', patrones: [/^oficio/] },

  // Cajón final: sin esto, un tipo nuevo del inventario desaparecería de la
  // vista en lugar de pedir que alguien lo clasifique.
  { id: 'otro', etiqueta: 'OTROS', singular: 'Otro documento', patrones: [] },
];

export const TIPO_POR_OMISION = 'otro';

/**
 * Tipos que son normativa aplicable, frente a los que son correspondencia o
 * antecedentes. Al evaluar un documento, la normativa entera es pertinente;
 * de los documentos de trámite solo lo son los de su mismo tipo, que sirven
 * de precedente.
 */
export const TIPOS_NORMATIVOS = [
  'ley',
  'decreto',
  'resolucion',
  'directiva',
  'lineamiento',
  'reglamento',
  'procedimiento',
  'guia',
  'manual',
  'plan',
];

/** Tipos del catálogo pertinentes al evaluar un documento de este tipo. */
export function tiposPertinentesPara(tipoDocumental: string): string[] {
  const propio = clasificarTipo(tipoDocumental);
  return TIPOS_NORMATIVOS.includes(propio) ? TIPOS_NORMATIVOS : [...TIPOS_NORMATIVOS, propio];
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Clasifica en un tipo del catálogo lo que venga: el identificador exacto, el
 * tipo que reconoció el extractor de citas, el que declara el inventario o el
 * que eligió quien cargó el archivo.
 */
export function clasificarTipo(entrada: string | null | undefined): string {
  if (!entrada) return TIPO_POR_OMISION;

  const limpio = normalizar(entrada);
  if (limpio.length === 0) return TIPO_POR_OMISION;

  const exacto = TIPOS_DE_CATALOGO.find((tipo) => tipo.id === limpio);
  if (exacto) return exacto.id;

  const coincide = TIPOS_DE_CATALOGO.find((tipo) =>
    tipo.patrones.some((patron) => patron.test(limpio)),
  );

  return coincide?.id ?? TIPO_POR_OMISION;
}

export function etiquetaDeTipo(id: string): string {
  return TIPOS_DE_CATALOGO.find((tipo) => tipo.id === id)?.etiqueta ?? 'OTROS';
}
