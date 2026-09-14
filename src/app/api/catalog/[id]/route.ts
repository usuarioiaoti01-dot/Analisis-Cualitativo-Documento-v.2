import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { borrarArchivo } from '@/lib/almacen';
import type { NormRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SELECT_NORMA = `
  SELECT id, code, title, issuer, subject, status, article, source_url,
         published_at, effective_from, effective_to, aliases, created_at,
         file_name, storage_path
  FROM norms WHERE id = ?`;

/** Campos que el evaluador puede corregir desde el catálogo. */
const EDITABLES = ['code', 'title', 'issuer', 'subject', 'status', 'aliases'] as const;

/**
 * PATCH /api/catalog/[id] — corrige los datos de una norma.
 *
 * La identificación automática acierta casi siempre en el código y falla con
 * más frecuencia en el título y el emisor. Sin una forma de corregirlos, una
 * norma mal identificada solo podría eliminarse y volver a subirse para
 * obtener el mismo resultado.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const normId = Number((await params).id);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const db = getDb();
  if (!queryOne<{ id: number }>(db, 'SELECT id FROM norms WHERE id = ?', normId)) {
    return NextResponse.json({ error: 'La norma no existe.' }, { status: 404 });
  }

  const cambios: [string, string | null][] = [];
  for (const campo of EDITABLES) {
    if (!(campo in body)) continue;
    const valor = body[campo];
    if (typeof valor !== 'string') continue;

    const limpio = valor.trim();
    // El código y el título identifican la norma: no pueden quedar vacíos.
    if (limpio === '' && (campo === 'code' || campo === 'title')) {
      return NextResponse.json(
        { error: `El campo «${campo}» no puede quedar vacío.` },
        { status: 400 },
      );
    }
    cambios.push([campo, limpio === '' ? null : limpio]);
  }

  if (cambios.length === 0) {
    return NextResponse.json({ error: 'No se recibió ningún campo editable.' }, { status: 400 });
  }

  try {
    db.prepare(
      `UPDATE norms SET ${cambios.map(([campo]) => `${campo} = ?`).join(', ')} WHERE id = ?`,
    ).run(...cambios.map(([, valor]) => valor), normId);
  } catch {
    // `code` es único: dos normas no pueden compartirlo.
    return NextResponse.json(
      { error: 'Ya existe otra norma con ese código en el catálogo.' },
      { status: 409 },
    );
  }

  return NextResponse.json({ norm: queryOne<NormRecord>(db, SELECT_NORMA, normId) });
}

/** DELETE /api/catalog/[id] — retira una norma del catálogo y borra su archivo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const normId = Number((await params).id);
  const db = getDb();

  const norma = queryOne<{ id: number; storage_path: string | null }>(
    db,
    'SELECT id, storage_path FROM norms WHERE id = ?',
    normId,
  );
  if (!norma) {
    return NextResponse.json({ error: 'La norma no existe.' }, { status: 404 });
  }

  db.prepare('DELETE FROM norms WHERE id = ?').run(normId);
  if (norma.storage_path) await borrarArchivo(norma.storage_path);

  return NextResponse.json({ deleted: normId });
}
