'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DEFAULT_CRITERIA } from '@/lib/rubric';
import { DOCUMENT_TYPES, type CriterionRecord } from '@/lib/types';
import { Modal } from './Modal';

interface NuevaMatrizModalProps {
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    document_type: string;
    criteria: CriterionRecord[];
  }) => Promise<void>;
}

export function NuevaMatrizModal({ onClose, onSubmit }: NuevaMatrizModalProps) {
  const [name, setName] = useState('Matriz general de calidad documental');
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0]);
  const [criteria, setCriteria] = useState<CriterionRecord[]>(
    DEFAULT_CRITERIA.map((criterion) => ({ ...criterion })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalWeight = criteria.reduce((acc, criterion) => acc + Number(criterion.weight || 0), 0);
  const balanced = totalWeight === 100;

  function updateCriterion(index: number, patch: Partial<CriterionRecord>) {
    setCriteria((current) =>
      current.map((criterion, position) => (position === index ? { ...criterion, ...patch } : criterion)),
    );
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Indique el nombre de la matriz.');
      return;
    }
    if (!balanced) {
      setError(`La suma de las ponderaciones debe ser 100%. Suma actual: ${totalWeight}%.`);
      return;
    }

    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), document_type: documentType, criteria });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible guardar la matriz.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="lg"
      title="Nueva matriz de evaluación"
      description="La suma de las ponderaciones debe ser 100%."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar matriz'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label>
          <span className="block text-sm font-medium text-ink">Nombre de la matriz</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="block text-sm font-medium text-ink">Tipo documental</span>
          <select
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 rounded-lg border border-hairline">
        <div className="flex items-center justify-between bg-canvas/70 px-4 py-2.5 text-[0.6875rem] tracking-[0.12em] text-ink-muted uppercase">
          <span className="font-semibold">Dimensión y criterio</span>
          <span className="font-semibold">Peso</span>
        </div>

        <ul className="divide-y divide-hairline">
          {criteria.map((criterion, index) => (
            <li key={index} className="flex items-center gap-3 px-4 py-3">
              <input
                value={criterion.dimension}
                onChange={(event) => updateCriterion(index, { dimension: event.target.value })}
                aria-label={`Dimensión ${index + 1}`}
                className="w-40 shrink-0 rounded-lg border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <input
                value={criterion.description}
                onChange={(event) => updateCriterion(index, { description: event.target.value })}
                aria-label={`Criterio ${index + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={criterion.weight}
                onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })}
                aria-label={`Peso del criterio ${index + 1}`}
                className="w-16 shrink-0 rounded-lg border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setCriteria((current) => current.filter((_, i) => i !== index))}
                aria-label={`Eliminar criterio ${index + 1}`}
                className="shrink-0 text-ink-muted transition-colors hover:text-sev-high-ink"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() =>
              setCriteria((current) => [...current, { dimension: '', description: '', weight: 0 }])
            }
            className="text-sm font-medium text-brand hover:underline"
          >
            + Agregar criterio
          </button>
        </div>

        <div
          className={`flex items-center justify-between px-4 py-3 text-sm ${
            balanced ? 'bg-emerald-50/70 text-ink' : 'bg-sev-high-bg text-sev-high-ink'
          }`}
        >
          <span>Ponderación total</span>
          <strong>{totalWeight}%</strong>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-sev-high-ink">{error}</p>}
    </Modal>
  );
}
