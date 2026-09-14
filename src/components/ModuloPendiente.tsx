'use client';

import { FileSearch } from 'lucide-react';

interface ModuloPendienteProps {
  title: string;
  onBack: () => void;
}

/** Marcador de los módulos que todavía no tienen implementación funcional. */
export function ModuloPendiente({ title, onBack }: ModuloPendienteProps) {
  return (
    <section className="card mx-auto max-w-2xl px-8 py-14 text-center">
      <FileSearch className="mx-auto size-8 text-brand" aria-hidden />
      <h2 className="mt-5 text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Este módulo se encuentra preparado para la siguiente configuración del sistema.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
      >
        Volver al resumen
      </button>
    </section>
  );
}
