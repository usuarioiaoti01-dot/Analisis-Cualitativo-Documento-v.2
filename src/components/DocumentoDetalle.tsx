'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, FileText, Loader2 } from 'lucide-react';
import {
  EXTRACTION_LABEL,
  STATUS_LABEL,
  type DocumentDetail,
  type ExtractionStatus,
} from '@/lib/types';

const EXTRACTION_TONE: Record<ExtractionStatus, string> = {
  none: 'bg-slate-100 text-slate-600',
  ok: 'bg-sev-low-bg text-sev-low-ink',
  empty: 'bg-sev-medium-bg text-sev-medium-ink',
  failed: 'bg-sev-high-bg text-sev-high-ink',
};

interface DocumentoDetalleProps {
  documentId: string;
  onBack: () => void;
}

export function DocumentoDetalle({ documentId, onBack }: DocumentoDetalleProps) {
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/documents/${documentId}`);
        const payload = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setError(payload.error ?? 'No fue posible cargar el documento.');
          return;
        }
        setDocument(payload.document);
        setError(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (loading) {
    return (
      <section className="card px-6 py-16 text-center text-ink-muted">
        <Loader2 className="mx-auto size-6 animate-spin" aria-hidden />
        <p className="mt-3">Cargando documento…</p>
      </section>
    );
  }

  if (error || !document) {
    return (
      <section className="card px-6 py-16 text-center">
        <p className="text-sm text-sev-high-ink">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Volver al repositorio
        </button>
      </section>
    );
  }

  const metadatos = [
    { label: 'Tipo documental', value: document.document_type },
    { label: 'Estado', value: STATUS_LABEL[document.status] },
    { label: 'Versión', value: `v${document.version}` },
    { label: 'Archivo', value: document.file_name ?? '—' },
    { label: 'Tamaño', value: document.file_size ? formatearTamano(document.file_size) : '—' },
    { label: 'Páginas / hojas', value: document.page_count?.toString() ?? '—' },
    { label: 'Caracteres extraídos', value: document.char_count?.toLocaleString('es-PE') ?? '—' },
    { label: 'Cargado', value: new Date(document.created_at).toLocaleString('es-PE') },
  ];

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver al repositorio
      </button>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold break-words text-ink">{document.title}</h2>
              <span
                className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${EXTRACTION_TONE[document.extraction_status]}`}
              >
                {EXTRACTION_LABEL[document.extraction_status]}
              </span>
            </div>
          </div>

          {document.file_name && (
            <a
              href={`/api/documents/${document.id}/archivo`}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-2 rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
            >
              <ExternalLink className="size-[18px]" aria-hidden />
              Ver original
            </a>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-5 lg:grid-cols-4">
          {metadatos.map((dato) => (
            <div key={dato.label} className="min-w-0">
              <dt className="text-xs text-ink-muted">{dato.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-ink" title={dato.value}>
                {dato.value}
              </dd>
            </div>
          ))}
        </dl>

        {document.extraction_notes && (
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-sev-medium-bg px-4 py-3 text-sm text-sev-medium-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {document.extraction_notes}
          </p>
        )}
      </section>

      <section className="card p-6">
        <h3 className="text-lg font-semibold text-ink">Texto extraído</h3>
        <p className="mt-0.5 text-sm text-ink-muted">
          Contenido que alimentará la evaluación contra la matriz de criterios.
        </p>

        {document.content ? (
          <pre className="mt-5 max-h-[32rem] overflow-auto rounded-lg border border-hairline bg-canvas/50 p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
            {document.content}
          </pre>
        ) : (
          <p className="py-12 text-center text-sm text-ink-muted">
            No hay texto extraído para este documento.
          </p>
        )}
      </section>
    </div>
  );
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
