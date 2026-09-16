import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll } from '@/lib/sqlite';
import { clavesDeNorma } from '@/lib/citas';
import { incorporarAlCatalogo } from '@/lib/incorporacion';
import {
  ErrorDeInventario,
  descargarDelInventario,
  inventarioConfigurado,
  listarInventario,
  nombreDeArchivo,
  type DocumentoDelInventario,
} from '@/lib/inventario';
import type { ResultadoIncorporacion } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Traer varias normas descarga y analiza cada archivo.
export const maxDuration = 600;

/**
 * GET /api/catalog/inventario — qué hay en el Inventario Normativo y qué de
 * eso falta en este catálogo.
 *
 * La marca «ya está» se calcula por el código de norma que se reconoce en el
 * título de la ficha del inventario, con el mismo extractor que usa la
 * validación de citas. Es una aproximación: el inventario no guarda el código
 * en un campo propio, así que un título sin código se informa como no
 * emparejado y se decide a ojo.
 */
export async function GET() {
  if (!inventarioConfigurado()) {
    return NextResponse.json(
      {
        configurado: false,
        error:
          'El enlace con el Inventario Normativo no está configurado. Defina ' +
          'SACD_INVENTARIO_USUARIO y SACD_INVENTARIO_CLAVE en el servidor con una cuenta ' +
          'de solo lectura del inventario.',
        documentos: [],
      },
      { status: 200 },
    );
  }

  try {
    const documentos = await listarInventario();
    const presentes = clavesDelCatalogo();

    return NextResponse.json({
      configurado: true,
      documentos: documentos.map((documento) => ({
        ...documento,
        ya_en_catalogo: clavesDeNorma(documento.titulo, null).some((clave) => presentes.has(clave)),
      })),
    });
  } catch (error) {
    return responderError(error);
  }
}

/**
 * POST /api/catalog/inventario — trae al catálogo las fichas indicadas.
 *
 * Cuerpo: `{ referencias: ['documentos:12', 'normativos_opr:4'] }`.
 *
 * Cada archivo pasa por la misma incorporación que una carga manual: se
 * identifica la norma con el modelo, se detectan duplicados y los complementos
 * entran como tales. Traer algo dos veces no duplica la ficha.
 */
export async function POST(request: Request) {
  let referencias: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.referencias)) referencias = body.referencias.filter(esTexto);
  } catch {
    // Cuerpo inválido: se trata igual que uno vacío.
  }

  if (referencias.length === 0) {
    return NextResponse.json({ error: 'No se indicó ninguna norma a traer.' }, { status: 400 });
  }

  const db = getDb();

  try {
    const disponibles = new Map(
      (await listarInventario()).map((documento) => [documento.referencia, documento]),
    );

    const resultados: ResultadoIncorporacion[] = [];

    for (const referencia of referencias) {
      const documento = disponibles.get(referencia);

      if (!documento) {
        resultados.push({
          archivo: referencia,
          estado: 'error',
          detalle: 'La ficha ya no está en el inventario.',
        });
        continue;
      }

      resultados.push(await traer(db, documento));
    }

    const incorporadas = resultados.filter((r) => r.estado === 'incorporada').length;
    return NextResponse.json({ resultados, incorporadas }, { status: incorporadas > 0 ? 201 : 200 });
  } catch (error) {
    return responderError(error);
  }
}

async function traer(
  db: ReturnType<typeof getDb>,
  documento: DocumentoDelInventario,
): Promise<ResultadoIncorporacion> {
  try {
    const buffer = await descargarDelInventario(documento.archivo);

    return await incorporarAlCatalogo(db, {
      nombre: nombreDeArchivo(documento),
      buffer,
      origen: 'el Inventario Normativo',
    });
  } catch (error) {
    return {
      archivo: documento.titulo,
      estado: 'error',
      detalle: error instanceof Error ? error.message : 'No se pudo traer el archivo.',
    };
  }
}

/** Claves de las normas que ya están en el catálogo. */
function clavesDelCatalogo(): Set<string> {
  const filas = queryAll<{ code: string; aliases: string | null }>(
    getDb(),
    'SELECT code, aliases FROM norms',
  );

  const claves = new Set<string>();
  for (const fila of filas) {
    for (const clave of clavesDeNorma(fila.code, fila.aliases)) claves.add(clave);
  }
  return claves;
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

function responderError(error: unknown) {
  if (error instanceof ErrorDeInventario) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
