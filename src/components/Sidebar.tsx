'use client';

import {
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileText,
  Gavel,
  LayoutGrid,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { SectionId } from '@/lib/sections';
import { SECTIONS } from '@/lib/sections';
import { USUARIO_ACTUAL } from '@/lib/sesion';

const ICONS = {
  resumen: LayoutGrid,
  documentos: Copy,
  evaluaciones: ClipboardCheck,
  matrices: SlidersHorizontal,
  catalogo: Gavel,
  usuarios: Users,
  configuracion: Settings,
} as const;

interface SidebarProps {
  active: SectionId;
  onSelect: (section: SectionId) => void;
  /** Evaluaciones pendientes de atención; se muestra como contador ámbar. */
  pendingCount: number;
}

export function Sidebar({ active, onSelect, pendingCount }: SidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-white">
      <div className="flex items-center gap-3 px-6 pt-6 pb-8">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand">
          <FileText className="size-5" aria-hidden />
        </span>
        <span className="text-xl font-extrabold tracking-tight">
          DOCU<span className="text-accent">CALIDAD</span>
        </span>
      </div>

      <p className="px-6 pb-3 text-[0.6875rem] font-semibold tracking-[0.18em] text-sidebar-muted uppercase">
        Espacio de trabajo
      </p>

      <nav className="flex flex-col gap-1 px-3">
        {SECTIONS.map((section) => {
          const Icon = ICONS[section.id];
          const isActive = section.id === active;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-active font-medium text-white'
                  : 'text-slate-200/90 hover:bg-white/5'
              }`}
            >
              {isActive && (
                <span className="absolute top-2 bottom-2 -left-0.5 w-1 rounded-full bg-accent" aria-hidden />
              )}
              <Icon className="size-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{section.label}</span>
              {section.id === 'evaluaciones' && pendingCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-[0.6875rem] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-6 pb-4">
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-[18px] text-accent" aria-hidden />
            <div>
              <p className="text-sm font-medium">Evaluación trazable</p>
              <p className="text-xs text-sidebar-muted">Evidencia y validación humana</p>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="flex items-center gap-3 bg-sidebar-active px-6 py-4 text-left transition-colors hover:bg-white/10"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-accent/25 text-sm font-semibold text-accent">
          {USUARIO_ACTUAL.iniciales}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{USUARIO_ACTUAL.nombre}</span>
          <span className="block text-xs text-sidebar-muted">{USUARIO_ACTUAL.rol}</span>
        </span>
        <ChevronRight className="size-4 text-sidebar-muted" aria-hidden />
      </button>
    </aside>
  );
}
