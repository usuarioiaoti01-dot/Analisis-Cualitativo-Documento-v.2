'use client';

import { useState } from 'react';
import { Play, Plus, SlidersHorizontal } from 'lucide-react';
import type { TemplateRecord } from '@/lib/types';

interface EvaluacionesViewProps {
  documents: { id: string; title: string }[];
  templates: TemplateRecord[];
  onRun: (documentId: string, templateId: number) => Promise<void>;
  onNewTemplate: () => void;
}

export function EvaluacionesView({
  documents,
  templates,
  onRun,
  onNewTemplate,
}: EvaluacionesViewProps) {
  const [documentId, setDocumentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canRun = documentId !== '' && templateId !== '' && !running;

  async function handleRun() {
    if (!canRun) return;
    setRunning(true);
    setMessage(null);
    try {
      await onRun(documentId, Number(templateId));
      setMessage('La evaluación se ejecutó y el documento actualizó su estado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible ejecutar la evaluación.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-ink">Ejecutar evaluación</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Seleccione el documento y la matriz que definirán la revisión.
        </p>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="flex-1">
            <span className="block text-sm font-medium text-ink">Documento</span>
            <select
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">Seleccione</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </label>

          <label className="lg:w-64">
            <span className="block text-sm font-medium text-ink">Matriz</span>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">Seleccione</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="size-[18px]" aria-hidden />
            {running ? 'Ejecutando…' : 'Iniciar'}
          </button>
        </div>

        {message && <p className="mt-4 text-sm text-ink-muted">{message}</p>}
      </section>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Matrices de evaluación</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Defina criterios, ponderaciones y reglas según el tipo documental.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewTemplate}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            <Plus className="size-[18px]" aria-hidden />
            Nueva matriz
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const totalWeight = template.criteria.reduce((acc, criterion) => acc + criterion.weight, 0);

            return (
              <article key={template.id} className="rounded-xl border border-hairline p-5">
                <div className="flex items-start justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <SlidersHorizontal className="size-[18px]" aria-hidden />
                  </span>
                  {template.active === 1 && (
                    <span className="rounded-full bg-sev-low-bg px-2.5 py-1 text-xs font-medium text-sev-low-ink">
                      Activa
                    </span>
                  )}
                </div>

                <h3 className="mt-4 font-medium text-ink">{template.name}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{template.document_type}</p>

                <p className="mt-5 text-sm text-ink-muted">
                  <strong className="text-ink">{template.criteria.length}</strong> criterios{' '}
                  <strong className="ml-2 text-ink">{totalWeight}%</strong> ponderación
                </p>
              </article>
            );
          })}

          {templates.length === 0 && (
            <p className="py-10 text-sm text-ink-muted">Aún no hay matrices definidas.</p>
          )}
        </div>
      </section>
    </div>
  );
}
