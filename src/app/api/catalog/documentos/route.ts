import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { incorporarAlCatalogo } from '@/lib/incorporacion';
import type { ResultadoIncorporacion } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Identificar varias normas seguidas consulta al modelo una vez por archivo.
export const maxDuration = 600;

/**
 * POST /api/catalog/documentos — incorpora una o varias normas al catálogo a
 * partir de sus archivos.
 *
 * Cada archivo se procesa por separado y con su propio resultado: que uno no se
 * pueda identificar no debe impedir que entren los demás. La respuesta dice
 * qué pasó con cada uno.
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
    resultados.push(
      await incorporarAlCatalogo(db, {
        nombre: archivo.name,
        tipo: archivo.type,
        buffer: Buffer.from(await archivo.arrayBuffer()),
      }),
    );
  }

  const incorporadas = resultados.filter((r) => r.estado === 'incorporada').length;

  return NextResponse.json({ resultados, incorporadas }, { status: incorporadas > 0 ? 201 : 200 });
}
