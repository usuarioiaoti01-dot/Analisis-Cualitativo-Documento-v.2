import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { inTransaction } from '@/lib/sqlite';
import type { CriterionRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/evaluations/templates — crea una matriz de evaluación.
 * Cuerpo: { name, document_type, criteria: [{ dimension, description, weight }] }
 *
 * La suma de las ponderaciones debe ser exactamente 100.
 */
export async function POST(request: Request) {
  let body: { name?: unknown; document_type?: unknown; criteria?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const documentType = typeof body.document_type === 'string' ? body.document_type.trim() : '';
  const criteria = Array.isArray(body.criteria) ? (body.criteria as CriterionRecord[]) : [];

  if (!name) {
    return NextResponse.json({ error: 'El nombre de la matriz es obligatorio.' }, { status: 400 });
  }
  if (criteria.length === 0) {
    return NextResponse.json({ error: 'La matriz debe tener al menos un criterio.' }, { status: 400 });
  }

  const totalWeight = criteria.reduce((acc, criterion) => acc + Number(criterion.weight || 0), 0);
  if (totalWeight !== 100) {
    return NextResponse.json(
      { error: `La suma de las ponderaciones debe ser 100%. Suma actual: ${totalWeight}%.` },
      { status: 422 },
    );
  }

  const db = getDb();
  const now = Date.now();

  const templateId = inTransaction(db, () => {
    const id = Number(
      db
        .prepare('INSERT INTO templates (name, document_type, active, created_at) VALUES (?, ?, 1, ?)')
        .run(name, documentType || 'Informe técnico', now).lastInsertRowid,
    );

    const insert = db.prepare(
      'INSERT INTO criteria (template_id, dimension, description, weight, position) VALUES (?, ?, ?, ?, ?)',
    );
    criteria.forEach((criterion, index) => {
      insert.run(
        id,
        String(criterion.dimension ?? '').trim(),
        String(criterion.description ?? '').trim(),
        Number(criterion.weight ?? 0),
        index,
      );
    });

    return id;
  });

  return NextResponse.json(
    { template: { id: templateId, name, document_type: documentType } },
    { status: 201 },
  );
}
