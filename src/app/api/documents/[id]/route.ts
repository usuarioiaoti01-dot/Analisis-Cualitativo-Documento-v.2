import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { borrarArchivo } from '@/lib/almacen';
import type { DocumentDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SELECT_DETAIL = `
  SELECT d.id, d.title, d.status, d.version, d.created_at, d.updated_at, d.document_type,
         d.quality_score, d.severity, d.file_name, d.mime_type, d.file_size,
         d.page_count, d.char_count, d.extraction_status, d.extraction_notes,
         c.content, c.extracted_at
  FROM documents d
  LEFT JOIN document_contents c ON c.document_id = d.id
  WHERE d.id = ?`;

/** GET /api/documents/[id] — ficha del documento con su texto extraído. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const document = queryOne<DocumentDetail>(db, SELECT_DETAIL, id);
  if (!document) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  return NextResponse.json({ document });
}

/** DELETE /api/documents/[id] — elimina el documento, su texto y el archivo original. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const row = queryOne<{ storage_path: string | null }>(
    db,
    'SELECT storage_path FROM documents WHERE id = ?',
    id,
  );
  if (!row) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  // El borrado en cascada se encarga de `document_contents`, `evaluations` y `findings`.
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  if (row.storage_path) await borrarArchivo(row.storage_path);

  return NextResponse.json({ deleted: id });
}
