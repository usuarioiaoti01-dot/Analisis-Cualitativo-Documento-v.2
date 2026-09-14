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
  CATALOG_SUMMARY,
  DEMO_DIMENSIONS,
  DEMO_DOCUMENTS,
  DEMO_FINDINGS,
  DEMO_METRICS,
} from '@/lib/demo';
import { SeverityBadge } from './SeverityBadge';

const METRIC_ICON = {
  documentos: Copy,
  evaluaciones: ClipboardCheck,
  hallazgos: ShieldAlert,
  indice: CheckCircle2,
} as const;

const METRIC_TONE = {
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  green: 'bg-emerald-50 text-emerald-600',
} as const;

/** Color de la barra de cada dimensión, en el orden de la rúbrica. */
const DIMENSION_BAR = ['bg-blue-600', 'bg-blue-400', 'bg-amber-500', 'bg-emerald-600', 'bg-slate-500'];

const STATUS_TONE: Record<string, string> = {
  'En revisión': 'text-blue-600',
  Observado: 'text-amber-600',
  Conforme: 'text-emerald-600',
};

interface ResumenViewProps {
  onOpenCatalog: () => void;
  onOpenEvaluations: () => void;
}

export function ResumenView({ onOpenCatalog, onOpenEvaluations }: ResumenViewProps) {
  const [query, setQuery] = useState('');

  const documents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return DEMO_DOCUMENTS;
    return DEMO_DOCUMENTS.filter((document) => document.title.toLowerCase().includes(needle));
  }, [query]);

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
        {DEMO_METRICS.map((metric) => {
          const Icon = METRIC_ICON[metric.key];
          return (
            <article key={metric.key} className="card flex gap-4 p-5">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${METRIC_TONE[metric.tone]}`}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-ink-muted">{metric.label}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{metric.value}</p>
                <p className="mt-1 text-xs text-ink-muted">{metric.hint}</p>
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
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              Ver todos
              <ChevronRight className="size-4" aria-hidden />
            </button>
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
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-4 py-4 text-left transition-colors hover:bg-canvas/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Copy className="size-[18px]" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{document.title}</span>
                    <span className="block text-xs text-ink-muted">
                      {document.type} · Actualizado {document.updated}
                    </span>
                  </span>

                  <span className="shrink-0 text-center">
                    <span className="block text-lg font-semibold text-ink">{document.score}</span>
                    <span className="block text-[0.6875rem] text-ink-muted">calidad</span>
                  </span>

                  <SeverityBadge severity={document.severity} />

                  <span className={`w-24 shrink-0 text-sm font-medium ${STATUS_TONE[document.status] ?? ''}`}>
                    {document.status}
                  </span>

                  <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                </button>
              </li>
            ))}
            {documents.length === 0 && (
              <li className="py-10 text-center text-sm text-ink-muted">
                Ningún documento coincide con la búsqueda.
              </li>
            )}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h3 className="text-lg font-semibold text-ink">Calidad por dimensión</h3>
            <p className="mt-0.5 text-sm text-ink-muted">Promedio del periodo</p>

            <ul className="mt-5 space-y-4">
              {DEMO_DIMENSIONS.map((dimension, index) => (
                <li key={dimension.dimension}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink">{dimension.dimension}</span>
                    <span className="font-medium text-ink">{dimension.score}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-hairline">
                    <div
                      className={`h-full rounded-full ${DIMENSION_BAR[index % DIMENSION_BAR.length]}`}
                      style={{ width: `${dimension.score}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[0.875rem] border border-emerald-100 bg-emerald-50/70 p-6">
            <div className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-ink">Validación normativa</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  El catálogo contiene <strong className="text-ink">{CATALOG_SUMMARY.count} normas</strong> y se
                  actualizó el {CATALOG_SUMMARY.updatedAt}.
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
            <p className="mt-0.5 text-sm text-ink-muted">Resultado de la última evaluación automática asistida</p>
          </div>
          <button
            type="button"
            onClick={onOpenEvaluations}
            className="flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Ver bandeja
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        <ul className="mt-4 divide-y divide-hairline">
          {DEMO_FINDINGS.map((finding) => (
            <li key={finding.message} className="flex items-center gap-5 py-4">
              <SeverityBadge severity={finding.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-muted">{finding.dimension}</p>
                <p className="font-medium text-ink">{finding.message}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{finding.location}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Revisar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
