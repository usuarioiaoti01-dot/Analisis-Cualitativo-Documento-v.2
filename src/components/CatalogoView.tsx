'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Search, Upload } from 'lucide-react';
import type { NormRecord } from '@/lib/types';

interface CatalogoViewProps {
  norms: NormRecord[];
  onLoadPriority: () => Promise<number>;
}

export function CatalogoView({ norms, onLoadPriority }: CatalogoViewProps) {
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return norms;
    return norms.filter((norm) =>
      [norm.code, norm.title, norm.issuer, norm.subject].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [norms, query]);

  async function handleLoad() {
    setLoading(true);
    try {
      const total = await onLoadPriority();
      setNotice(`Se incorporaron ${total} referencias prioritarias del inventario interno.`);
    } catch {
      setNotice('No fue posible incorporar las referencias prioritarias.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            CATÁLOGO NORMATIVO DIRECCIÓN DE POLÍTICAS - SERFOR
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Repositorio interno y referencias para sustentar evaluaciones.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {norms.length === 0
              ? 'Sin normas cargadas.'
              : `${norms.length} ${norms.length === 1 ? 'norma cargada' : 'normas cargadas'}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          <Upload className="size-[18px]" aria-hidden />
          {loading ? 'Cargando…' : 'Cargar normas prioritarias'}
        </button>
      </div>

      <label className="mt-5 flex items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 focus-within:border-brand">
        <Search className="size-[18px] text-ink-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por norma, materia o entidad"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </label>

      {notice && <p className="mt-4 text-sm text-ink-muted">{notice}</p>}

      {norms.length === 0 ? (
        <p className="py-14 text-center text-sm text-ink-muted">Aún no hay normas cargadas.</p>
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {results.map((norm) => (
            <li key={norm.id} className="flex items-start gap-4 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <BookOpen className="size-[18px]" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{norm.code}</p>
                <p className="mt-0.5 text-sm text-ink">{norm.title}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {norm.issuer} · {norm.subject}
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-sev-low-bg px-2.5 py-1 text-xs font-medium text-sev-low-ink">
                {norm.status}
              </span>
            </li>
          ))}

          {results.length === 0 && (
            <li className="py-10 text-center text-sm text-ink-muted">
              Ninguna norma coincide con la búsqueda.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
