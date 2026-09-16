import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll, queryOne } from '@/lib/sqlite';
import type { DocumentoReciente } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Ventana con la que se compara el índice de calidad para informar su variación. */
const DIAS_DEL_PERIODO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Evaluación más reciente de cada documento. El panel resume el estado actual
 * del repositorio, no su historia: una reevaluación sustituye a la anterior.
 */
const ULTIMAS_EVALUACIONES = `
  SELECT id, document_id, score, created_at
  FROM evaluations e
  WHERE e.created_at = (
    SELECT MAX(created_at) FROM evaluations WHERE document_id = e.document_id
  )`;

/**
 * GET /api/summary — cifras del panel de resumen, calculadas sobre la base.
 *
 * Todo lo que devuelve sale de datos reales. Con el repositorio vacío devuelve
 * ceros y listas vacías, que es lo correcto: un panel que muestra cifras de
 * ejemplo sobre una base vacía es peor que uno que muestra cero.
 */
export function GET() {
  const db = getDb();
  const ahora = Date.now();

  /* ── Documentos evaluados ─────────────────────────────────────────────── */

  const evaluados = queryOne<{ total: number }>(
    db,
    'SELECT COUNT(DISTINCT document_id) AS total FROM evaluations',
  );

  const inicioDelMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const nuevosEsteMes = queryOne<{ total: number }>(
    db,
    'SELECT COUNT(*) AS total FROM documents WHERE created_at >= ?',
    inicioDelMes,
  );

  /* ── Evaluaciones activas ─────────────────────────────────────────────── */

  // Activa: la evaluación vigente de un documento que todavía no fue validado
  // por una persona. La etapa 7 es la que cerrará este ciclo.
  const activas = queryOne<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM (${ULTIMAS_EVALUACIONES}) u
     JOIN evaluations e ON e.id = u.id
     WHERE e.validated_at IS NULL`,
  );

  const requierenAtencion = queryOne<{ total: number }>(
    db,
    `SELECT COUNT(DISTINCT document_id) AS total
     FROM findings WHERE status = 'pendiente'`,
  );

  /* ── Hallazgos críticos ───────────────────────────────────────────────── */

  const criticos = queryOne<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM findings
     WHERE status = 'pendiente' AND risk IN ('alto', 'critico')`,
  );

  /* ── Índice de calidad ────────────────────────────────────────────────── */

  const indice = queryOne<{ promedio: number | null }>(
    db,
    `SELECT AVG(score) AS promedio FROM (${ULTIMAS_EVALUACIONES}) WHERE score IS NOT NULL`,
  );

  const corte = ahora - DIAS_DEL_PERIODO * MS_POR_DIA;
  const periodoActual = queryOne<{ promedio: number | null }>(
    db,
    'SELECT AVG(score) AS promedio FROM evaluations WHERE score IS NOT NULL AND created_at >= ?',
    corte,
  );
  const periodoAnterior = queryOne<{ promedio: number | null }>(
    db,
    `SELECT AVG(score) AS promedio FROM evaluations
     WHERE score IS NOT NULL AND created_at >= ? AND created_at < ?`,
    corte - DIAS_DEL_PERIODO * MS_POR_DIA,
    corte,
  );

  // La variación solo tiene sentido si hay con qué comparar.
  const variacion =
    periodoActual?.promedio != null && periodoAnterior?.promedio != null
      ? Number((periodoActual.promedio - periodoAnterior.promedio).toFixed(1))
      : null;

  /* ── Documentos recientes ─────────────────────────────────────────────── */

  const documentosRecientes = queryAll<DocumentoReciente>(
    db,
    `SELECT id, title, document_type, updated_at, quality_score, severity, status
     FROM documents ORDER BY updated_at DESC LIMIT 5`,
  );

  /* ── Calidad por dimensión ────────────────────────────────────────────── */

  // Cada criterio se normaliza a porcentaje sobre su propia escala antes de
  // promediar: sin eso, una matriz con escala distinta desviaría el promedio.
  const dimensiones = queryAll<{ dimension: string; promedio: number }>(
    db,
    `SELECT r.dimension AS dimension,
            AVG(r.raw_score * 100.0 / c.scale_max) AS promedio
     FROM evaluation_results r
     JOIN criteria c ON c.id = r.criterion_id
     WHERE r.evaluation_id IN (SELECT id FROM (${ULTIMAS_EVALUACIONES}))
       AND r.raw_score IS NOT NULL
     GROUP BY r.dimension
     ORDER BY MIN(c.position)`,
  );

  /* ── Catálogo normativo ───────────────────────────────────────────────── */

  const catalogo = queryOne<{ total: number; actualizado: number | null }>(
    db,
    'SELECT COUNT(*) AS total, MAX(created_at) AS actualizado FROM norms',
  );

  return NextResponse.json({
    metricas: {
      documentos_evaluados: {
        valor: evaluados?.total ?? 0,
        nuevos_este_mes: nuevosEsteMes?.total ?? 0,
      },
      evaluaciones_activas: {
        valor: activas?.total ?? 0,
        requieren_atencion: requierenAtencion?.total ?? 0,
      },
      hallazgos_criticos: { valor: criticos?.total ?? 0 },
      indice_calidad: {
        valor: indice?.promedio != null ? Number(indice.promedio.toFixed(1)) : null,
        variacion,
      },
    },
    documentos_recientes: documentosRecientes,
    dimensiones: dimensiones.map((fila) => ({
      dimension: fila.dimension,
      promedio: Math.round(fila.promedio),
    })),
    catalogo: { normas: catalogo?.total ?? 0, actualizado_en: catalogo?.actualizado ?? null },
  });
}
