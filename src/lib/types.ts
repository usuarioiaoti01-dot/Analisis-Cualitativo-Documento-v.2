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
}

export interface CriterionRecord {
  id?: number;
  dimension: string;
  description: string;
  weight: number;
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
}

export interface FindingRecord {
  id: number;
  document_id: string | null;
  dimension: string;
  severity: Severity;
  message: string;
  location: string;
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
