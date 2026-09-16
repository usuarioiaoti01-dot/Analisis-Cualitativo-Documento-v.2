import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FormatoAdmitido } from './extraccion';

/**
 * Almacén de los archivos originales. Se guarda el binario tal como llegó, con
 * el identificador del documento como nombre, para que el expediente siempre
 * pueda volver a la fuente y la extracción pueda repetirse.
 */

function baseDir(): string {
  const configured = process.env.SACD_UPLOAD_DIR ?? './data/uploads';
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

/** Guarda el archivo y devuelve su ruta relativa a la raíz del proyecto. */
export async function guardarArchivo(
  documentId: string,
  formato: FormatoAdmitido,
  buffer: Buffer,
): Promise<string> {
  const directorio = baseDir();
  await fs.mkdir(directorio, { recursive: true });

  const destino = path.join(directorio, `${documentId}.${formato}`);
  await fs.writeFile(destino, buffer);

  return path.relative(process.cwd(), destino).replace(/\\/g, '/');
}

/** Lee un archivo previamente guardado. Devuelve `null` si ya no existe en disco. */
export async function leerArchivo(storagePath: string): Promise<Buffer | null> {
  const absoluto = path.isAbsolute(storagePath)
    ? storagePath
    : path.join(process.cwd(), storagePath);

  try {
    return await fs.readFile(absoluto);
  } catch {
    return null;
  }
}

/** Borra el archivo asociado a un documento; no falla si ya no está. */
export async function borrarArchivo(storagePath: string): Promise<void> {
  const absoluto = path.isAbsolute(storagePath)
    ? storagePath
    : path.join(process.cwd(), storagePath);

  await fs.rm(absoluto, { force: true });

  // La conversión a PDF de la vista previa vive junto al original: borrar uno
  // sin el otro dejaría copias del documento en un expediente ya eliminado.
  const extension = path.extname(absoluto);
  if (extension.toLowerCase() !== '.pdf') {
    await fs.rm(`${absoluto.slice(0, -extension.length)}.vista.pdf`, { force: true });
  }
}
