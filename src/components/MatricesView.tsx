'use client';

import { useState } from 'react';
import { ListTree, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { CriterionRecord, TemplateRecord } from '@/lib/types';
import { Modal } from './Modal';

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
  /** Matriz cuya composición se está mirando. */
  const [enDetalle, setEnDetalle] = useState<TemplateRecord | null>(null);

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

              <button
                type="button"
                onClick={() => setEnDetalle(template)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-hairline px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                <ListTree className="size-4" aria-hidden />
                Ver criterios
              </button>
            </article>
          );
        })}

        {templates.length === 0 && (
          <p className="py-10 text-sm text-ink-muted">Aún no hay matrices definidas.</p>
        )}
      </div>

      {enDetalle && (
        <ComposicionMatriz
          matriz={enDetalle}
          onClose={() => setEnDetalle(null)}
          onModificar={() => {
            const matriz = enDetalle;
            setEnDetalle(null);
            onEditTemplate(matriz);
          }}
        />
      )}
    </section>
  );
}

/**
 * Composición de una matriz: qué mide cada criterio, con qué pregunta y cuánto
 * pesa. Se mira antes de tocar nada —de aquí sale la conversación sobre si la
 * matriz es la adecuada— y desde aquí se pasa a modificarla.
 */
function ComposicionMatriz({
  matriz,
  onClose,
  onModificar,
}: {
  matriz: TemplateRecord;
  onClose: () => void;
  onModificar: () => void;
}) {
  const total = matriz.criteria.reduce((acc, criterio) => acc + criterio.weight, 0);

  // Los criterios se agrupan por dimensión, que es como se lee una rúbrica:
  // primero cuánto pesa cada dimensión y después qué pregunta dentro de ella.
  const porDimension = new Map<string, CriterionRecord[]>();
  for (const criterio of matriz.criteria) {
    porDimension.set(criterio.dimension, [...(porDimension.get(criterio.dimension) ?? []), criterio]);
  }

  return (
    <Modal
      title={matriz.name}
      description={`${matriz.document_type} · ${matriz.criteria.length} criterios · ${total}% de ponderación`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onModificar}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            <Pencil className="size-[18px]" aria-hidden />
            Modificar o agregar criterios
          </button>
        </>
      }
    >
      {total !== 100 && (
        <p className="mb-4 rounded-lg bg-sev-medium-bg px-4 py-3 text-sm text-sev-medium-ink">
          Las ponderaciones suman {total}%. Una matriz que no suma 100% reparte el puntaje sobre
          una base distinta de la prevista.
        </p>
      )}

      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        {[...porDimension.entries()].map(([dimension, criterios]) => {
          const peso = criterios.reduce((acc, criterio) => acc + criterio.weight, 0);

          return (
            <section key={dimension}>
              <h3 className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5">
                <span className="text-sm font-semibold text-ink">{dimension}</span>
                <span className="text-xs text-ink-muted">{peso}% de la matriz</span>
              </h3>

              <ol className="mt-2 space-y-3">
                {criterios.map((criterio, indice) => (
                  <li key={criterio.id ?? `${dimension}-${indice}`} className="flex gap-3 text-sm">
                    <span className="mt-0.5 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700">
                      {criterio.weight}%
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{criterio.description}</p>
                      {criterio.indicator && (
                        <p className="mt-0.5 text-ink-muted">{criterio.indicator}</p>
                      )}
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Escala 1 a {criterio.scale_max ?? 5}
                        {criterio.rule ? ` · Regla: ${criterio.rule}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

        {matriz.criteria.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-muted">
            Esta matriz no tiene criterios: no puede evaluar nada hasta que se le agregue al menos
            uno.
          </p>
        )}
      </div>
    </Modal>
  );
}
