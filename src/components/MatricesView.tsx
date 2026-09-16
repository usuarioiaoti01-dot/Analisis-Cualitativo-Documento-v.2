'use client';

import { useState } from 'react';
import { Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { TemplateRecord } from '@/lib/types';

interface MatricesViewProps {
  templates: TemplateRecord[];
  onNewTemplate: () => void;
  onEditTemplate: (template: TemplateRecord) => void;
  /** Devuelve un mensaje cuando la matriz no puede eliminarse. */
  onDeleteTemplate: (template: TemplateRecord) => Promise<string | null>;
}

/**
 * Matrices de evaluación: los criterios, sus pesos y sus reglas.
 *
 * Vive en su propia sección y no dentro de «Evaluaciones» porque son dos
 * trabajos distintos y de ritmos distintos: definir la matriz es un acto de
 * gobierno que se hace de tarde en tarde y se consensúa; evaluar un documento
 * con ella es la tarea diaria.
 */
export function MatricesView({
  templates,
  onNewTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: MatricesViewProps) {
  const [errorMatriz, setErrorMatriz] = useState<string | null>(null);

  return (
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

      {errorMatriz && (
        <p className="mt-4 rounded-lg bg-sev-high-bg px-4 py-3 text-sm text-sev-high-ink">
          {errorMatriz}
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const totalWeight = template.criteria.reduce((acc, criterion) => acc + criterion.weight, 0);

          return (
            <article key={template.id} className="rounded-xl border border-hairline p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <SlidersHorizontal className="size-[18px]" aria-hidden />
                </span>

                <div className="flex items-center gap-1">
                  {template.active === 1 && (
                    <span className="rounded-full bg-sev-low-bg px-2.5 py-1 text-xs font-medium text-sev-low-ink">
                      Activa
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditTemplate(template)}
                    aria-label={`Modificar ${template.name}`}
                    title="Modificar matriz"
                    className="rounded-lg p-1.5 text-ink-muted transition-colors hover:text-brand"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={async () => setErrorMatriz(await onDeleteTemplate(template))}
                    aria-label={`Eliminar ${template.name}`}
                    title="Eliminar matriz"
                    className="rounded-lg p-1.5 text-ink-muted transition-colors hover:text-sev-high-ink"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
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
  );
}
