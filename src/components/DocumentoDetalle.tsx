'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  FileCheck2,
  Printer,
  ScanSearch,
  ScanText,
  Trash2,
} from 'lucide-react';
import { Modal } from './Modal';
import {
  ENGINE_LABEL,
  EXTRACTION_LABEL,
  FINDING_STATUS_LABEL,
  OUTCOME_LABEL,
  RISK_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  type CriterionOutcome,
  type DocumentDetail,
  type EvaluationRecord,
  type EvaluationResultRecord,
  type ExtractionStatus,
  type FindingRecord,
  type FindingSource,
  type FindingStatus,
  type Risk,
  type SectionRecord,
} from '@/lib/types';

const EXTRACTION_TONE: Record<ExtractionStatus, string> = {
  none: 'bg-slate-100 text-slate-600',
  ok: 'bg-sev-low-bg text-sev-low-ink',
  // Ámbar, no verde: el texto vino de un escaneo y puede diferir del original.
  ocr: 'bg-sev-medium-bg text-sev-medium-ink',
  empty: 'bg-sev-medium-bg text-sev-medium-ink',
  failed: 'bg-sev-high-bg text-sev-high-ink',
};

const OUTCOME_TONE: Record<CriterionOutcome, string> = {
  cumple: 'bg-sev-low-bg text-sev-low-ink',
  parcial: 'bg-sev-medium-bg text-sev-medium-ink',
  no_cumple: 'bg-sev-high-bg text-sev-high-ink',
  no_aplica: 'bg-slate-100 text-slate-600',
};

const RISK_TONE: Record<Risk, string> = {
  bajo: 'bg-sev-low-bg text-sev-low-ink',
  medio: 'bg-sev-medium-bg text-sev-medium-ink',
  alto: 'bg-sev-high-bg text-sev-high-ink',
  critico: 'bg-sev-high-ink text-white',
};

type Pestana = 'secciones' | 'resultados' | 'hallazgos' | 'texto';

interface Respuesta {
  document: DocumentDetail;
  sections: SectionRecord[];
  evaluations: EvaluationRecord[];
  results: EvaluationResultRecord[];
  findings: FindingRecord[];
}

interface DocumentoDetalleProps {
  documentId: string;
  onBack: () => void;
  /** Se invoca tras eliminar, para que el repositorio y el panel se actualicen. */
  onDeleted: () => void;
  /** Se invoca tras cualquier cambio que altere las cifras del panel. */
  onChanged: () => void;
}

export function DocumentoDetalle({
  documentId,
  onBack,
  onDeleted,
  onChanged,
}: DocumentoDetalleProps) {
  const [data, setData] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<Pestana>('secciones');
  const [texto, setTexto] = useState<string | null>(null);
  const [textoCargando, setTextoCargando] = useState(false);
  const [contrastando, setContrastando] = useState(false);
  const [avisoContraste, setAvisoContraste] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [avisoOcr, setAvisoOcr] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [avisoValidacion, setAvisoValidacion] = useState<string | null>(null);

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
        setData(payload);
        setError(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId, recarga]);

  /** Etapas 5 y 6: validación normativa y comparación con el repositorio. */
  async function ejecutarContraste() {
    setContrastando(true);
    setAvisoContraste(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/contraste`, { method: 'POST' });
      const payload = await response.json();

      if (!response.ok) {
        setAvisoContraste(payload.error ?? 'No fue posible ejecutar el contraste.');
        return;
      }

      const normativa = payload.resumen?.normativa;
      const similitud = payload.resumen?.similitud;
      setAvisoContraste(
        `${payload.hallazgos} hallazgo(s). ` +
          `Citas normativas: ${normativa?.citas_detectadas ?? 0} detectadas, ` +
          `${normativa?.verificadas ?? 0} verificadas contra el catálogo. ` +
          `Repositorio: ${similitud?.coincidencias ?? 0} coincidencia(s) en ` +
          `${similitud?.documentos_comparados ?? 0} documento(s).`,
      );
      setPestana('hallazgos');
      setRecarga((valor) => valor + 1);
    } finally {
      setContrastando(false);
    }
  }

  /** Transcribe un PDF escaneado y rehace su texto y sus secciones. */
  async function transcribirEscaneo() {
    setTranscribiendo(true);
    setAvisoOcr(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/ocr`, { method: 'POST' });
      const payload = await response.json();

      if (!response.ok) {
        setAvisoOcr(payload.error ?? 'No fue posible transcribir el documento.');
        return;
      }

      const t = payload.transcrito;
      setAvisoOcr(
        `Transcrito: ${t.caracteres.toLocaleString('es-PE')} caracteres en ${t.secciones} secciones.`,
      );
      setRecarga((valor) => valor + 1);
      onChanged();
    } finally {
      setTranscribiendo(false);
    }
  }

  /** Etapa 7: la decisión humana sobre un hallazgo. */
  async function decidirHallazgo(findingId: number, status: FindingStatus) {
    const response = await fetch(`/api/findings/${findingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      setAvisoValidacion(null);
      setRecarga((valor) => valor + 1);
      onChanged();
    }
  }

  /** Etapa 7: cierre de la evaluación. Exige que no queden hallazgos pendientes. */
  async function validarEvaluacion(evaluationId: string) {
    setValidando(true);
    setAvisoValidacion(null);
    try {
      const response = await fetch(`/api/evaluations/${evaluationId}/validar`, { method: 'POST' });
      const payload = await response.json();

      if (!response.ok) {
        setAvisoValidacion(payload.error ?? 'No fue posible validar la evaluación.');
        return;
      }
      setRecarga((valor) => valor + 1);
      onChanged();
    } finally {
      setValidando(false);
    }
  }

  /** Elimina el documento, su texto, sus evaluaciones, hallazgos y el archivo. */
  async function eliminarDocumento() {
    setBorrando(true);
    setErrorBorrado(null);
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorBorrado(payload.error ?? 'No fue posible eliminar el documento.');
        return;
      }
      setConfirmandoBorrado(false);
      onDeleted();
    } finally {
      setBorrando(false);
    }
  }

  // El texto completo pesa cientos de kilobytes: se pide solo al abrir su pestaña.
  useEffect(() => {
    if (pestana !== 'texto' || texto !== null || textoCargando) return;

    setTextoCargando(true);
    fetch(`/api/documents/${documentId}/texto`)
      .then((response) => response.json())
      .then((payload) => setTexto(payload.content ?? payload.error ?? ''))
      .catch(() => setTexto('No fue posible cargar el texto.'))
      .finally(() => setTextoCargando(false));
  }, [pestana, texto, textoCargando, documentId]);

  if (loading) {
    return (
      <section className="card px-6 py-16 text-center text-ink-muted">
        <Loader2 className="mx-auto size-6 animate-spin" aria-hidden />
        <p className="mt-3">Cargando documento…</p>
      </section>
    );
  }

  if (error || !data) {
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

  const { document, sections, evaluations, results, findings } = data;
  const ultima = evaluations[0];

  const metadatos = [
    { label: 'Tipo documental', value: document.document_type },
    { label: 'Estado', value: STATUS_LABEL[document.status] },
    { label: 'Versión', value: `v${document.version}` },
    { label: 'Archivo', value: document.file_name ?? '—' },
    { label: 'Tamaño', value: document.file_size ? formatearTamano(document.file_size) : '—' },
    { label: 'Páginas / hojas', value: document.page_count?.toString() ?? '—' },
    { label: 'Secciones', value: sections.length.toString() },
    { label: 'Caracteres extraídos', value: document.char_count?.toLocaleString('es-PE') ?? '—' },
  ];

  const pestanas: { id: Pestana; label: string; count: number }[] = [
    { id: 'secciones', label: 'Secciones', count: sections.length },
    { id: 'resultados', label: 'Resultados por criterio', count: results.length },
    { id: 'hallazgos', label: 'Hallazgos', count: findings.length },
    { id: 'texto', label: 'Texto completo', count: 0 },
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${EXTRACTION_TONE[document.extraction_status]}`}
                >
                  {EXTRACTION_LABEL[document.extraction_status]}
                </span>
                {document.quality_score !== null && (
                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {document.quality_score}/100 de calidad
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={ejecutarContraste}
              disabled={contrastando || document.extraction_status !== 'ok'}
              title={
                document.extraction_status === 'ok'
                  ? 'Valida las citas normativas y compara el documento con el repositorio'
                  : 'Requiere un documento con texto extraído'
              }
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ScanSearch className="size-[18px]" aria-hidden />
              {contrastando ? 'Contrastando…' : 'Ejecutar contraste'}
            </button>

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

            {(document.extraction_status === 'empty' ||
              document.extraction_status === 'failed') && (
              <button
                type="button"
                onClick={transcribirEscaneo}
                disabled={transcribiendo}
                title="Transcribir el escaneo con OCR"
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
              >
                <ScanText className="size-[18px]" aria-hidden />
                {transcribiendo ? 'Transcribiendo…' : 'Transcribir escaneo'}
              </button>
            )}

            <a
              href={`/informe/${documentId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
            >
              <Printer className="size-[18px]" aria-hidden />
              Informe
            </a>

            <button
              type="button"
              onClick={() => setConfirmandoBorrado(true)}
              aria-label="Eliminar documento"
              title="Eliminar documento"
              className="flex size-10 items-center justify-center rounded-lg border border-hairline text-ink-muted transition-colors hover:border-sev-high-ink hover:text-sev-high-ink"
            >
              <Trash2 className="size-[18px]" aria-hidden />
            </button>
          </div>
        </div>

        {avisoOcr && (
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">{avisoOcr}</p>
        )}

        {avisoContraste && (
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">{avisoContraste}</p>
        )}

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

      <section className="card">
        <nav className="flex gap-1 border-b border-hairline px-4" aria-label="Secciones del documento">
          {pestanas.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPestana(tab.id)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                pestana === tab.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count > 0 && <span className="ml-1.5 text-xs text-ink-muted">{tab.count}</span>}
            </button>
          ))}
        </nav>

        <div className="p-6">
          {pestana === 'secciones' && <Secciones sections={sections} />}
          {pestana === 'resultados' && (
            <Resultados
              results={results}
              evaluacion={ultima}
              pendientes={findings.filter((f) => f.status === 'pendiente').length}
              validando={validando}
              aviso={avisoValidacion}
              onValidar={validarEvaluacion}
            />
          )}
          {pestana === 'hallazgos' && (
            <Hallazgos findings={findings} onDecidir={decidirHallazgo} />
          )}
          {pestana === 'texto' &&
            (textoCargando || texto === null ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                <Loader2 className="mx-auto size-5 animate-spin" aria-hidden />
                <span className="mt-2 block">Cargando texto…</span>
              </p>
            ) : (
              <pre className="max-h-[32rem] overflow-auto rounded-lg border border-hairline bg-canvas/50 p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
                {texto}
              </pre>
            ))}
        </div>
      </section>

      {confirmandoBorrado && (
        <Modal
          title="Eliminar documento"
          description="Esta acción no se puede deshacer."
          onClose={() => setConfirmandoBorrado(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmandoBorrado(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminarDocumento}
                disabled={borrando}
                className="rounded-lg bg-sev-high-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink">
            Se eliminará <strong>{document.title}</strong> junto con su texto extraído, sus{' '}
            {sections.length} secciones, {evaluations.length} evaluación(es), {findings.length}{' '}
            hallazgo(s) y el archivo original guardado en el servidor.
          </p>
          {errorBorrado && <p className="mt-3 text-sm text-sev-high-ink">{errorBorrado}</p>}
        </Modal>
      )}
    </div>
  );
}

/**
 * Índice del documento. Compacto por omisión —una línea por sección, sin el
 * cuerpo— para que una directiva de cincuenta páginas quepa en una pantalla.
 * El evaluador despliega solo lo que necesita leer.
 */
function Secciones({ sections }: { sections: SectionRecord[] }) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());

  const hijosPorPadre = new Map<number, SectionRecord[]>();
  for (const seccion of sections) {
    if (seccion.parent_id === null) continue;
    const hermanos = hijosPorPadre.get(seccion.parent_id) ?? [];
    hermanos.push(seccion);
    hijosPorPadre.set(seccion.parent_id, hermanos);
  }

  const raices = sections.filter((seccion) => seccion.parent_id === null);

  function alternar(id: number) {
    setAbiertas((actuales) => {
      const siguiente = new Set(actuales);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  if (raices.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        El documento no tiene secciones reconocidas.
      </p>
    );
  }

  const todasAbiertas = abiertas.size === sections.length;
  const deTramite = sections.filter((seccion) => seccion.role === 'tramite').length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {raices.length} {raices.length === 1 ? 'sección' : 'secciones'} de primer nivel
          {sections.length > raices.length && ` · ${sections.length} en total`}
          {deTramite > 0 && (
            <span className="text-ink-muted"> · {deTramite} de trámite, fuera del análisis</span>
          )}
        </p>
        <button
          type="button"
          onClick={() =>
            setAbiertas(todasAbiertas ? new Set() : new Set(sections.map((s) => s.id)))
          }
          className="text-sm font-medium text-brand hover:underline"
        >
          {todasAbiertas ? 'Contraer todo' : 'Desplegar todo'}
        </button>
      </div>

      {/* El índice se desplaza dentro de su propio marco: así la ficha conserva
          una altura fija aunque el documento tenga cientos de secciones. */}
      <ul className="max-h-[32rem] divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
        {raices.map((seccion) => (
          <SeccionEnArbol
            key={seccion.id}
            seccion={seccion}
            hijosPorPadre={hijosPorPadre}
            abiertas={abiertas}
            onAlternar={alternar}
          />
        ))}
      </ul>
    </div>
  );
}

function SeccionEnArbol({
  seccion,
  hijosPorPadre,
  abiertas,
  onAlternar,
  profundidad = 0,
}: {
  seccion: SectionRecord;
  hijosPorPadre: Map<number, SectionRecord[]>;
  abiertas: Set<number>;
  onAlternar: (id: number) => void;
  profundidad?: number;
}) {
  const hijos = hijosPorPadre.get(seccion.id) ?? [];
  const abierta = abiertas.has(seccion.id);
  // Una sección sin cuerpo ni numerales no tiene nada que desplegar.
  const desplegable = hijos.length > 0 || Boolean(seccion.content);

  return (
    <li>
      <div
        className="flex items-center gap-2 py-2 pr-3 text-sm"
        style={{ paddingLeft: profundidad * 18 + 8 }}
      >
        {desplegable ? (
          <button
            type="button"
            onClick={() => onAlternar(seccion.id)}
            aria-expanded={abierta}
            className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronRight
              className={`size-4 transition-transform ${abierta ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}

        {seccion.numbering && (
          <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700">
            {seccion.numbering}
          </span>
        )}

        <button
          type="button"
          onClick={() => desplegable && onAlternar(seccion.id)}
          className={`min-w-0 flex-1 truncate text-left font-medium ${
            seccion.role === 'tramite' ? 'text-ink-muted' : 'text-ink'
          }`}
          title={seccion.heading}
        >
          {seccion.heading}
        </button>

        {/* La carátula del documento se muestra, pero el motor no la evalúa:
            conviene que el revisor sepa qué se dejó fuera y por qué. */}
        {seccion.role === 'tramite' && (
          <span
            className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-ink-muted"
            title="Carátula del documento: no se incluye en el análisis."
          >
            trámite
          </span>
        )}

        {hijos.length > 0 && (
          <span className="shrink-0 text-xs text-ink-muted">{hijos.length} num.</span>
        )}
        {seccion.page_from && (
          <span className="w-16 shrink-0 text-right text-xs text-ink-muted">
            pág. {seccion.page_from}
          </span>
        )}
      </div>

      {abierta && (
        <div className="pr-3" style={{ paddingLeft: profundidad * 18 + 36 }}>
          {seccion.content && (
            <p className="pb-3 text-sm whitespace-pre-line text-ink-muted">
              {seccion.content}
              {seccion.content_length && seccion.content_length > seccion.content.length && '…'}
            </p>
          )}

          {hijos.length > 0 && (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {hijos.map((hijo) => (
                <SeccionEnArbol
                  key={hijo.id}
                  seccion={hijo}
                  hijosPorPadre={hijosPorPadre}
                  abiertas={abiertas}
                  onAlternar={onAlternar}
                  profundidad={profundidad + 1}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Resultados({
  results,
  evaluacion,
  pendientes,
  validando,
  aviso,
  onValidar,
}: {
  results: EvaluationResultRecord[];
  evaluacion: EvaluationRecord | undefined;
  pendientes: number;
  validando: boolean;
  aviso: string | null;
  onValidar: (evaluationId: string) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Este documento aún no se ha evaluado contra una matriz.
      </p>
    );
  }

  return (
    <div>
      {evaluacion && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-sev-medium-bg px-4 py-3 text-sm text-sev-medium-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Motor: {ENGINE_LABEL[evaluacion.engine]}. Ejecutada el{' '}
          {new Date(evaluacion.created_at).toLocaleString('es-PE')}.
        </p>
      )}

      {evaluacion && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3">
          {evaluacion.validated_at ? (
            <p className="flex items-center gap-2 text-sm text-sev-low-ink">
              <FileCheck2 className="size-4" aria-hidden />
              Validada por {evaluacion.validated_by} el{' '}
              {new Date(evaluacion.validated_at).toLocaleString('es-PE')}.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                {pendientes > 0
                  ? `Quedan ${pendientes} hallazgo(s) sin decidir. La conformidad requiere resolverlos primero.`
                  : 'Sin hallazgos pendientes: la evaluación puede validarse.'}
              </p>
              <button
                type="button"
                onClick={() => onValidar(evaluacion.id)}
                disabled={validando || pendientes > 0}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileCheck2 className="size-[18px]" aria-hidden />
                {validando ? 'Validando…' : 'Validar evaluación'}
              </button>
            </>
          )}
        </div>
      )}

      {aviso && (
        <p className="mb-4 rounded-lg bg-sev-high-bg px-4 py-3 text-sm text-sev-high-ink">{aviso}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="bg-canvas/70 text-[0.6875rem] tracking-[0.12em] text-ink-muted uppercase">
              <th className="px-5 py-3 font-semibold">Criterio</th>
              <th className="px-5 py-3 font-semibold">Resultado</th>
              <th className="px-5 py-3 font-semibold">Puntaje</th>
              <th className="px-5 py-3 font-semibold">Peso</th>
              <th className="px-5 py-3 font-semibold">Aporte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {results.map((result) => (
              <tr key={result.id} className="align-top">
                <td className="px-5 py-3">
                  <p className="text-xs text-ink-muted">{result.dimension}</p>
                  <p className="font-medium text-ink">{result.criterion_description}</p>
                  {result.criterion_indicator && (
                    <p className="mt-0.5 max-w-lg text-xs text-ink-muted">{result.criterion_indicator}</p>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${OUTCOME_TONE[result.result]}`}
                  >
                    {OUTCOME_LABEL[result.result]}
                  </span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-muted">
                  {result.raw_score ?? '—'} / {result.scale_max ?? 5}
                </td>
                <td className="px-5 py-3 text-ink-muted">{result.criterion_weight ?? '—'}%</td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-muted">
                  {result.weighted_score !== null ? `${result.weighted_score.toFixed(1)} pts` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SOURCE_TONE: Record<FindingSource, string> = {
  evaluacion: 'bg-blue-50 text-blue-700',
  normativa: 'bg-violet-50 text-violet-700',
  similitud: 'bg-amber-50 text-amber-700',
};

/** Orden de presentación: primero lo más grave. */
const ORDEN_RIESGO: Record<Risk, number> = { critico: 0, alto: 1, medio: 2, bajo: 3 };

const ESTADO_TONE: Record<FindingStatus, string> = {
  pendiente: 'bg-slate-100 text-slate-600',
  aceptado: 'bg-blue-50 text-blue-700',
  descartado: 'bg-slate-100 text-slate-500',
  subsanado: 'bg-sev-low-bg text-sev-low-ink',
};

/** Decisiones que puede tomar el revisor sobre un hallazgo. */
const DECISIONES: { estado: FindingStatus; etiqueta: string }[] = [
  { estado: 'aceptado', etiqueta: 'Aceptar' },
  { estado: 'subsanado', etiqueta: 'Subsanado' },
  { estado: 'descartado', etiqueta: 'Descartar' },
];

function Hallazgos({
  findings,
  onDecidir,
}: {
  findings: FindingRecord[];
  onDecidir: (findingId: number, status: FindingStatus) => void;
}) {
  if (findings.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Sin hallazgos registrados. Use «Ejecutar contraste» para validar las citas normativas y
        comparar el documento con el repositorio.
      </p>
    );
  }

  const ordenados = [...findings].sort(
    (a, b) => ORDEN_RIESGO[a.risk] - ORDEN_RIESGO[b.risk],
  );

  return (
    <ul className="divide-y divide-hairline">
      {ordenados.map((finding) => (
        <li key={finding.id} className="py-4">
          <div className="flex items-start gap-4">
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${RISK_TONE[finding.risk]}`}
            >
              {RISK_LABEL[finding.risk]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${SOURCE_TONE[finding.source]}`}
                >
                  {SOURCE_LABEL[finding.source]}
                </span>
                {finding.dimension}
              </p>
              <p className="mt-1 font-medium text-ink">{finding.message}</p>

              {finding.evidence_text && (
                <blockquote className="mt-2 border-l-2 border-hairline pl-3 text-sm text-ink-muted italic">
                  {finding.evidence_text}
                </blockquote>
              )}
              {finding.evidence_location && (
                <p className="mt-1 text-xs text-ink-muted">{finding.evidence_location}</p>
              )}
              {finding.recommendation && (
                <p className="mt-2 text-sm text-ink">
                  <strong className="font-medium">Recomendación:</strong> {finding.recommendation}
                </p>
              )}
              {finding.reference_label && (
                <p className="mt-1 text-xs text-ink-muted">Contrastado con: {finding.reference_label}</p>
              )}

              {/* Etapa 7: el sistema detecta, una persona decide. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_TONE[finding.status]}`}
                >
                  {FINDING_STATUS_LABEL[finding.status]}
                </span>

                {finding.status === 'pendiente' ? (
                  DECISIONES.map((decision) => (
                    <button
                      key={decision.estado}
                      type="button"
                      onClick={() => onDecidir(finding.id, decision.estado)}
                      className="rounded-lg border border-hairline px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-brand hover:text-brand"
                    >
                      {decision.etiqueta}
                    </button>
                  ))
                ) : (
                  <>
                    {finding.resolved_by && (
                      <span className="text-xs text-ink-muted">
                        {finding.resolved_by}
                        {finding.resolved_at
                          ? ` · ${new Date(finding.resolved_at).toLocaleDateString('es-PE')}`
                          : ''}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDecidir(finding.id, 'pendiente')}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-brand"
                    >
                      Reabrir
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
