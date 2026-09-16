import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { inTransaction, queryAll, queryOne } from '@/lib/sqlite';
import { verificarCita, type SeccionUbicable } from '@/lib/evidencia';
import { textoEvaluable } from '@/lib/tramite';
import { ErrorDeContraste, ejecutarContraste } from '@/lib/contraste';
import { construirBaseDeConocimiento } from '@/lib/base-conocimiento';
import { tiposPertinentesPara } from '@/lib/tipos-normativos';
import {
  ErrorDeMotor,
  MODELO,
  evaluarConIa,
  hayCredenciales,
  type CriterioParaEvaluar,
  type ResultadoDelModelo,
} from '@/lib/motor-ia';
import type { CriterionOutcome, CriterionRecord, TemplateRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';
// La evaluación con IA de un documento extenso puede tardar varios minutos.
export const maxDuration = 600;

/**
 * GET /api/evaluations — insumos del módulo de evaluación: los documentos que se
 * pueden evaluar, las matrices disponibles y si el motor con IA está operativo.
 */
export function GET() {
  const db = getDb();

  const documents = queryAll<{ id: string; title: string }>(
    db,
    'SELECT id, title FROM documents ORDER BY updated_at DESC',
  );

  const templates = queryAll<Omit<TemplateRecord, 'criteria'>>(
    db,
    'SELECT id, name, document_type, active FROM templates ORDER BY id',
  );

  const CRITERIA_SQL = `
    SELECT id, dimension, description, weight, indicator, scale_max, rule
    FROM criteria WHERE template_id = ? AND archived = 0 ORDER BY position, id`;

  return NextResponse.json({
    documents,
    templates: templates.map((template) => ({
      ...template,
      criteria: queryAll<CriterionRecord>(db, CRITERIA_SQL, template.id),
    })),
    motor: { ia_disponible: hayCredenciales(), modelo: MODELO },
  });
}

/**
 * POST /api/evaluations — ejecuta una evaluación de un documento con una matriz.
 * Cuerpo: `{ document_id, template_id, engine?: 'ai' | 'deterministic' }`.
 *
 * Con `engine: 'ai'` el motor analiza el texto del documento criterio por
 * criterio y emite hallazgos con evidencia citada; toda cita se verifica
 * literalmente contra el documento antes de guardarse.
 *
 * Con `engine: 'deterministic'` —el motor provisional— el puntaje se deriva del
 * identificador del documento sin leer el contenido, y no se emiten hallazgos.
 */
export async function POST(request: Request) {
  let body: { document_id?: unknown; template_id?: unknown; engine?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const documentId = typeof body.document_id === 'string' ? body.document_id : '';
  const templateId = Number(body.template_id);
  const engine = body.engine === 'deterministic' ? 'deterministic' : 'ai';

  if (!documentId || !Number.isInteger(templateId)) {
    return NextResponse.json({ error: 'Se requieren `document_id` y `template_id`.' }, { status: 400 });
  }

  const db = getDb();

  const documento = queryOne<{ id: string; title: string; document_type: string }>(
    db,
    'SELECT id, title, document_type FROM documents WHERE id = ?',
    documentId,
  );
  if (!documento) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  const criterios = queryAll<CriterioParaEvaluar>(
    db,
    `SELECT id, dimension, description, weight, indicator, scale_max, rule
     FROM criteria WHERE template_id = ? AND archived = 0 ORDER BY position, id`,
    templateId,
  );
  if (criterios.length === 0) {
    return NextResponse.json({ error: 'La matriz no existe o no tiene criterios.' }, { status: 404 });
  }

  return engine === 'ai'
    ? evaluarConMotorIa(db, documento, templateId, criterios)
    : evaluarDeterminista(db, documento.id, templateId, criterios);
}

/* ── Etapa 4: evaluación cualitativa asistida ──────────────────────────── */

async function evaluarConMotorIa(
  db: ReturnType<typeof getDb>,
  documento: { id: string; title: string; document_type: string },
  templateId: number,
  criterios: CriterioParaEvaluar[],
) {
  const contenido = queryOne<{ content: string }>(
    db,
    'SELECT content FROM document_contents WHERE document_id = ?',
    documento.id,
  );
  if (!contenido) {
    return NextResponse.json(
      { error: 'El documento no tiene texto extraído; no hay nada que evaluar.' },
      { status: 409 },
    );
  }

  const secciones = queryAll<SeccionUbicable>(
    db,
    `SELECT id, numbering, heading, page_from, char_start, char_end
     FROM document_sections WHERE document_id = ? ORDER BY ordinal`,
    documento.id,
  );

  // La carátula —número, destinatario, remitente, asunto, fecha— y el pie
  // —copia a terceros, despedida, firma— no son contenido evaluable: sin este
  // recorte el motor observa que el nombre del remitente «no desarrolla su
  // argumento». La evidencia se sigue verificando contra el texto completo,
  // así que las citas conservan su ubicación real.
  const evaluable = textoEvaluable(contenido.content, secciones);

  // El catálogo normativo entra en la evaluación como material de consulta:
  // sin él el motor puede juzgar la forma del documento, pero no si lo que
  // afirma se corresponde con lo que dice la norma que invoca.
  const base = await construirBaseDeConocimiento(db, evaluable.texto, {
    tiposPertinentes: tiposPertinentesPara(documento.document_type),
  });

  let respuesta;
  try {
    respuesta = await evaluarConIa(
      evaluable.texto,
      criterios,
      { titulo: documento.title, tipoDocumental: documento.document_type },
      base.texto,
    );
  } catch (error) {
    if (error instanceof ErrorDeMotor) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const porId = new Map(criterios.map((criterio) => [criterio.id, criterio]));

  const resultados: {
    criterio: CriterioParaEvaluar;
    resultado: CriterionOutcome;
    rawScore: number | null;
    weightedScore: number;
    comentario: string;
    hallazgos: {
      mensaje: string;
      riesgo: string;
      recomendacion: string;
      evidenciaTexto: string;
      evidenciaUbicacion: string;
      seccionId: number | null;
    }[];
  }[] = [];

  let citasDescartadas = 0;

  for (const item of respuesta.resultados) {
    const criterio = porId.get(item.criterio_id);
    if (!criterio) continue; // El motor devolvió un criterio que no se le pidió.

    const rawScore = normalizarPuntaje(item, criterio.scale_max);

    resultados.push({
      criterio,
      resultado: item.resultado,
      rawScore,
      // Un criterio que no aplica no aporta ni resta: se excluye del ponderado.
      weightedScore: rawScore === null ? 0 : (rawScore / criterio.scale_max) * criterio.weight,
      comentario: item.comentario ?? '',
      hallazgos: (item.hallazgos ?? []).flatMap((hallazgo) => {
        const evidencia = verificarCita(contenido.content, secciones, hallazgo.cita_textual ?? '');

        // Sin evidencia verificable no hay hallazgo. Es la regla que impide que
        // una cita inventada llegue al informe.
        if (!evidencia) {
          citasDescartadas += 1;
          return [];
        }

        return [
          {
            mensaje: hallazgo.mensaje,
            riesgo: hallazgo.riesgo,
            recomendacion: hallazgo.recomendacion,
            evidenciaTexto: evidencia.texto,
            evidenciaUbicacion: evidencia.ubicacion,
            seccionId: evidencia.seccionId,
          },
        ];
      }),
    });
  }

  // Una matriz respondida a medias daria un puntaje sobre menos criterios de
  // los aprobados, y se veria igual de valido que uno completo. Se rechaza.
  if (resultados.length !== criterios.length) {
    const faltantes = criterios
      .filter((criterio) => !resultados.some((r) => r.criterio.id === criterio.id))
      .map((criterio) => criterio.description);

    return NextResponse.json(
      {
        error:
          `El motor devolvió ${resultados.length} de ${criterios.length} criterios. ` +
          'La evaluación no se guarda porque el puntaje se habría calculado sobre una matriz ' +
          `incompleta. Sin responder: ${faltantes.join('; ')}.`,
      },
      { status: 502 },
    );
  }

  // Los criterios "no aplica" salen del denominador: de lo contrario el puntaje
  // castigaría al documento por algo que el criterio mismo declara inaplicable.
  const pesoAplicable = resultados
    .filter((r) => r.rawScore !== null)
    .reduce((acc, r) => acc + r.criterio.weight, 0);

  const score =
    pesoAplicable === 0
      ? null
      : Math.round((resultados.reduce((acc, r) => acc + r.weightedScore, 0) / pesoAplicable) * 100);

  return persistir(db, {
    documentId: documento.id,
    templateId,
    engine: 'ai',
    score,
    resultados,
    citasDescartadas,
    base,
    seccionesOmitidas: evaluable.omitidas,
    lineasDePie: evaluable.lineasDePie,
    usage: respuesta.usage,
  });
}

/** Un puntaje fuera de la escala es un error del motor, no un resultado válido. */
function normalizarPuntaje(item: ResultadoDelModelo, scaleMax: number): number | null {
  if (item.resultado === 'no_aplica') return null;
  if (typeof item.puntaje !== 'number' || !Number.isFinite(item.puntaje)) return null;

  return Math.min(scaleMax, Math.max(1, Math.round(item.puntaje)));
}

/* ── Motor provisional ─────────────────────────────────────────────────── */

function evaluarDeterminista(
  db: ReturnType<typeof getDb>,
  documentId: string,
  templateId: number,
  criterios: CriterioParaEvaluar[],
) {
  const resultados = criterios.map((criterio) => {
    const rawScore = puntajeDeterminista(documentId, criterio.id, criterio.scale_max);
    return {
      criterio,
      resultado: resultadoDe(rawScore, criterio.scale_max),
      rawScore,
      weightedScore: (rawScore / criterio.scale_max) * criterio.weight,
      comentario: 'Puntaje provisional: el motor determinista no analiza el contenido del documento.',
      hallazgos: [],
    };
  });

  const pesoTotal = criterios.reduce((acc, criterio) => acc + criterio.weight, 0) || 100;
  const score = Math.round(
    (resultados.reduce((acc, r) => acc + r.weightedScore, 0) / pesoTotal) * 100,
  );

  return persistir(db, {
    documentId,
    templateId,
    engine: 'deterministic',
    score,
    resultados,
    citasDescartadas: 0,
  });
}

/** Puntaje reproducible en la escala del criterio: mismo documento y criterio, mismo valor. */
function puntajeDeterminista(documentId: string, criterionId: number, scaleMax: number): number {
  const base = [...documentId].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100_003, 7);
  // El criterio se mezcla al final: hacerlo al inicio lo diluye en el recorrido
  // de la cadena y todos los criterios acaban con el mismo puntaje.
  const semilla = (base * 31 + criterionId * 7919) % 100_003;

  return 3 + (semilla % Math.max(1, scaleMax - 2));
}

function resultadoDe(rawScore: number, scaleMax: number): CriterionOutcome {
  const proporcion = rawScore / scaleMax;
  if (proporcion >= 0.9) return 'cumple';
  if (proporcion >= 0.6) return 'parcial';
  return 'no_cumple';
}

/* ── Persistencia común a ambos motores ────────────────────────────────── */

interface DatosAPersistir {
  documentId: string;
  templateId: number;
  engine: 'ai' | 'deterministic';
  score: number | null;
  resultados: {
    criterio: CriterioParaEvaluar;
    resultado: CriterionOutcome;
    rawScore: number | null;
    weightedScore: number;
    comentario: string;
    hallazgos: {
      mensaje: string;
      riesgo: string;
      recomendacion: string;
      evidenciaTexto: string;
      evidenciaUbicacion: string;
      seccionId: number | null;
    }[];
  }[];
  citasDescartadas: number;
  /** Catálogo que se puso a disposición del motor. */
  base?: { incluidas: { code: string; motivo: string }[]; totalCatalogo: number };
  /** Secciones de carátula que quedaron fuera del análisis. */
  seccionesOmitidas?: number;
  /** Renglones de pie —copia, despedida, firma— que quedaron fuera. */
  lineasDePie?: number;
  usage?: { entrada: number; cacheEscrito: number; cacheLeido: number; salida: number };
}

function persistir(db: ReturnType<typeof getDb>, datos: DatosAPersistir) {
  const score = datos.score;
  const severity = score === null ? null : score >= 85 ? 'low' : score >= 75 ? 'medium' : 'high';
  const status = score === null ? 'pending' : score >= 85 ? 'compliant' : score >= 75 ? 'in_review' : 'observed';

  const evaluationId = randomUUID();
  const now = Date.now();
  let hallazgosGuardados = 0;

  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO evaluations (id, document_id, template_id, score, status, created_at, engine)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(evaluationId, datos.documentId, datos.templateId, score, status, now, datos.engine);

    const insertResult = db.prepare(
      `INSERT INTO evaluation_results
         (evaluation_id, criterion_id, dimension, result, raw_score, weighted_score, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertFinding = db.prepare(
      `INSERT INTO findings
         (document_id, evaluation_id, criterion_id, dimension, source, result, risk, message,
          evidence_text, evidence_location, section_id, recommendation, status, created_at)
       VALUES (?, ?, ?, ?, 'evaluacion', ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    );

    // Los hallazgos de evaluación se reemplazan; los de las etapas 5 y 6 no se tocan.
    db.prepare("DELETE FROM findings WHERE document_id = ? AND source = 'evaluacion'").run(
      datos.documentId,
    );

    for (const resultado of datos.resultados) {
      insertResult.run(
        evaluationId,
        resultado.criterio.id,
        resultado.criterio.dimension,
        resultado.resultado,
        resultado.rawScore,
        resultado.rawScore === null ? null : resultado.weightedScore,
        resultado.comentario,
      );

      for (const hallazgo of resultado.hallazgos) {
        insertFinding.run(
          datos.documentId,
          evaluationId,
          resultado.criterio.id,
          resultado.criterio.dimension,
          resultado.resultado,
          hallazgo.riesgo,
          hallazgo.mensaje,
          hallazgo.evidenciaTexto,
          hallazgo.evidenciaUbicacion,
          hallazgo.seccionId,
          hallazgo.recomendacion,
          now,
        );
        hallazgosGuardados += 1;
      }
    }

    db.prepare(
      'UPDATE documents SET status = ?, quality_score = ?, severity = ?, updated_at = ? WHERE id = ?',
    ).run(status, score, severity, now, datos.documentId);
  });

  // Etapas 5 y 6, a continuación de la 4. Son deterministas y rápidas, y sin
  // ellas la evaluación deja sin comprobar las citas y las coincidencias con
  // el repositorio. Corren también con el motor provisional: no dependen del
  // análisis del contenido.
  //
  // Un fallo aquí no invalida la evaluación, que ya está guardada: se informa
  // y se sigue, porque perder el puntaje por un tropiezo del contraste sería
  // peor que quedarse sin contraste.
  let contraste: ReturnType<typeof ejecutarContraste> | null = null;
  let avisoContraste: string | null = null;

  try {
    contraste = ejecutarContraste(db, datos.documentId);
  } catch (error) {
    avisoContraste =
      error instanceof ErrorDeContraste
        ? error.message
        : 'No fue posible ejecutar el contraste normativo y de repositorio.';
  }

  return NextResponse.json(
    {
      evaluation: {
        id: evaluationId,
        document_id: datos.documentId,
        template_id: datos.templateId,
        score,
        status,
        engine: datos.engine,
      },
      resumen: {
        criterios: datos.resultados.length,
        hallazgos: hallazgosGuardados,
        contraste: contraste
          ? { hallazgos: contraste.hallazgos, ...contraste.resumen }
          : null,
        ...(avisoContraste ? { aviso_contraste: avisoContraste } : {}),
        citas_descartadas: datos.citasDescartadas,
        secciones_omitidas: datos.seccionesOmitidas ?? 0,
        catalogo: datos.base
          ? {
              normas: datos.base.totalCatalogo,
              con_texto: datos.base.incluidas.length,
              citadas: datos.base.incluidas.filter((n) => n.motivo === 'citada').length,
            }
          : null,
        lineas_de_pie: datos.lineasDePie ?? 0,
        ...(datos.usage ? { tokens: datos.usage } : {}),
      },
    },
    { status: 201 },
  );
}
