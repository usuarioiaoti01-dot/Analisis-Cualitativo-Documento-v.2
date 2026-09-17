import type { CriterionOutcome } from './types';

/**
 * Reglas de veredicto de la skill «analisis-documental-general».
 *
 * Están aquí, sin dependencias del servidor ni del modelo, porque son reglas y
 * no juicios: el escalamiento a revisión humana y la consolidación de la
 * dimensión se calculan igual siempre y deben poder probarse sin llamar a
 * nadie. Pedírselas al modelo las haría variables, que es justo lo contrario
 * de lo que el procedimiento exige.
 */

/** Veredictos de la skill, en los estados que persiste la aplicación. */
export const VEREDICTOS: Record<string, CriterionOutcome> = {
  C: 'cumple',
  CP: 'parcial',
  NC: 'no_cumple',
  NA: 'no_aplica',
  NE: 'no_evaluable',
};

/** Por debajo de esta confianza, el criterio lo revisa una persona. */
export const CONFIANZA_MINIMA = 0.7;

/** Recorta la confianza al rango admitido; nula si el modelo no la informó. */
export function normalizarConfianza(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  return Math.min(1, Math.max(0, Number(valor.toFixed(2))));
}

export interface CriterioValorado {
  resultado: CriterionOutcome;
  criticidad?: string | null;
}

/**
 * Escalamiento a revisión humana: todo NE, todo NC de criticidad alta y toda
 * confianza inferior a 0,70.
 */
export function escalamiento(
  resultado: CriterionOutcome,
  criticidad: string | null | undefined,
  confianza: number | null,
): { escalado: boolean; motivoEscalamiento: string | null } {
  if (resultado === 'no_evaluable') {
    return { escalado: true, motivoEscalamiento: 'Veredicto NE: no se halló evidencia' };
  }
  if (resultado === 'no_cumple' && criticidad === 'alta') {
    return { escalado: true, motivoEscalamiento: 'NC de criticidad alta' };
  }
  if (confianza !== null && confianza < CONFIANZA_MINIMA) {
    return { escalado: true, motivoEscalamiento: `Confianza ${confianza.toFixed(2)} < 0,70` };
  }
  return { escalado: false, motivoEscalamiento: null };
}

/**
 * Consolidación de la dimensión. **No es un promedio**: un solo incumplimiento
 * de criticidad alta basta para no cumplir, y los NE no cuentan como
 * cumplimiento —bloquean el «Cumple» hasta que los resuelva una persona—.
 */
export function consolidar(criterios: CriterioValorado[]): { resultado: string; regla: string } {
  const aplicables = criterios.filter((criterio) => criterio.resultado !== 'no_aplica');
  if (aplicables.length === 0) {
    return { resultado: 'No evaluable', regla: 'Ningún criterio resultó aplicable' };
  }

  const noCumple = aplicables.filter((criterio) => criterio.resultado === 'no_cumple');

  if (noCumple.some((criterio) => criterio.criticidad === 'alta')) {
    return { resultado: 'No cumple', regla: 'Existe al menos un criterio NC de criticidad alta' };
  }
  if (noCumple.length / aplicables.length >= 0.4) {
    return { resultado: 'No cumple', regla: 'El 40 % o más de los criterios aplicables está en NC' };
  }

  const sinEvaluar = aplicables.filter((criterio) => criterio.resultado === 'no_evaluable');
  if (sinEvaluar.length > 0) {
    return {
      resultado: 'Cumple parcialmente',
      regla:
        `${sinEvaluar.length} criterio(s) en NE: no cuentan como cumplimiento y esperan ` +
        'revisión humana',
    };
  }
  if (aplicables.some((criterio) => criterio.resultado === 'parcial')) {
    return { resultado: 'Cumple parcialmente', regla: 'Hay CP o NC, ninguno de criticidad alta' };
  }
  if (noCumple.length > 0) {
    return { resultado: 'Cumple parcialmente', regla: 'Hay CP o NC, ninguno de criticidad alta' };
  }

  return { resultado: 'Cumple', regla: 'Todos los criterios aplicables en C' };
}
