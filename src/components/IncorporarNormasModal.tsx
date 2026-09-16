'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { TIPOS_DE_CATALOGO } from '@/lib/tipos-normativos';
import { Modal } from './Modal';

/** Formatos que el extractor sabe leer. El «.doc» antiguo no está entre ellos. */
const ACEPTADOS = '.pdf,.docx,.xlsx';
const MAX_MB = 25;

interface IncorporarNormasModalProps {
  onClose: () => void;
  /** Sube los archivos elegidos; cada uno se informa por separado al volver. */
  onSubmit: (archivos: File[], docType: string) => Promise<void>;
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Incorporación de normas al catálogo.
 *
 * Antes el botón abría directamente el explorador de archivos: quien lo pulsaba
 * no sabía qué formatos se admitían ni podía revisar la selección antes de
 * subirla, y añadir un archivo olvidado obligaba a repetir toda la carga. Aquí
 * la lista se arma primero —se puede añadir en varias tandas y quitar lo que
 * sobre— y se envía cuando está completa.
 */
export function IncorporarNormasModal({ onClose, onSubmit }: IncorporarNormasModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  // Sin valor inicial a propósito: el tipo lo decide quien carga, y elegir por
  // él metería documentos en la pestaña equivocada, donde nadie los busca.
  const [docType, setDocType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  function agregar(nuevos: FileList | null) {
    if (!nuevos || nuevos.length === 0) return;

    const admitidos: File[] = [];
    const rechazados: string[] = [];

    for (const archivo of Array.from(nuevos)) {
      const extension = archivo.name.slice(archivo.name.lastIndexOf('.')).toLowerCase();

      if (!ACEPTADOS.includes(extension)) {
        rechazados.push(`${archivo.name} (formato no admitido)`);
        continue;
      }
      if (archivo.size > MAX_MB * 1024 * 1024) {
        rechazados.push(`${archivo.name} (supera ${MAX_MB} MB)`);
        continue;
      }
      admitidos.push(archivo);
    }

    // Dos veces el mismo archivo es un descuido al añadir en varias tandas,
    // no una intención: se queda con una copia.
    setArchivos((actuales) => {
      const porNombre = new Map(actuales.map((archivo) => [archivo.name, archivo]));
      for (const archivo of admitidos) porNombre.set(archivo.name, archivo);
      return [...porNombre.values()];
    });

    setError(rechazados.length > 0 ? `Se omitieron: ${rechazados.join('; ')}.` : null);
  }

  async function enviar() {
    if (archivos.length === 0) {
      setError('Elija al menos un archivo.');
      return;
    }
    if (!docType) {
      setError('Elija el tipo documental al que pertenecen.');
      return;
    }

    setSubiendo(true);
    try {
      await onSubmit(archivos, docType);
      onClose();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No fue posible incorporar los archivos.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Modal
      title="INCORPORAR NORMAS"
      description="Word (DOCX), PDF u hoja de cálculo. Una o varias a la vez."
      size="lg"
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
            onClick={enviar}
            disabled={subiendo || archivos.length === 0 || !docType}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-[18px]" aria-hidden />
            {subiendo
              ? 'Incorporando…'
              : `Incorporar ${archivos.length > 0 ? `${archivos.length} archivo(s)` : ''}`.trim()}
          </button>
        </>
      }
    >
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          agregar(event.dataTransfer.files);
        }}
        className="rounded-lg border border-dashed border-hairline bg-canvas/50 px-6 py-9 text-center"
      >
        <Upload className="mx-auto size-7 text-brand" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-ink">
          Seleccione o arrastre uno o varios archivos
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          PDF, DOCX o XLSX · hasta {MAX_MB} MB cada uno
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACEPTADOS}
          multiple
          className="hidden"
          onChange={(event) => {
            agregar(event.target.files);
            // Permite volver a elegir el mismo archivo si se quitó de la lista.
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-blue-100"
        >
          Seleccionar archivos
        </button>
      </div>

      {archivos.length > 0 && (
        <ul className="mt-4 max-h-56 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
          {archivos.map((archivo) => (
            <li key={archivo.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink" title={archivo.name}>
                {archivo.name}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {formatearTamano(archivo.size)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setArchivos((actuales) => actuales.filter((otro) => otro.name !== archivo.name))
                }
                aria-label={`Quitar ${archivo.name}`}
                className="shrink-0 text-ink-muted transition-colors hover:text-sev-high-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-5 block">
        <span className="block text-sm font-medium text-ink">
          Tipo documental <span className="text-sev-high-ink">*</span>
        </span>
        <select
          value={docType}
          onChange={(event) => {
            setDocType(event.target.value);
            setError(null);
          }}
          className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand ${
            docType ? 'border-hairline' : 'border-sev-medium-ink'
          }`}
        >
          <option value="">Elija el tipo…</option>
          {TIPOS_DE_CATALOGO.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.singular}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-muted">
          Determina en qué pestaña del catálogo quedan y qué evaluaciones los consultan.
        </span>
      </label>

      <p className="mt-4 text-xs text-ink-muted">
        De cada archivo se deduce el código, el título, el emisor y la materia. Lo que no pueda
        identificarse se informa al terminar, archivo por archivo.
      </p>

      {error && <p className="mt-3 text-sm text-sev-high-ink">{error}</p>}
    </Modal>
  );
}
