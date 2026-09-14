'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Ancho máximo del diálogo; la matriz de evaluación necesita más espacio. */
  size?: 'md' | 'lg';
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full rounded-xl bg-white shadow-xl ${size === 'lg' ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
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

        <div className="px-6 py-5">{children}</div>

        <div className="flex justify-end gap-3 px-6 pb-6">{footer}</div>
      </div>
    </div>
  );
}
