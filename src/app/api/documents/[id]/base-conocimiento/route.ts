import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll, queryOne } from '@/lib/sqlite';
import { textoEvaluable } from '@/lib/tramite';
import { construirBaseDeConocimiento } from '@/lib/base-conocimiento';
import { tiposPertinentesPara } from '@/lib/tipos-normativos';
import type { SeccionUbicable } from '@/lib/evidencia';

export const dynamic = 'force-dynamic';
// Extraer el texto de las normas que aún no lo tengan lleva unos segundos.
export const maxDuration = 300;

/**
 * GET /api/documents/[id]/base-conocimiento — qué parte del catálogo
 * consultará la evaluación de este documento.
 *
 * Sirve para saber de antemano sobre qué se apoyará el análisis, y después
 * para explicar un hallazgo: si el motor observó algo contra una norma, aquí
 * consta que esa norma estaba a la vista. No ejecuta la evaluación ni consume
 * el motor; solo arma el material.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const documento = queryOne<{ id: string; document_type: string }>(
    db,
    'SELECT id, document_type FROM documents WHERE id = ?',
    id,
  );
  if (!documento) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  const contenido = queryOne<{ content: string }>(
    db,
    'SELECT content FROM document_contents WHERE document_id = ?',
    id,
  );
  if (!contenido) {
    return NextResponse.json(
      { error: 'El documento no tiene texto extraído.' },
      { status: 409 },
    );
  }

  const secciones = queryAll<SeccionUbicable>(
    db,
    `SELECT id, numbering, heading, page_from, char_start, char_end
     FROM document_sections WHERE document_id = ? ORDER BY ordinal`,
    id,
  );

  const evaluable = textoEvaluable(contenido.content, secciones);
  const base = await construirBaseDeConocimiento(db, evaluable.texto, {
    tiposPertinentes: tiposPertinentesPara(documento.document_type),
  });

  return NextResponse.json({
    tipo_documental: documento.document_type,
    catalogo: base.totalCatalogo,
    con_texto: base.incluidas,
    citadas_sin_catalogar: base.citadasSinCatalogar,
    caracteres: base.texto.length,
  });
}
