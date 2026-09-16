'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Ancho máximo del diálogo; la matriz y la vista previa necesitan más espacio. */
  size?: 'md' | 'lg' | 'xl';
}

export function Modal({ title, description, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* El diálogo nunca pasa del alto de la ventana: encabezado y pie quedan
          fijos y lo que crece —una matriz de diez criterios, un visor de PDF—
          se desplaza por dentro. Antes el contenido largo se salía por arriba
          y por abajo, y el botón de guardar quedaba fuera de la pantalla. */}
      <div
        className={`flex max-h-[calc(100vh-3rem)] w-full flex-col rounded-xl bg-white shadow-xl ${
          size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-muted transition-colors hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        <div className="flex shrink-0 justify-end gap-3 px-6 pb-6">{footer}</div>
      </div>
    </div>
  );
}
