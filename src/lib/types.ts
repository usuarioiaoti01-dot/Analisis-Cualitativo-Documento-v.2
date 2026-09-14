/** Tipos compartidos entre el front y las rutas de API. */

export type DocumentStatus = 'pending' | 'in_review' | 'observed' | 'compliant';

export type Severity = 'low' | 'medium' | 'high';

/** Tipos documentales admitidos por el evaluador. */
export const DOCUMENT_TYPES = [
  'Informe técnico',
  'TDR',
  'Proyecto normativo',
  'Memorando',
  'Oficio',
  'Directiva',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Resultado de la extracción de texto del archivo cargado. */
export type ExtractionStatus = 'none' | 'ok' | 'empty' | 'failed';

export const EXTRACTION_LABEL: Record<ExtractionStatus, string> = {
  none: 'Sin archivo',
  ok: 'Texto extraído',
  empty: 'Sin texto legible',
  failed: 'Extracción fallida',
};

export interface DocumentRecord {
  id: string;
  title: string;
  status: DocumentStatus;
  version: number;
  created_at: number;
  updated_at: number;
  document_type: string;
  quality_score: number | null;
  severity: Severity | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  page_count: number | null;
  char_count: number | null;
  extraction_status: ExtractionStatus;
  extraction_notes: string | null;
}

/**
 * Ficha de detalle del documento. No incluye el texto completo: ese se pide
 * aparte a `/api/documents/[id]/texto` cuando el usuario lo abre.
 */
export interface DocumentDetail extends DocumentRecord {
  extracted_at: number | null;
}

export interface CriterionRecord {
  id?: number;
  dimension: string;
  description: string;
  weight: number;
  /** Pregunta concreta que debe responder el evaluador. */
  indicator?: string | null;
  /** Tope de la escala ordinal del criterio. */
  scale_max?: number;
  rule?: string | null;
}

/** Resultado cualitativo de un criterio. */
export type CriterionOutcome = 'cumple' | 'parcial' | 'no_cumple' | 'no_aplica';

export const OUTCOME_LABEL: Record<CriterionOutcome, string> = {
  cumple: 'Cumple',
  parcial: 'Cumple parcialmente',
  no_cumple: 'No cumple',
  no_aplica: 'No aplica',
};

/** Nivel de riesgo de un hallazgo. */
export type Risk = 'bajo' | 'medio' | 'alto' | 'critico';

export const RISK_LABEL: Record<Risk, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Crítico',
};

/** Motor que produjo una evaluación. */
export type EvaluationEngine = 'deterministic' | 'ai' | 'manual';

export const ENGINE_LABEL: Record<EvaluationEngine, string> = {
  deterministic: 'Determinista (sin análisis de contenido)',
  ai: 'Asistido por IA',
  manual: 'Manual',
};

/** Origen de un hallazgo. */
export type FindingSource = 'evaluacion' | 'normativa' | 'similitud';

export const SOURCE_LABEL: Record<FindingSource, string> = {
  evaluacion: 'Evaluación de criterios',
  normativa: 'Validación normativa',
  similitud: 'Coincidencia con el repositorio',
};

/** Estado de atención de un hallazgo. */
export type FindingStatus = 'pendiente' | 'aceptado' | 'descartado' | 'subsanado';

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptado',
  descartado: 'Descartado',
  subsanado: 'Subsanado',
};

/** Una sección del documento, tal como quedó tras la segmentación. */
export interface SectionRecord {
  id: number;
  document_id: string;
  ordinal: number;
  numbering: string | null;
  heading: string;
  /** Extracto del cuerpo. El listado no transporta la sección completa. */
  content: string;
  content_length?: number;
  page_from: number | null;
  page_to: number | null;
  char_start: number;
  char_end: number;
}

/** Resultado de un criterio dentro de una evaluación. */
export interface EvaluationResultRecord {
  id: number;
  evaluation_id: string;
  criterion_id: number;
  dimension: string;
  result: CriterionOutcome;
  raw_score: number | null;
  weighted_score: number | null;
  comment: string | null;
  /** Datos del criterio, incorporados por la consulta de detalle. */
  criterion_description?: string;
  criterion_indicator?: string | null;
  criterion_weight?: number;
  scale_max?: number;
}

export interface EvaluationRecord {
  id: string;
  document_id: string;
  template_id: number;
  score: number | null;
  status: DocumentStatus;
  created_at: number;
  engine: EvaluationEngine;
  validated_by: string | null;
  validated_at: number | null;
  validation_note: string | null;
}

export interface TemplateRecord {
  id: number;
  name: string;
  document_type: string;
  active: 0 | 1;
  criteria: CriterionRecord[];
}

export interface NormRecord {
  id: number;
  code: string;
  title: string;
  issuer: string;
  subject: string;
  status: string;
  article: string | null;
  source_url: string | null;
  published_at: number | null;
  effective_from: number | null;
  effective_to: number | null;
  aliases: string | null;
}

/** Coincidencia entre el documento evaluado y otro del repositorio. */
export interface SimilarityRecord {
  id: number;
  document_id: string;
  compared_id: string;
  similarity: number;
  containment: number;
  kind: string;
  fragments: string | null;
  computed_at: number;
}

export interface FindingRecord {
  id: number;
  document_id: string;
  evaluation_id: string | null;
  criterion_id: number | null;
  dimension: string;
  source: FindingSource;
  result: CriterionOutcome | null;
  risk: Risk;
  message: string;
  /** Cita textual exacta del documento que sustenta el hallazgo. */
  evidence_text: string | null;
  /** Ubicación legible: «Sección 4.2 · pág. 7». */
  evidence_location: string | null;
  section_id: number | null;
  recommendation: string | null;
  /** Norma o documento con el que se contrastó. */
  reference_kind: string | null;
  reference_id: string | null;
  reference_label: string | null;
  status: FindingStatus;
  resolved_by: string | null;
  resolved_at: number | null;
  created_at: number;
}

export interface DimensionScore {
  dimension: string;
  score: number;
}

/** Etiquetas en español para los valores que persiste la base. */
export const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  observed: 'Observado',
  compliant: 'Conforme',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
};
