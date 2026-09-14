import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { guardarArchivo } from '@/lib/almacen';
import { detectarFormato, extraerTexto } from '@/lib/extraccion';
import { clavesDeNorma } from '@/lib/citas';
import { detectarMetadatos } from '@/lib/norma-metadatos';
import type { NormRecord, ResultadoIncorporacion } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Identificar varias normas seguidas consulta al modelo una vez por archivo.
export const maxDuration = 600;

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const SELECT_NORMA = `
  SELECT id, code, title, issuer, subject, status, article, source_url,
         published_at, effective_from, effective_to, aliases, created_at,
         file_name, storage_path
  FROM norms WHERE id = ?`;

/**
 * POST /api/catalog/documentos — incorpora una o varias normas al catálogo a
 * partir de sus archivos.
 *
 * Cada archivo se procesa por separado y con su propio resultado: que uno no se
 * pueda identificar no debe impedir que entren los demás. La respuesta dice
 * qué pasó con cada uno.
 *
 * El código de la norma se reconoce con el mismo extractor que usa la
 * validación de citas, de modo que una norma incorporada aquí se reconozca
 * después en el texto de un documento evaluado.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const archivos = form.getAll('files').filter((valor): valor is File => valor instanceof File);

  if (archivos.length === 0) {
    return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
  }

  const db = getDb();
  const resultados: ResultadoIncorporacion[] = [];

  for (const archivo of archivos) {
    resultados.push(await incorporar(db, archivo));
  }

  const incorporadas = resultados.filter((r) => r.estado === 'incorporada').length;

  return NextResponse.json({ resultados, incorporadas }, { status: incorporadas > 0 ? 201 : 200 });
}

async function incorporar(
  db: ReturnType<typeof getDb>,
  archivo: File,
): Promise<ResultadoIncorporacion> {
  const base = { archivo: archivo.name };

  if (archivo.size === 0) {
    return { ...base, estado: 'error', detalle: 'El archivo está vacío.' };
  }
  if (archivo.size > MAX_FILE_SIZE) {
    return { ...base, estado: 'error', detalle: `Supera los ${MAX_FILE_SIZE / 1024 / 1024} MB.` };
  }

  const formato = detectarFormato(archivo.name, archivo.type);
  if (!formato) {
    return { ...base, estado: 'error', detalle: 'Formato no admitido. Solo PDF, DOCX o XLSX.' };
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());

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

  const metadatos = await detectarMetadatos(texto, archivo.name);
  if (!metadatos) {
    return {
      ...base,
      estado: 'sin_identificar',
      detalle:
        'No se reconoció ningún código de norma en el documento ni en el nombre del archivo. ' +
        'Renombre el archivo incluyendo el código, por ejemplo «Ley N° 29763 …».',
    };
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

    if (coincide) {
      return {
        ...base,
        estado: 'duplicada',
        detalle: `Ya estaba en el catálogo como «${norma.code}».`,
      };
    }
  }

  const storagePath = await guardarArchivo(`norma-${randomUUID()}`, formato, buffer);

  const id = Number(
    db
      .prepare(
        `INSERT INTO norms (code, title, issuer, subject, status, created_at, file_name, storage_path)
         VALUES (?, ?, ?, ?, 'Vigente', ?, ?, ?)`,
      )
      .run(
        metadatos.code,
        metadatos.title,
        metadatos.issuer,
        metadatos.subject,
        Date.now(),
        archivo.name,
        storagePath,
      ).lastInsertRowid,
  );

  return {
    ...base,
    estado: 'incorporada',
    norma: queryOne<NormRecord>(db, SELECT_NORMA, id),
    detalle: metadatos.requiereRevision
      ? 'Incorporada. El título y el emisor se dedujeron del documento: conviene revisarlos.'
      : 'Incorporada.',
  };
}
