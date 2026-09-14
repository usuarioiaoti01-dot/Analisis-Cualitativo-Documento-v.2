'use client';

import { ChevronRight, Loader2, Plus } from 'lucide-react';
import {
  EXTRACTION_LABEL,
  STATUS_LABEL,
  type DocumentRecord,
  type DocumentStatus,
  type ExtractionStatus,
} from '@/lib/types';

const STATUS_TONE: Record<DocumentStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_review: 'bg-blue-50 text-blue-700',
  observed: 'bg-sev-medium-bg text-sev-medium-ink',
  compliant: 'bg-sev-low-bg text-sev-low-ink',
};

const EXTRACTION_TONE: Record<ExtractionStatus, string> = {
  none: 'text-ink-muted',
  ok: 'text-sev-low-ink',
  empty: 'text-sev-medium-ink',
  failed: 'text-sev-high-ink',
};

interface DocumentosViewProps {
  documents: DocumentRecord[];
  loading: boolean;
  onRegister: () => void;
  onOpen: (documentId: string) => void;
}

export function DocumentosView({ documents, loading, onRegister, onOpen }: DocumentosViewProps) {
  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Repositorio documental</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Documentos registrados para evaluación y trazabilidad.
          </p>
        </div>
        <button
          type="button"
          onClick={onRegister}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          <Plus className="size-[18px]" aria-hidden />
          Registrar documento
        </button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead>
            <tr className="bg-canvas/70 text-[0.6875rem] tracking-[0.12em] text-ink-muted uppercase">
              <th className="px-5 py-3 font-semibold">Documento</th>
              <th className="px-5 py-3 font-semibold">Tipo</th>
              <th className="px-5 py-3 font-semibold">Versión</th>
              <th className="px-5 py-3 font-semibold">Texto</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-ink-muted">
                  <Loader2 className="mx-auto size-6 animate-spin" aria-hidden />
                  <p className="mt-3">Cargando repositorio…</p>
                </td>
              </tr>
            )}

            {!loading && documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-ink-muted">
                  Aún no hay documentos registrados.
                </td>
              </tr>
            )}

            {!loading &&
              documents.map((document) => (
                <tr
                  key={document.id}
                  onClick={() => onOpen(document.id)}
                  className="cursor-pointer align-top transition-colors hover:bg-canvas/50"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink">{document.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Actualizado {new Date(document.updated_at).toLocaleDateString('es-PE')}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-ink-muted">{document.document_type}</td>
                  <td className="px-5 py-4 text-ink-muted">v{document.version}</td>
                  <td className={`px-5 py-4 text-xs ${EXTRACTION_TONE[document.extraction_status]}`}>
                    {EXTRACTION_LABEL[document.extraction_status]}
                    {document.char_count ? (
                      <span className="mt-0.5 block text-ink-muted">
                        {document.char_count.toLocaleString('es-PE')} caracteres
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[document.status]}`}
                    >
                      {STATUS_LABEL[document.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ChevronRight className="inline size-4 text-ink-muted" aria-hidden />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
