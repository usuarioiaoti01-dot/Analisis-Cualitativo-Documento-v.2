/**
 * Datos de demostración del panel «Resumen».
 *
 * En el sitio de origen estos valores están incrustados en el front y no
 * provienen de ninguna ruta de API; se conservan aquí tal cual para que la
 * pantalla se vea igual. Cuando el motor de análisis esté conectado, este
 * módulo se reemplaza por una consulta a `/api/documents` y `/api/evaluations`.
 */

import type { DimensionScore, Severity } from './types';

export interface DemoDocument {
  id: string;
  title: string;
  type: string;
  updated: string;
  score: number;
  severity: Severity;
  status: string;
}

export interface DemoFinding {
  severity: Severity;
  dimension: string;
  message: string;
  location: string;
}

export const DEMO_METRICS = [
  { key: 'documentos', label: 'Documentos evaluados', value: '128', hint: '+18 este mes', tone: 'blue' },
  { key: 'evaluaciones', label: 'Evaluaciones activas', value: '14', hint: '6 requieren atención', tone: 'amber' },
  { key: 'hallazgos', label: 'Hallazgos críticos', value: '3', hint: 'Prioridad de atención', tone: 'rose' },
  { key: 'indice', label: 'Índice de calidad', value: '84.6/100', hint: '+2.4 vs. periodo anterior', tone: 'green' },
] as const;

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    id: 'demo-1',
    title: 'Informe técnico de interoperabilidad',
    type: 'Informe técnico',
    updated: 'Hace 18 min',
    score: 86,
    severity: 'medium',
    status: 'En revisión',
  },
  {
    id: 'demo-2',
    title: 'TDR — Servicio de desarrollo SGD',
    type: 'TDR',
    updated: 'Ayer',
    score: 72,
    severity: 'high',
    status: 'Observado',
  },
  {
    id: 'demo-3',
    title: 'Proyecto de Directiva de gestión documental',
    type: 'Proyecto normativo',
    updated: '08 set.',
    score: 94,
    severity: 'low',
    status: 'Conforme',
  },
];

export const DEMO_DIMENSIONS: DimensionScore[] = [
  { dimension: 'Contenido', score: 89 },
  { dimension: 'Estructura', score: 82 },
  { dimension: 'Base legal', score: 76 },
  { dimension: 'Fuentes y citas', score: 91 },
  { dimension: 'Coincidencias', score: 85 },
];

export const DEMO_FINDINGS: DemoFinding[] = [
  {
    severity: 'high',
    dimension: 'Base legal',
    message: 'La cita de la Ley N.º 27444 requiere verificar la versión vigente del artículo 76.',
    location: 'Sección 4.2 · pág. 7',
  },
  {
    severity: 'medium',
    dimension: 'Contenido',
    message: 'El entregable 3 no define evidencia verificable para la conformidad.',
    location: 'Numeral 8.3 · pág. 12',
  },
  {
    severity: 'medium',
    dimension: 'Coincidencia',
    message: 'Similitud del 41% con el TDR 2025-014; se recomienda validar la reutilización.',
    location: 'Repositorio · 2 coincidencias',
  },
];

/** Texto de la tarjeta de validación normativa del panel de resumen. */
export const CATALOG_SUMMARY = {
  count: 382,
  updatedAt: '10 set. 2026',
};
