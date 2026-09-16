'use client';

interface TopBarProps {
  eyebrow: string;
  title: string;
}

/**
 * Cabecera de la sección. Solo sitúa: dice dónde está el usuario y nada más.
 * Las acciones viven donde se ejercen —registrar un documento, en el
 * repositorio—, para que no haya dos caminos a lo mismo.
 */
export function TopBar({ eyebrow, title }: TopBarProps) {
  return (
    <header>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
    </header>
  );
}
