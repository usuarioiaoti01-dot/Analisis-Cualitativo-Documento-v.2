import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { inTransaction, queryAll, queryOne } from '@/lib/sqlite';
import { guardarArchivo } from '@/lib/almacen';
import { detectarFormato, extraerTexto } from '@/lib/extraccion';
import type { DocumentRecord, ExtractionStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Tamaño máximo del archivo cargado, en bytes. Debe coincidir con el aviso del modal. */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const SELECT_DOCUMENTS = `
  SELECT id, title, status, version, created_at, updated_at, document_type,
         quality_score, severity, file_name, mime_type, file_size,
         page_count, char_count, extraction_status, extraction_notes
  FROM documents
  ORDER BY updated_at DESC`;

/** GET /api/documents — repositorio documental completo, del más reciente al más antiguo. */
export function GET() {
  const db = getDb();
  const documents = queryAll<DocumentRecord>(db, SELECT_DOCUMENTS);

  return NextResponse.json({ documents });
}

/**
 * POST /api/documents — registra un documento.
 *
 * Admite dos formas de envío:
 *  - `multipart/form-data` con los campos `file` y `document_type`: guarda el
 *    archivo, extrae su texto y lo persiste.
 *  - `application/json` con `{ title, document_type }`: registra solo la ficha,
 *    sin archivo. Se conserva por compatibilidad con el contrato anterior.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';

  return contentType.includes('multipart/form-data')
    ? registrarConArchivo(request)
    : registrarSinArchivo(request);
}

async function registrarConArchivo(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  const documentType = leerTipoDocumental(form.get('document_type'));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `El archivo supera los ${MAX_FILE_SIZE / 1024 / 1024} MB permitidos.` },
      { status: 413 },
    );
  }

  const formato = detectarFormato(file.name, file.type);
  if (!formato) {
    return NextResponse.json(
      { error: 'Formato no admitido. Solo se aceptan PDF, DOCX o XLSX.' },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const storagePath = await guardarArchivo(id, formato, buffer);

  // La extracción no debe impedir el registro: si falla, el documento queda
  // guardado con el motivo anotado y se puede reintentar más tarde.
  let content = '';
  let pageCount: number | null = null;
  let extractionStatus: ExtractionStatus = 'failed';
  let extractionNotes: string | null = null;

  try {
    const extraido = await extraerTexto(buffer, formato);
    content = extraido.content;
    pageCount = extraido.pageCount;
    extractionStatus = content.replace(/--- .*? ---/g, '').trim().length > 0 ? 'ok' : 'empty';
    extractionNotes = extraido.warnings.length > 0 ? extraido.warnings.join(' ') : null;
  } catch (error) {
    extractionNotes = error instanceof Error ? error.message : 'Error desconocido en la extracción.';
  }

  const title = file.name.replace(/\.[^.]+$/, '');
  const now = Date.now();
  const db = getDb();

  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO documents (
         id, title, status, version, document_type, created_at, updated_at,
         file_name, mime_type, file_size, storage_path, page_count, char_count,
         extraction_status, extraction_notes
       ) VALUES (?, ?, 'pending', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      title,
      documentType,
      now,
      now,
      file.name,
      file.type || null,
      file.size,
      storagePath,
      pageCount,
      content.length,
      extractionStatus,
      extractionNotes,
    );

    if (content.length > 0) {
      db.prepare(
        'INSERT INTO document_contents (document_id, content, extracted_at) VALUES (?, ?, ?)',
      ).run(id, content, now);
    }
  });

  const document = queryOne<DocumentRecord>(
    db,
    SELECT_DOCUMENTS.replace('ORDER BY updated_at DESC', 'WHERE id = ?'),
    id,
  );

  return NextResponse.json({ document }, { status: 201 });
}

async function registrarSinArchivo(request: Request) {
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

  const db = getDb();
  const now = Date.now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO documents (id, title, status, version, document_type, created_at, updated_at, extraction_status)
     VALUES (?, ?, 'pending', 1, ?, ?, ?, 'none')`,
  ).run(id, title, leerTipoDocumental(body.document_type), now, now);

  const document = queryOne<DocumentRecord>(
    db,
    SELECT_DOCUMENTS.replace('ORDER BY updated_at DESC', 'WHERE id = ?'),
    id,
  );

  return NextResponse.json({ document }, { status: 201 });
}

function leerTipoDocumental(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Informe técnico';
}
