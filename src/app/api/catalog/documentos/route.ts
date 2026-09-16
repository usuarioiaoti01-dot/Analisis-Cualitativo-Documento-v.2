import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { incorporarAlCatalogo } from '@/lib/incorporacion';
import { TIPOS_DE_CATALOGO } from '@/lib/tipos-normativos';
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
 *
 * El campo `doc_type` es obligatorio: el catálogo se organiza por tipo y una
 * norma sin tipo acaba en «otros», donde nadie la busca. Deducirlo del archivo
 * sería adivinar justo lo que quien carga sabe con certeza.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const archivos = form.getAll('files').filter((valor): valor is File => valor instanceof File);

  if (archivos.length === 0) {
    return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
  }

  const docType = String(form.get('doc_type') ?? '');
  if (!TIPOS_DE_CATALOGO.some((tipo) => tipo.id === docType)) {
    return NextResponse.json(
      { error: 'Elija el tipo documental al que pertenecen los archivos.' },
      { status: 400 },
    );
  }

  const db = getDb();
  const resultados: ResultadoIncorporacion[] = [];

  for (const archivo of archivos) {
    resultados.push(
      await incorporarAlCatalogo(db, {
        nombre: archivo.name,
        tipo: archivo.type,
        buffer: Buffer.from(await archivo.arrayBuffer()),
        docType,
      }),
    );
  }

  const incorporadas = resultados.filter((r) => r.estado === 'incorporada').length;

  return NextResponse.json({ resultados, incorporadas }, { status: incorporadas > 0 ? 201 : 200 });
}
