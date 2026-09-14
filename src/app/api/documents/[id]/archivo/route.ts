import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { leerArchivo } from '@/lib/almacen';

export const dynamic = 'force-dynamic';

/** GET /api/documents/[id]/archivo — devuelve el archivo original tal como se cargó. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const row = queryOne<{ storage_path: string | null; file_name: string | null; mime_type: string | null }>(
    db,
    'SELECT storage_path, file_name, mime_type FROM documents WHERE id = ?',
    id,
  );

  if (!row) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }
  if (!row.storage_path) {
    return NextResponse.json({ error: 'El documento se registró sin archivo.' }, { status: 404 });
  }

  const buffer = await leerArchivo(row.storage_path);
  if (!buffer) {
    return NextResponse.json(
      { error: 'El archivo ya no se encuentra en el almacén.' },
      { status: 410 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.file_name ?? id)}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
