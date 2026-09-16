import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { ErrorDeConversion, pdfDelDocumento } from '@/lib/pdf';

export const dynamic = 'force-dynamic';
// Convertir un documento extenso con Office puede tardar varios segundos.
export const maxDuration = 180;

/**
 * GET /api/documents/[id]/pdf — el documento en PDF, para la vista previa.
 *
 * Si el original ya es PDF se devuelve tal cual; si no, se convierte una vez y
 * la conversión queda en caché. El error viaja como JSON para que la ventana
 * de vista previa pueda explicarlo en lugar de mostrar un visor en blanco.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const row = queryOne<{ storage_path: string | null; file_name: string | null }>(
    db,
    'SELECT storage_path, file_name FROM documents WHERE id = ?',
    id,
  );

  if (!row) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }
  if (!row.storage_path) {
    return NextResponse.json({ error: 'El documento se registró sin archivo.' }, { status: 404 });
  }

  try {
    const ruta = await pdfDelDocumento(row.storage_path);
    const pdf = await fs.readFile(ruta);
    const nombre = (row.file_name ?? id).replace(/\.[^.]+$/, '');

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`${nombre}.pdf`)}`,
        'Content-Length': String(pdf.length),
      },
    });
  } catch (error) {
    if (error instanceof ErrorDeConversion) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
