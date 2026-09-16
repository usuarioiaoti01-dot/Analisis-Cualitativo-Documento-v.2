'use client';

import { useState } from 'react';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import {
  EXTRACTION_LABEL,
  STATUS_LABEL,
  type DocumentRecord,
  type DocumentStatus,
  type ExtractionStatus,
  type TemplateRecord,
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
  ocr: 'text-sev-medium-ink',
  empty: 'text-sev-medium-ink',
  failed: 'text-sev-high-ink',
};

interface DocumentosViewProps {
  documents: DocumentRecord[];
  loading: boolean;
  templates: TemplateRecord[];
  onRegister: () => void;
  onOpen: (documentId: string) => void;
  /** Ejecuta la evaluación y devuelve el resumen de la corrida. */
  onEvaluar: (documentId: string, templateId: number) => Promise<string>;
  /** Lleva al módulo de evaluaciones cuando la matriz no es evidente. */
  onElegirMatriz: (documentId: string) => void;
}

/**
 * Matrices vigentes para el tipo documental. Si hay exactamente una, evaluar es
 * una decisión sin ambigüedad y el botón la ejecuta; si hay varias o ninguna,
 * la elección es del usuario y el botón lleva al módulo de evaluaciones.
 */
function matricesPara(templates: TemplateRecord[], documento: DocumentRecord): TemplateRecord[] {
  // La comparación ignora mayúsculas y acentos: «Informe Técnico» e «Informe
  // tecnico» son el mismo tipo, y una diferencia de tecleo no debería dejar un
  // documento sin su matriz.
  const igual = (a: string, b: string) =>
    a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() ===
    b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  return templates.filter(
    (template) => template.active === 1 && igual(template.document_type, documento.document_type),
  );
}

export function DocumentosView({
  documents,
  loading,
  templates,
  onRegister,
  onOpen,
  onEvaluar,
  onElegirMatriz,
}: DocumentosViewProps) {
  const [evaluando, setEvaluando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ documentId: string; texto: string; error: boolean } | null>(
    null,
  );

  async function evaluar(documento: DocumentRecord) {
    const matrices = matricesPara(templates, documento);
    if (matrices.length !== 1) {
      onElegirMatriz(documento.id);
      return;
    }

    setEvaluando(documento.id);
    setAviso(null);
    try {
      const resumen = await onEvaluar(documento.id, matrices[0].id);
      setAviso({ documentId: documento.id, texto: resumen, error: false });
    } catch (error) {
      setAviso({
        documentId: documento.id,
        texto: error instanceof Error ? error.message : 'No fue posible evaluar el documento.',
        error: true,
      });
    } finally {
      setEvaluando(null);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex justify-end">
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
              <th className="px-5 py-3 font-semibold">Evaluación</th>
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
                    {aviso?.documentId === document.id && (
                      <p
                        className={`mt-1.5 text-xs ${aviso.error ? 'text-sev-high-ink' : 'text-sev-low-ink'}`}
                      >
                        {aviso.texto}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-ink-muted">{document.document_type}</td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      // La fila entera abre la ficha: el botón no debe arrastrarla.
                      onClick={(event) => {
                        event.stopPropagation();
                        void evaluar(document);
                      }}
                      disabled={evaluando !== null}
                      className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {evaluando === document.id ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          Evaluando…
                        </>
                      ) : (
                        'Iniciar evaluación'
                      )}
                    </button>
                  </td>
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

      {evaluando && (
        <p className="mt-3 text-xs text-ink-muted">
          La evaluación con IA analiza el documento entero: puede tardar varios minutos.
        </p>
      )}
    </section>
  );
}
