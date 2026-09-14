import 'server-only';

/**
 * Extracción del texto de los formatos que admite el cargador: PDF, DOCX y XLSX.
 *
 * Todas las librerías empleadas son JavaScript puro; no hay binarios que
 * compilar ni servicios externos que invocar, de modo que la extracción corre
 * dentro del mismo proceso de Next.js.
 */

export type FormatoAdmitido = 'pdf' | 'docx' | 'xlsx';

export interface TextoExtraido {
  /** Texto plano del documento, con los saltos de página o de hoja conservados. */
  content: string;
  /** Páginas en un PDF, hojas en un XLSX, párrafos en un DOCX. */
  pageCount: number;
  /** Avisos de la extracción que conviene mostrar al usuario (p. ej. un PDF escaneado). */
  warnings: string[];
}

const EXTENSION_POR_MIME: Record<string, FormatoAdmitido> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * Determina el formato a partir del tipo MIME y, si el navegador no lo envió,
 * de la extensión del nombre del archivo.
 */
export function detectarFormato(fileName: string, mimeType: string): FormatoAdmitido | null {
  const porMime = EXTENSION_POR_MIME[mimeType];
  if (porMime) return porMime;

  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'pdf' || extension === 'docx' || extension === 'xlsx') return extension;
  return null;
}

export async function extraerTexto(buffer: Buffer, formato: FormatoAdmitido): Promise<TextoExtraido> {
  switch (formato) {
    case 'pdf':
      return extraerDePdf(buffer);
    case 'docx':
      return extraerDeDocx(buffer);
    case 'xlsx':
      return extraerDeXlsx(buffer);
  }
}

async function extraerDePdf(buffer: Buffer): Promise<TextoExtraido> {
  const { extractText, getDocumentProxy } = await import('unpdf');

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });

  const paginas = Array.isArray(text) ? text : [text];
  const content = paginas
    .map((pagina, indice) => `--- Página ${indice + 1} ---\n${pagina.trim()}`)
    .join('\n\n');

  const warnings: string[] = [];
  const soloEspacios = paginas.every((pagina) => pagina.trim().length === 0);
  if (soloEspacios) {
    warnings.push(
      'El PDF no contiene texto seleccionable: es un escaneo. Se transcribirá con OCR.',
    );
  }

  return { content, pageCount: totalPages, warnings };
}

/**
 * Avisos de las librerías que no le dicen nada a quien evalúa el documento.
 * «An unrecognised element was ignored: w:tblPrEx» habla de una propiedad de
 * tabla que Word escribe y mammoth no traduce: el texto sale completo igual.
 * Mostrarlos en la ficha, en inglés y con aire de error, hace dudar de una
 * extracción que está bien.
 */
const AVISOS_SIN_VALOR = [
  /unrecognised element was ignored/i,
  /is not a recognised paragraph style/i,
  /unrecognised paragraph style/i,
];

/** Deja solo los avisos que un revisor podría necesitar. */
export function avisosUtiles(avisos: string[]): string[] {
  return avisos.filter((aviso) => !AVISOS_SIN_VALOR.some((patron) => patron.test(aviso)));
}

async function extraerDeDocx(buffer: Buffer): Promise<TextoExtraido> {
  const mammoth = (await import('mammoth')).default;
  const { value, messages } = await mammoth.extractRawText({ buffer });

  const parrafos = value.split('\n').filter((linea) => linea.trim().length > 0);

  return {
    content: value.trim(),
    pageCount: parrafos.length,
    // mammoth avisa de elementos que no supo convertir (imágenes, campos, etc.).
    warnings: avisosUtiles(messages.filter((m) => m.type === 'warning').map((m) => m.message)),
  };
}

async function extraerDeXlsx(buffer: Buffer): Promise<TextoExtraido> {
  const XLSX = await import('xlsx');
  const libro = XLSX.read(buffer, { type: 'buffer' });

  const hojas = libro.SheetNames.map((nombre) => {
    const csv = XLSX.utils.sheet_to_csv(libro.Sheets[nombre]);
    return `--- Hoja: ${nombre} ---\n${csv.trim()}`;
  });

  return {
    content: hojas.join('\n\n'),
    pageCount: libro.SheetNames.length,
    warnings: [],
  };
}
