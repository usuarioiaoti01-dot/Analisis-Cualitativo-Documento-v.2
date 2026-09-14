import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { inTransaction, queryAll, queryOne } from '@/lib/sqlite';
import type { CriterionRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/evaluations/templates/[id] — matriz con sus criterios vigentes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const templateId = Number((await params).id);
  const db = getDb();

  const template = queryOne<{ id: number; name: string; document_type: string; active: 0 | 1 }>(
    db,
    'SELECT id, name, document_type, active FROM templates WHERE id = ?',
    templateId,
  );
  if (!template) {
    return NextResponse.json({ error: 'La matriz no existe.' }, { status: 404 });
  }

  const criteria = queryAll<CriterionRecord>(
    db,
    `SELECT id, dimension, description, weight, indicator, scale_max, rule
     FROM criteria WHERE template_id = ? AND archived = 0 ORDER BY position, id`,
    templateId,
  );

  return NextResponse.json({ template: { ...template, criteria } });
}

/**
 * PUT /api/evaluations/templates/[id] — modifica una matriz existente.
 * Cuerpo: `{ name, document_type, active?, criteria: [{ id?, dimension, description, weight, indicator?, scale_max?, rule? }] }`
 *
 * Los criterios que traen `id` se actualizan, los que no lo traen se crean y
 * los que desaparecen del cuerpo se retiran. Un criterio retirado que ya fue
 * usado en alguna evaluación **no se borra: se archiva**, porque borrarlo
 * dejaría sin explicación los resultados y hallazgos que lo citan.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const templateId = Number((await params).id);

  let body: {
    name?: unknown;
    document_type?: unknown;
    active?: unknown;
    criteria?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const db = getDb();
  const existe = queryOne<{ id: number }>(db, 'SELECT id FROM templates WHERE id = ?', templateId);
  if (!existe) {
    return NextResponse.json({ error: 'La matriz no existe.' }, { status: 404 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const documentType = typeof body.document_type === 'string' ? body.document_type.trim() : '';
  const criteria = Array.isArray(body.criteria) ? (body.criteria as CriterionRecord[]) : [];
  const active = body.active === false || body.active === 0 ? 0 : 1;

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

  const vigentes = queryAll<{ id: number }>(
    db,
    'SELECT id FROM criteria WHERE template_id = ? AND archived = 0',
    templateId,
  ).map((fila) => fila.id);

  const conservados = new Set(
    criteria.map((criterion) => Number(criterion.id)).filter((id) => Number.isInteger(id)),
  );

  let archivados = 0;
  let eliminados = 0;

  inTransaction(db, () => {
    db.prepare('UPDATE templates SET name = ?, document_type = ?, active = ? WHERE id = ?').run(
      name,
      documentType || 'Informe técnico',
      active,
      templateId,
    );

    const actualizar = db.prepare(
      `UPDATE criteria
       SET dimension = ?, description = ?, weight = ?, position = ?,
           indicator = ?, scale_max = ?, rule = ?
       WHERE id = ? AND template_id = ?`,
    );
    const insertar = db.prepare(
      `INSERT INTO criteria
         (template_id, dimension, description, weight, position, indicator, scale_max, rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    criteria.forEach((criterion, index) => {
      const valores = [
        String(criterion.dimension ?? '').trim(),
        String(criterion.description ?? '').trim(),
        Number(criterion.weight ?? 0),
        index,
        criterion.indicator ? String(criterion.indicator).trim() : null,
        Number(criterion.scale_max ?? 5),
        criterion.rule ? String(criterion.rule).trim() : null,
      ] as const;

      const id = Number(criterion.id);
      if (Number.isInteger(id) && vigentes.includes(id)) {
        actualizar.run(...valores, id, templateId);
      } else {
        insertar.run(templateId, ...valores);
      }
    });

    // Criterios retirados: se archivan si tienen historia, se borran si no.
    for (const id of vigentes) {
      if (conservados.has(id)) continue;

      const usos = queryOne<{ total: number }>(
        db,
        'SELECT COUNT(*) AS total FROM evaluation_results WHERE criterion_id = ?',
        id,
      );

      if ((usos?.total ?? 0) > 0) {
        db.prepare('UPDATE criteria SET archived = 1 WHERE id = ?').run(id);
        archivados += 1;
      } else {
        db.prepare('DELETE FROM criteria WHERE id = ?').run(id);
        eliminados += 1;
      }
    }
  });

  return NextResponse.json({
    template: { id: templateId, name, document_type: documentType, active },
    criterios_archivados: archivados,
    criterios_eliminados: eliminados,
  });
}

/**
 * DELETE /api/evaluations/templates/[id] — elimina la matriz.
 *
 * Una matriz que ya se usó en alguna evaluación no se borra: se rechaza con 409
 * y se indica desactivarla. Borrarla dejaría evaluaciones huérfanas, sin forma
 * de saber contra qué criterios se calificó un documento.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const templateId = Number((await params).id);
  const db = getDb();

  const template = queryOne<{ id: number; name: string }>(
    db,
    'SELECT id, name FROM templates WHERE id = ?',
    templateId,
  );
  if (!template) {
    return NextResponse.json({ error: 'La matriz no existe.' }, { status: 404 });
  }

  const usos = queryOne<{ total: number }>(
    db,
    'SELECT COUNT(*) AS total FROM evaluations WHERE template_id = ?',
    templateId,
  );

  if ((usos?.total ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          `«${template.name}» se usó en ${usos?.total} evaluación(es) y no puede eliminarse: ` +
          'los resultados quedarían sin los criterios que los explican. Desactívela para que ' +
          'deje de ofrecerse en evaluaciones nuevas.',
        evaluaciones: usos?.total ?? 0,
      },
      { status: 409 },
    );
  }

  // Sin evaluaciones: el borrado en cascada se lleva sus criterios.
  db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);

  return NextResponse.json({ deleted: templateId });
}
