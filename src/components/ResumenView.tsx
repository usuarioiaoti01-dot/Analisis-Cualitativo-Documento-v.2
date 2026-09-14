'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Search,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import {
  RISK_LABEL,
  STATUS_LABEL,
  type DocumentStatus,
  type Resumen,
  type Risk,
} from '@/lib/types';
import { SeverityBadge } from './SeverityBadge';

const METRIC_TONE = {
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  green: 'bg-emerald-50 text-emerald-600',
} as const;

/** Color de la barra de cada dimensión, en el orden de la rúbrica. */
const DIMENSION_BAR = ['bg-blue-600', 'bg-blue-400', 'bg-amber-500', 'bg-emerald-600', 'bg-slate-500'];

const STATUS_TONE: Record<DocumentStatus, string> = {
  pending: 'text-ink-muted',
  in_review: 'text-blue-600',
  observed: 'text-amber-600',
  compliant: 'text-emerald-600',
};

const RISK_TONE: Record<Risk, string> = {
  bajo: 'bg-sev-low-bg text-sev-low-ink',
  medio: 'bg-sev-medium-bg text-sev-medium-ink',
  alto: 'bg-sev-high-bg text-sev-high-ink',
  critico: 'bg-sev-high-ink text-white',
};

interface ResumenViewProps {
  resumen: Resumen | null;
  loading: boolean;
  onOpenCatalog: () => void;
  onOpenEvaluations: () => void;
  onOpenDocument: (documentId: string) => void;
}

export function ResumenView({
  resumen,
  loading,
  onOpenCatalog,
  onOpenEvaluations,
  onOpenDocument,
}: ResumenViewProps) {
  const [query, setQuery] = useState('');

  const documentos = useMemo(() => {
    const lista = resumen?.documentos_recientes ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return lista;
    return lista.filter((documento) => documento.title.toLowerCase().includes(needle));
  }, [resumen, query]);

  if (loading || !resumen) {
    return (
      <p className="card px-6 py-16 text-center text-sm text-ink-muted">Cargando el panel…</p>
    );
  }

  const { metricas, dimensiones, hallazgos, catalogo } = resumen;

  const tarjetas = [
    {
      key: 'documentos',
      label: 'Documentos evaluados',
      value: metricas.documentos_evaluados.valor.toString(),
      hint: `${metricas.documentos_evaluados.nuevos_este_mes} cargado(s) este mes`,
      tone: 'blue' as const,
      icon: Copy,
    },
    {
      key: 'evaluaciones',
      label: 'Evaluaciones activas',
      value: metricas.evaluaciones_activas.valor.toString(),
      hint: `${metricas.evaluaciones_activas.requieren_atencion} requieren atención`,
      tone: 'amber' as const,
      icon: ClipboardCheck,
    },
    {
      key: 'hallazgos',
      label: 'Hallazgos críticos',
      value: metricas.hallazgos_criticos.valor.toString(),
      hint: 'Riesgo alto o crítico, sin atender',
      tone: 'rose' as const,
      icon: ShieldAlert,
    },
    {
      key: 'indice',
      label: 'Índice de calidad',
      value: metricas.indice_calidad.valor === null ? '—' : `${metricas.indice_calidad.valor}/100`,
      hint:
        metricas.indice_calidad.valor === null
          ? 'Sin evaluaciones todavía'
          : metricas.indice_calidad.variacion === null
            ? 'Sin periodo anterior con que comparar'
            : `${metricas.indice_calidad.variacion >= 0 ? '+' : ''}${metricas.indice_calidad.variacion} vs. periodo anterior`,
      tone: 'green' as const,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Decisiones sustentadas, documentos confiables.
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Evalúe calidad, estructura, base legal y consistencia con el repositorio institucional.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenEvaluations}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-hairline bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
        >
          <SlidersHorizontal className="size-[18px]" aria-hidden />
          Administrar criterios
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((tarjeta) => {
          const Icon = tarjeta.icon;
          return (
            <article key={tarjeta.key} className="card flex gap-4 p-5">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${METRIC_TONE[tarjeta.tone]}`}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-ink-muted">{tarjeta.label}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{tarjeta.value}</p>
                <p className="mt-1 text-xs text-ink-muted">{tarjeta.hint}</p>
              </div>
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-ink">Documentos recientes</h3>
              <p className="mt-0.5 text-sm text-ink-muted">Seguimiento de evaluaciones en curso</p>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 focus-within:border-brand">
            <Search className="size-[18px] text-ink-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar documento"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          </label>

          <ul className="mt-2 divide-y divide-hairline">
            {documentos.map((documento) => (
              <li key={documento.id}>
                <button
                  type="button"
                  onClick={() => onOpenDocument(documento.id)}
                  className="flex w-full items-center gap-4 py-4 text-left transition-colors hover:bg-canvas/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Copy className="size-[18px]" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{documento.title}</span>
                    <span className="block text-xs text-ink-muted">
                      {documento.document_type} · Actualizado {tiempoRelativo(documento.updated_at)}
                    </span>
                  </span>

                  <span className="shrink-0 text-center">
                    <span className="block text-lg font-semibold text-ink">
                      {documento.quality_score ?? '—'}
                    </span>
                    <span className="block text-[0.6875rem] text-ink-muted">calidad</span>
                  </span>

                  <span className="w-16 shrink-0">
                    {documento.severity && <SeverityBadge severity={documento.severity} />}
                  </span>

                  <span className={`w-24 shrink-0 text-sm font-medium ${STATUS_TONE[documento.status]}`}>
                    {STATUS_LABEL[documento.status]}
                  </span>

                  <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                </button>
              </li>
            ))}

            {documentos.length === 0 && (
              <li className="py-12 text-center text-sm text-ink-muted">
                {query
                  ? 'Ningún documento coincide con la búsqueda.'
                  : 'Aún no hay documentos cargados. Use «Cargar documento» para empezar.'}
              </li>
            )}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h3 className="text-lg font-semibold text-ink">Calidad por dimensión</h3>
            <p className="mt-0.5 text-sm text-ink-muted">Promedio de la última evaluación de cada documento</p>

            {dimensiones.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                Sin evaluaciones que promediar.
              </p>
            ) : (
              <ul className="mt-5 space-y-4">
                {dimensiones.map((dimension, index) => (
                  <li key={dimension.dimension}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-ink">{dimension.dimension}</span>
                      <span className="font-medium text-ink">{dimension.promedio}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-hairline">
                      <div
                        className={`h-full rounded-full ${DIMENSION_BAR[index % DIMENSION_BAR.length]}`}
                        style={{ width: `${dimension.promedio}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[0.875rem] border border-emerald-100 bg-emerald-50/70 p-6">
            <div className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-ink">Validación normativa</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {catalogo.normas === 0 ? (
                    'El catálogo está vacío: incorpore normas para poder validar las citas.'
                  ) : (
                    <>
                      El catálogo contiene{' '}
                      <strong className="text-ink">
                        {catalogo.normas} {catalogo.normas === 1 ? 'norma' : 'normas'}
                      </strong>
                      {catalogo.actualizado_en
                        ? ` y se actualizó el ${new Date(catalogo.actualizado_en).toLocaleDateString('es-PE')}.`
                        : '.'}
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={onOpenCatalog}
                  className="mt-3 flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
                >
                  Ir al catálogo
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-ink">Hallazgos que requieren atención</h3>
            <p className="mt-0.5 text-sm text-ink-muted">
              Pendientes de revisión, ordenados por riesgo
            </p>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-hairline">
          {hallazgos.map((hallazgo) => (
            <li key={hallazgo.id} className="flex items-center gap-5 py-4">
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${RISK_TONE[hallazgo.risk]}`}
              >
                {RISK_LABEL[hallazgo.risk]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-ink-muted">
                  {hallazgo.dimension} · {hallazgo.document_title}
                </p>
                <p className="font-medium text-ink">{hallazgo.message}</p>
                {hallazgo.evidence_location && (
                  <p className="mt-0.5 text-xs text-ink-muted">{hallazgo.evidence_location}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenDocument(hallazgo.document_id)}
                className="shrink-0 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Revisar
              </button>
            </li>
          ))}

          {hallazgos.length === 0 && (
            <li className="py-12 text-center text-sm text-ink-muted">
              No hay hallazgos pendientes.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

/** «Hace 18 min», «Ayer», «08 set.» — como en el listado de origen. */
function tiempoRelativo(marca: number): string {
  const minutos = Math.floor((Date.now() - marca) / 60_000);

  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 24 * 60) return `hace ${Math.floor(minutos / 60)} h`;
  if (minutos < 48 * 60) return 'ayer';

  return new Date(marca).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}
