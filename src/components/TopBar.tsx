'use client';

import { Bell, Upload } from 'lucide-react';

interface TopBarProps {
  eyebrow: string;
  title: string;
  /** Punto rojo sobre la campana cuando hay hallazgos sin revisar. */
  hasAlerts?: boolean;
  onUpload: () => void;
}

export function TopBar({ eyebrow, title, hasAlerts = true, onUpload }: TopBarProps) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex size-10 items-center justify-center rounded-lg border border-hairline bg-white text-ink-muted transition-colors hover:text-ink"
        >
          <Bell className="size-[18px]" aria-hidden />
          {hasAlerts && (
            <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-rose-500" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={onUpload}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          <Upload className="size-[18px]" aria-hidden />
          Cargar documento
        </button>
      </div>
    </header>
  );
}
