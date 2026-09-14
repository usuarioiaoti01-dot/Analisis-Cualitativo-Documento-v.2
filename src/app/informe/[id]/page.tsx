'use client';

import { use, useEffect, useState } from 'react';
import {
  ENGINE_LABEL,
  FINDING_STATUS_LABEL,
  OUTCOME_LABEL,
  RISK_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  type Informe,
} from '@/lib/types';

/**
 * Etapa 7 — informe cualitativo trazable.
 *
 * Es una página aparte, sin la barra lateral ni los controles de la aplicación,
 * pensada para imprimirse o guardarse como PDF desde el navegador y adjuntarse
 * al expediente. El estilo de impresión vive en `globals.css`.
 */
export default function InformePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}/informe`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'No fue posible generar el informe.');
        setInforme(payload);
      })
      .catch((problema: Error) => setError(problema.message));
  }, [id]);

  if (error) {
    return <p className="mx-auto max-w-3xl p-10 text-sm text-sev-high-ink">{error}</p>;
  }
  if (!informe) {
    return <p className="mx-auto max-w-3xl p-10 text-sm text-ink-muted">Generando informe…</p>;
  }

  const { document: doc, evaluation, results, findings, similarities } = informe;

  const porEstado = (estado: string) => findings.filter((f) => f.status === estado).length;
  const fecha = (marca: number | null) =>
    marca ? new Date(marca).toLocaleString('es-PE') : '—';

  return (
    <div className="mx-auto max-w-4xl bg-white p-10 print:p-0">
      <header className="border-b-2 border-ink pb-4">
        <p className="eyebrow">Dirección de Políticas — SERFOR</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">
          Informe de evaluación cualitativa documental
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Generado el {new Date(informe.generado_en).toLocaleString('es-PE')}
        </p>
      </header>

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white print:hidden"
      >
        Imprimir o guardar como PDF
      </button>

      <Seccion titulo="1. Documento evaluado">
        <Campos
          filas={[
            ['Título', doc.title],
            ['Tipo documental', doc.document_type],
            ['Archivo', doc.file_name ?? '—'],
            ['Versión', `v${doc.version}`],
            ['Páginas', doc.page_count?.toString() ?? '—'],
            ['Autor', doc.author ?? 'No registrado'],
            ['Unidad responsable', doc.responsible_unit ?? 'No registrada'],
            ['Estado', STATUS_LABEL[doc.status]],
          ]}
        />
      </Seccion>

      <Seccion titulo="2. Evaluación">
        {!evaluation ? (
          <p className="text-sm text-ink-muted">El documento aún no ha sido evaluado.</p>
        ) : (
          <>
            <Campos
              filas={[
                ['Matriz aplicada', evaluation.template_name],
                ['Motor', ENGINE_LABEL[evaluation.engine]],
                ['Ejecutada', fecha(evaluation.created_at)],
                ['Puntaje', evaluation.score === null ? '—' : `${evaluation.score}/100`],
                ['Validada por', evaluation.validated_by ?? 'Pendiente de validación'],
                ['Fecha de validación', fecha(evaluation.validated_at)],
              ]}
            />
            {evaluation.validation_note && (
              <p className="mt-3 border-l-2 border-hairline pl-3 text-sm text-ink">
                <strong>Nota de validación:</strong> {evaluation.validation_note}
              </p>
            )}
            {evaluation.engine === 'deterministic' && (
              <p className="mt-3 rounded bg-sev-medium-bg px-3 py-2 text-sm text-sev-medium-ink">
                Advertencia: esta evaluación se ejecutó con el motor provisional, que no analiza el
                contenido del documento. El puntaje no es una calificación de calidad.
              </p>
            )}
          </>
        )}
      </Seccion>

      {results.length > 0 && (
        <Seccion titulo="3. Resultado por criterio">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                <Th>Dimensión</Th>
                <Th>Criterio</Th>
                <Th>Resultado</Th>
                <Th className="text-right">Puntaje</Th>
                <Th className="text-right">Peso</Th>
                <Th className="text-right">Aporte</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((resultado) => (
                <tr key={resultado.id} className="border-b border-hairline align-top">
                  <Td>{resultado.dimension}</Td>
                  <Td>{resultado.criterion_description}</Td>
                  <Td>{OUTCOME_LABEL[resultado.result]}</Td>
                  <Td className="text-right">
                    {resultado.raw_score ?? '—'} / {resultado.scale_max ?? 5}
                  </Td>
                  <Td className="text-right">{resultado.criterion_weight ?? '—'}%</Td>
                  <Td className="text-right">
                    {resultado.weighted_score === null ? '—' : resultado.weighted_score.toFixed(1)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      <Seccion titulo="4. Hallazgos">
        <p className="mb-4 text-sm text-ink-muted">
          {findings.length} en total · {porEstado('pendiente')} pendientes ·{' '}
          {porEstado('aceptado')} aceptados · {porEstado('subsanado')} subsanados ·{' '}
          {porEstado('descartado')} descartados
        </p>

        {findings.length === 0 ? (
          <p className="text-sm text-ink-muted">No se registraron hallazgos.</p>
        ) : (
          <ol className="space-y-5">
            {findings.map((hallazgo, indice) => (
              <li key={hallazgo.id} className="break-inside-avoid border-l-2 border-hairline pl-4">
                <p className="text-xs text-ink-muted">
                  {indice + 1}. {hallazgo.dimension} · Riesgo {RISK_LABEL[hallazgo.risk]} ·{' '}
                  {SOURCE_LABEL[hallazgo.source]} · {FINDING_STATUS_LABEL[hallazgo.status]}
                </p>
                <p className="mt-0.5 font-medium text-ink">{hallazgo.message}</p>

                {hallazgo.evidence_text && (
                  <p className="mt-1.5 text-sm text-ink-muted italic">«{hallazgo.evidence_text}»</p>
                )}
                {hallazgo.evidence_location && (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Ubicación: {hallazgo.evidence_location}
                  </p>
                )}
                {hallazgo.reference_label && (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Contrastado con: {hallazgo.reference_label}
                  </p>
                )}
                {hallazgo.recommendation && (
                  <p className="mt-1.5 text-sm text-ink">
                    <strong>Recomendación:</strong> {hallazgo.recommendation}
                  </p>
                )}
                {hallazgo.resolved_by && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Decidido por {hallazgo.resolved_by} el {fecha(hallazgo.resolved_at)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Seccion>

      {similarities.length > 0 && (
        <Seccion titulo="5. Coincidencias con el repositorio">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                <Th>Documento comparado</Th>
                <Th>Tipo de coincidencia</Th>
                <Th className="text-right">Similitud</Th>
                <Th className="text-right">Contención</Th>
              </tr>
            </thead>
            <tbody>
              {similarities.map((similitud) => (
                <tr key={similitud.compared_id} className="border-b border-hairline">
                  <Td>{similitud.compared_title}</Td>
                  <Td>{similitud.kind.replace(/_/g, ' ')}</Td>
                  <Td className="text-right">{Math.round(similitud.similarity * 100)}%</Td>
                  <Td className="text-right">{Math.round(similitud.containment * 100)}%</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-ink-muted">
        <p>
          Este informe consolida un análisis asistido. La interpretación y la conformidad
          corresponden al responsable técnico o legal; el puntaje automático no sustituye al
          criterio administrativo.
        </p>
      </footer>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 border-b border-hairline pb-1 text-base font-semibold text-ink">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Campos({ filas }: { filas: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="flex gap-2">
          <dt className="shrink-0 text-ink-muted">{etiqueta}:</dt>
          <dd className="min-w-0 font-medium break-words text-ink">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold text-ink ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 text-ink ${className}`}>{children}</td>;
}
