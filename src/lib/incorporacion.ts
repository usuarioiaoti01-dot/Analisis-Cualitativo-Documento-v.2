import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { queryOne } from './sqlite';
import { guardarArchivo } from './almacen';
import { detectarFormato, extraerTexto } from './extraccion';
import { clavesDeNorma } from './citas';
import { detectarMetadatos } from './norma-metadatos';
import type { NormRecord, ResultadoIncorporacion } from './types';

/**
 * Incorporación de una norma al catálogo a partir de su archivo.
 *
 * Vive aquí y no en su ruta porque tiene dos entradas: la carga manual desde
 * la pantalla del catálogo y la traída desde el Inventario Normativo. Las dos
 * deben identificar la norma, detectar duplicados y tratar los complementos
 * con el mismo criterio; si cada una lo hiciera a su manera, el catálogo
 * acabaría con dos clases de fichas.
 */

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const SELECT_NORMA = `
  SELECT id, code, title, issuer, subject, status, article, source_url,
         published_at, effective_from, effective_to, aliases, created_at,
         file_name, storage_path
  FROM norms WHERE id = ?`;

/**
 * Marcas en el nombre del archivo que indican que el documento acompaña a una
 * norma en lugar de serlo. Solo se consultan cuando ya hubo colisión: un
 * nombre que diga «modificatoria» no impide que un documento con código propio
 * se incorpore con él.
 */
const MARCAS_COMPLEMENTO: [RegExp, string][] = [
  [/fe\s*de\s*h?erratas/i, 'Fe de erratas'],
  [/modificaci|modificatoria/i, 'Modificatoria'],
  [/anexo/i, 'Anexo'],
  [/extracto|compendio|parte[\s_-]*\d/i, 'Extracto'],
];

function complementoSegunNombre(fileName: string): string | null {
  const nombre = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const marca = MARCAS_COMPLEMENTO.find(([patron]) => patron.test(nombre));
  if (!marca) return null;

  // «Parte 1» y «Parte 2» del mismo cuerpo son documentos distintos.
  // Los nombres de archivo separan con guion bajo tan a menudo como con espacio.
  const parte = nombre.match(/parte[\s_-]*(\d+)/i);
  return parte ? `${marca[1]} (Parte ${parte[1]})` : marca[1];
}

/** Añade un sufijo si el código compuesto ya existe, para no colisionar. */
function codigoLibre(db: DatabaseSync, propuesto: string): string {
  const existe = (code: string) =>
    Boolean(queryOne<{ id: number }>(db, 'SELECT id FROM norms WHERE code = ?', code));

  if (!existe(propuesto)) return propuesto;

  for (let sufijo = 2; sufijo < 50; sufijo += 1) {
    const candidato = `${propuesto} (${sufijo})`;
    if (!existe(candidato)) return candidato;
  }
  return `${propuesto} (${Date.now()})`;
}

/** Un archivo a incorporar, venga de una carga manual o del inventario. */
export interface ArchivoParaCatalogo {
  nombre: string;
  buffer: Buffer;
  /** Tipo declarado por el navegador, cuando lo hay. */
  tipo?: string;
  /** Procedencia, para dejarla anotada en el resultado. */
  origen?: string;
  /**
   * Ficha que ya trae la fuente. Cuando existe se usa tal cual y no se
   * consulta al modelo: el Inventario Normativo tiene el código y el título
   * curados por quien cargó la norma, y una deducción nuestra solo podría
   * empeorarlos —además de gastar una llamada por archivo—.
   */
  ficha?: {
    code: string;
    title: string;
    issuer?: string | null;
    subject?: string | null;
    /** Papel de este archivo dentro de la norma, si choca con otro ya presente. */
    complemento?: string | null;
    /**
     * Procedencia estable del archivo, p. ej. «inventario://normativos_opr:86».
     * Es lo que permite reconocer que una pieza ya se trajo: el código no
     * sirve, porque las partes de una norma comparten el de su carpeta.
     */
    sourceUrl?: string;
  };
}

export async function incorporarAlCatalogo(
  db: DatabaseSync,
  archivo: ArchivoParaCatalogo,
): Promise<ResultadoIncorporacion> {
  const base = { archivo: archivo.nombre };
  const buffer = archivo.buffer;

  if (buffer.length === 0) {
    return { ...base, estado: 'error', detalle: 'El archivo está vacío.' };
  }
  if (buffer.length > MAX_FILE_SIZE) {
    return { ...base, estado: 'error', detalle: `Supera los ${MAX_FILE_SIZE / 1024 / 1024} MB.` };
  }

  const formato = detectarFormato(archivo.nombre, archivo.tipo ?? '');
  if (!formato) {
    return { ...base, estado: 'error', detalle: 'Formato no admitido. Solo PDF, DOCX o XLSX.' };
  }

  let texto = '';
  try {
    texto = (await extraerTexto(buffer, formato)).content;
  } catch (error) {
    return {
      ...base,
      estado: 'error',
      detalle: error instanceof Error ? error.message : 'No se pudo leer el archivo.',
    };
  }

  if (texto.replace(/--- .*? ---/g, '').trim().length === 0) {
    return {
      ...base,
      estado: 'error',
      detalle: 'El archivo no tiene texto seleccionable: probablemente es un escaneo.',
    };
  }

  const metadatos = archivo.ficha
    ? {
        code: archivo.ficha.code,
        title: archivo.ficha.title,
        issuer: archivo.ficha.issuer?.trim() || 'Por determinar',
        subject: archivo.ficha.subject?.trim() || 'Por determinar',
        requiereRevision: false,
      }
    : await detectarMetadatos(texto, archivo.nombre);

  if (!metadatos) {
    return {
      ...base,
      estado: 'sin_identificar',
      detalle:
        'No se reconoció ningún código de norma en el documento ni en el nombre del archivo. ' +
        'Renombre el archivo incluyendo el código, por ejemplo «Ley N° 29763 …».',
    };
  }

  // Una pieza que ya se trajo de la misma fuente no vuelve a entrar. Se
  // comprueba antes que el código porque las partes de una norma lo comparten,
  // y sin esto cada traída repetida añadía «(2)», «(3)»…
  if (archivo.ficha?.sourceUrl) {
    const yaTraida = queryOne<{ code: string }>(
      db,
      'SELECT code FROM norms WHERE source_url = ?',
      archivo.ficha.sourceUrl,
    );
    if (yaTraida) {
      return {
        ...base,
        estado: 'duplicada',
        detalle: `Ya se había traído; está en el catálogo como «${yaTraida.code}».`,
      };
    }
  }

  // Se compara por la clave normalizada del extractor, no por el texto: así
  // «Ley N° 29763» y «Ley N.º 29763» se reconocen como la misma norma.
  //
  // Los complementos —fe de erratas, modificatorias, anexos— llevan un código
  // compuesto que no es una norma, así que no tienen clave: se comparan por su
  // texto, que ya incluye la norma a la que acompañan.
  const claves = new Set(clavesDeNorma(metadatos.code, null));
  const existentes = db
    .prepare('SELECT id, code, aliases FROM norms')
    .all() as { id: number; code: string; aliases: string | null }[];

  for (const norma of existentes) {
    const coincide =
      claves.size > 0
        ? clavesDeNorma(norma.code, norma.aliases).some((clave) => claves.has(clave))
        : norma.code.trim().toLowerCase() === metadatos.code.trim().toLowerCase();

    if (!coincide) continue;

    // Colisión con una norma ya presente. Antes se descartaba sin más, y con
    // ello se perdían los extractos cuyas primeras páginas reproducen el texto
    // de la norma —«Modificaciones (Parte 1) – Reglamento de la Ley 32069»—,
    // que el modelo identifica como la norma misma. El nombre del archivo dice
    // lo que el contenido no: si declara ser un complemento, se incorpora como
    // tal en lugar de rechazarse.
    // La fuente sabe mejor que el nombre del archivo qué es cada pieza.
    const complemento = archivo.ficha?.complemento ?? complementoSegunNombre(archivo.nombre);
    if (!complemento) {
      return {
        ...base,
        estado: 'duplicada',
        detalle: `Ya estaba en el catálogo como «${norma.code}».`,
      };
    }

    metadatos.code = codigoLibre(db, `${complemento} de ${norma.code}`);
    metadatos.requiereRevision = true;
    break;
  }

  const storagePath = await guardarArchivo(`norma-${randomUUID()}`, formato, buffer);

  const id = Number(
    db
      .prepare(
        `INSERT INTO norms (code, title, issuer, subject, status, created_at, file_name,
                            storage_path, source_url)
         VALUES (?, ?, ?, ?, 'Vigente', ?, ?, ?, ?)`,
      )
      .run(
        metadatos.code,
        metadatos.title,
        metadatos.issuer,
        metadatos.subject,
        Date.now(),
        archivo.nombre,
        storagePath,
        archivo.ficha?.sourceUrl ?? null,
      ).lastInsertRowid,
  );

  return {
    ...base,
    estado: 'incorporada',
    norma: queryOne<NormRecord>(db, SELECT_NORMA, id),
    detalle:
      (archivo.origen ? `Incorporada desde ${archivo.origen}. ` : 'Incorporada. ') +
      (metadatos.requiereRevision
        ? 'El título y el emisor se dedujeron del documento: conviene revisarlos.'
        : ''),
  };
}
