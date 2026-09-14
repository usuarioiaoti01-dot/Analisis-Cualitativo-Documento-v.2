import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { queryAll, queryOne } from '@/lib/sqlite';
import type { DocumentRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/documents — repositorio documental completo, del más reciente al más antiguo. */
export function GET() {
  const db = getDb();
  const documents = queryAll<DocumentRecord>(
    db,
    `SELECT id, title, status, version, created_at, updated_at, document_type, quality_score, severity
     FROM documents
     ORDER BY updated_at DESC`,
  );

  return NextResponse.json({ documents });
}

/**
 * POST /api/documents — registra un documento en el repositorio.
 * Cuerpo: { title: string, document_type?: string }
 */
export async function POST(request: Request) {
  let body: { title?: unknown; document_type?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'El título del documento es obligatorio.' }, { status: 400 });
  }

  const documentType =
    typeof body.document_type === 'string' && body.document_type.trim()
      ? body.document_type.trim()
      : 'Informe técnico';

  const db = getDb();
  const now = Date.now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO documents (id, title, status, version, document_type, created_at, updated_at)
     VALUES (?, ?, 'pending', 1, ?, ?, ?)`,
  ).run(id, title, documentType, now, now);

  const document = queryOne<DocumentRecord>(db, 'SELECT * FROM documents WHERE id = ?', id);
  return NextResponse.json({ document }, { status: 201 });
}
