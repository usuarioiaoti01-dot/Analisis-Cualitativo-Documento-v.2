'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { DOCUMENT_TYPES } from '@/lib/types';
import { Modal } from './Modal';

/** Tamaño máximo admitido por el formulario de carga. */
const MAX_SIZE_MB = 25;
const ACCEPTED = '.pdf,.docx,.xlsx';

interface CargarDocumentoModalProps {
  onClose: () => void;
  /** Sube el archivo; el servidor lo guarda y extrae su texto. */
  onSubmit: (file: File, documentType: string) => Promise<void>;
}

/** Tamaño legible para el aviso bajo el nombre del archivo. */
function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CargarDocumentoModal({ onClose, onSubmit }: CargarDocumentoModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function acceptFile(candidate: File | undefined) {
    if (!candidate) return;
    if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_SIZE_MB} MB permitidos.`);
      return;
    }
    setError(null);
    setFile(candidate);
  }

  async function handleSubmit() {
    if (!file) {
      setError('Seleccione un archivo para iniciar la evaluación.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit(file, documentType);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible registrar el documento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Incorporar documento"
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
            {saving ? 'Procesando archivo…' : 'Iniciar evaluación'}
          </button>
        </>
      }
    >
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          acceptFile(event.dataTransfer.files[0]);
        }}
        className="rounded-lg border border-dashed border-hairline bg-canvas/50 px-6 py-9 text-center"
      >
        <Upload className="mx-auto size-7 text-brand" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-ink">
          {file ? file.name : 'Seleccione o arrastre un archivo'}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {file
            ? `${formatearTamano(file.size)} · el texto se extraerá al cargar`
            : `PDF, DOCX o XLSX · hasta ${MAX_SIZE_MB} MB`}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-blue-100"
        >
          Seleccionar archivo
        </button>
      </div>

      <label className="mt-5 block">
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

      {error && <p className="mt-3 text-sm text-sev-high-ink">{error}</p>}
    </Modal>
  );
}
