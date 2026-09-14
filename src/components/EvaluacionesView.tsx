'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Pencil,
  Play,
  Plug,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { TemplateRecord } from '@/lib/types';

export type Motor = 'ai' | 'deterministic';

interface EvaluacionesViewProps {
  documents: { id: string; title: string }[];
  templates: TemplateRecord[];
  /** Estado del motor con IA, según lo informa el servidor. */
  motor: { ia_disponible: boolean; modelo: string } | null;
  onRun: (documentId: string, templateId: number, motor: Motor) => Promise<string>;
  onNewTemplate: () => void;
  onEditTemplate: (template: TemplateRecord) => void;
  /** Devuelve un mensaje cuando la matriz no puede eliminarse. */
  onDeleteTemplate: (template: TemplateRecord) => Promise<string | null>;
}

export function EvaluacionesView({
  documents,
  templates,
  motor,
  onRun,
  onNewTemplate,
  onEditTemplate,
  onDeleteTemplate,
}: EvaluacionesViewProps) {
  const [documentId, setDocumentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorMatriz, setErrorMatriz] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [estadoMotor, setEstadoMotor] = useState<{ valida: boolean; mensaje: string } | null>(null);

  /** Comprueba que la credencial funciona antes de lanzar una evaluación larga. */
  async function probarConexion() {
    setProbando(true);
    setEstadoMotor(null);
    try {
      const estado = await fetch('/api/motor/estado').then((r) => r.json());
      setEstadoMotor({ valida: estado.valida, mensaje: estado.mensaje });
    } catch {
      setEstadoMotor({ valida: false, mensaje: 'No fue posible contactar con el servidor.' });
    } finally {
      setProbando(false);
    }
  }

  const iaDisponible = motor?.ia_disponible ?? false;
  const [engine, setEngine] = useState<Motor>('ai');
  const motorEfectivo: Motor = iaDisponible ? engine : 'deterministic';

  const canRun = documentId !== '' && templateId !== '' && !running;

  async function handleRun() {
    if (!canRun) return;
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      setMessage(await onRun(documentId, Number(templateId), motorEfectivo));
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No fue posible ejecutar la evaluación.',
      );
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

          <label className="lg:w-56">
            <span className="block text-sm font-medium text-ink">Motor</span>
            <select
              value={motorEfectivo}
              onChange={(event) => setEngine(event.target.value as Motor)}
              disabled={!iaDisponible}
              className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand disabled:bg-canvas disabled:text-ink-muted"
            >
              <option value="ai">Análisis del contenido (IA)</option>
              <option value="deterministic">Provisional (sin analizar)</option>
            </select>
          </label>

          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="size-[18px]" aria-hidden />
            {running ? 'Evaluando…' : 'Iniciar'}
          </button>
        </div>

        {!iaDisponible && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-sev-medium-bg px-4 py-3 text-sm text-sev-medium-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            El motor de análisis no está configurado: falta la credencial de la API en el servidor.
            Solo está disponible el motor provisional, que no analiza el contenido del documento.
          </p>
        )}

        {iaDisponible && motorEfectivo === 'ai' && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            El análisis lee el documento completo y puede tardar varios minutos. Modelo:{' '}
            <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">{motor?.modelo}</code>.
            <button
              type="button"
              onClick={probarConexion}
              disabled={probando}
              className="flex items-center gap-1.5 font-medium text-brand hover:underline disabled:opacity-60"
            >
              <Plug className="size-3.5" aria-hidden />
              {probando ? 'Probando…' : 'Probar conexión'}
            </button>
          </p>
        )}

        {estadoMotor && (
          <p
            className={`mt-3 rounded-lg px-4 py-3 text-sm ${
              estadoMotor.valida
                ? 'bg-sev-low-bg text-sev-low-ink'
                : 'bg-sev-high-bg text-sev-high-ink'
            }`}
          >
            {estadoMotor.mensaje}
          </p>
        )}

        {message && <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-sev-high-bg px-4 py-3 text-sm text-sev-high-ink">{error}</p>}
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
    </div>
  );
}
