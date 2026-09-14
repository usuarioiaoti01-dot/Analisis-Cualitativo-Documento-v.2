import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { inTransaction, queryOne } from '@/lib/sqlite';
import { leerArchivo } from '@/lib/almacen';
import { guardarTextoYSecciones } from '@/lib/contenido';
import { ErrorDeOcr, transcribirPdf } from '@/lib/ocr';

export const dynamic = 'force-dynamic';
// Transcribir decenas de páginas escaneadas puede tardar varios minutos.
export const maxDuration = 900;

/**
 * POST /api/documents/[id]/ocr — transcribe el escaneo de un documento ya
 * cargado y sustituye su texto y sus secciones.
 *
 * La carga intenta la transcripción por su cuenta cuando detecta un PDF sin
 * capa de texto. Esta ruta existe para los documentos que se cargaron antes de
 * que hubiera OCR, o cuando faltaba la credencial en ese momento.
 *
 * Al rehacer el texto, los hallazgos previos dejan de corresponder a él: sus
 * citas apuntan a posiciones de un texto que ya no existe. Por eso se eliminan.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const documento = queryOne<{
    id: string;
    storage_path: string | null;
    page_count: number | null;
    extraction_status: string;
  }>(
    db,
    'SELECT id, storage_path, page_count, extraction_status FROM documents WHERE id = ?',
    id,
  );

  if (!documento) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }
  if (!documento.storage_path) {
    return NextResponse.json(
      { error: 'El documento se registró sin archivo: no hay nada que transcribir.' },
      { status: 409 },
    );
  }
  if (!documento.storage_path.endsWith('.pdf')) {
    return NextResponse.json(
      { error: 'La transcripción solo aplica a archivos PDF.' },
      { status: 415 },
    );
  }

  const buffer = await leerArchivo(documento.storage_path);
  if (!buffer) {
    return NextResponse.json(
      { error: 'El archivo original ya no se encuentra en el almacén.' },
      { status: 410 },
    );
  }

  let transcrito;
  try {
    transcrito = await transcribirPdf(buffer, documento.page_count ?? 0);
  } catch (error) {
    if (error instanceof ErrorDeOcr) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const ahora = Date.now();
  let secciones = 0;

  inTransaction(db, () => {
    secciones = guardarTextoYSecciones(db, id, transcrito.content, ahora);

    // Los hallazgos citan posiciones del texto anterior; con otro texto dejan
    // de ser verificables y deben rehacerse.
    db.prepare('DELETE FROM findings WHERE document_id = ?').run(id);

    db.prepare(
      `UPDATE documents
       SET extraction_status = 'ocr', extraction_notes = ?, char_count = ?, updated_at = ?
       WHERE id = ?`,
    ).run(transcrito.warnings.join(' '), transcrito.content.length, ahora, id);
  });

  return NextResponse.json({
    transcrito: {
      caracteres: transcrito.content.length,
      secciones,
      avisos: transcrito.warnings,
    },
  });
}
