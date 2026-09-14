import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/texto — texto extraído completo.
 *
 * Vive en su propia ruta porque un documento extenso pesa cientos de kilobytes
 * y la ficha de detalle no debe arrastrarlo en cada apertura.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const row = queryOne<{ content: string }>(
    db,
    'SELECT content FROM document_contents WHERE document_id = ?',
    id,
  );

  if (!row) {
    return NextResponse.json({ error: 'El documento no tiene texto extraído.' }, { status: 404 });
  }

  return NextResponse.json({ content: row.content });
}
