'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2, Search } from 'lucide-react';
import { Modal } from './Modal';

interface FichaDelInventario {
  referencia: string;
  tipo: string;
  titulo: string;
  entidad: string | null;
  anio: number | null;
  estado: string | null;
  coleccion: string | null;
  carpeta: string | null;
  parte: string | null;
  ya_en_catalogo: boolean;
}

interface InventarioModalProps {
  onClose: () => void;
  /** Trae las fichas elegidas; devuelve el texto del resultado. */
  onTraer: (referencias: string[]) => Promise<void>;
}

/**
 * Traer normas del Inventario Normativo del SERFOR.
 *
 * El inventario es la fuente institucional; este catálogo solo necesita las
 * normas que sustentan evaluaciones. Por eso no se replica entero: se elige lo
 * que hace falta y se marca lo que ya está, para no traerlo dos veces.
 */
export function InventarioModal({ onClose, onTraer }: InventarioModalProps) {
  const [fichas, setFichas] = useState<FichaDelInventario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configurado, setConfigurado] = useState(true);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [trayendo, setTrayendo] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const respuesta = await fetch('/api/catalog/inventario');
        const payload = await respuesta.json();
        if (cancelado) return;

        if (payload.configurado === false) {
          setConfigurado(false);
          setError(payload.error);
          return;
        }
        if (!respuesta.ok) {
          setError(payload.error ?? 'No fue posible consultar el inventario.');
          return;
        }
        setFichas(payload.documentos);
      } catch {
        if (!cancelado) setError('No fue posible contactar con el servidor.');
      }
    }

    void cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  const encontradas = useMemo(() => {
    if (!fichas) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return fichas;

    return fichas.filter((ficha) =>
      [ficha.titulo, ficha.tipo, ficha.entidad ?? '', ficha.coleccion ?? '', ficha.carpeta ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [fichas, query]);

  function alternar(referencia: string) {
    setElegidas((actuales) => {
      const siguiente = new Set(actuales);
      if (siguiente.has(referencia)) siguiente.delete(referencia);
      else siguiente.add(referencia);
      return siguiente;
    });
  }

  async function traer() {
    if (elegidas.size === 0) return;
    setTrayendo(true);
    try {
      await onTraer([...elegidas]);
      onClose();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No fue posible traer las normas.');
    } finally {
      setTrayendo(false);
    }
  }

  const faltantes = encontradas.filter((ficha) => !ficha.ya_en_catalogo);

  return (
    <Modal
      title="TRAER DEL INVENTARIO NORMATIVO"
      description="Normativa institucional del SERFOR. Elija las que deba sustentar evaluaciones."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={traer}
            disabled={trayendo || elegidas.size === 0}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Database className="size-[18px]" aria-hidden />
            {trayendo ? 'Trayendo…' : `Traer ${elegidas.size > 0 ? elegidas.size : ''}`.trim()}
          </button>
        </>
      }
    >
      {!configurado ? (
        <div className="rounded-lg border border-dashed border-hairline bg-canvas/50 px-6 py-8 text-sm">
          <p className="font-medium text-ink">El enlace todavía no está configurado.</p>
          <p className="mt-2 text-ink-muted">
            El inventario exige sesión iniciada para leer sus documentos. Cree en él una cuenta de
            solo lectura y añada sus credenciales al archivo <code>.env.local</code> del servidor:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas p-3 font-mono text-xs text-ink">
            {'SACD_INVENTARIO_USUARIO=lector@serfor.gob.pe\nSACD_INVENTARIO_CLAVE=…'}
          </pre>
          <p className="mt-3 text-ink-muted">
            Después reinicie la aplicación. Mientras tanto, las normas se incorporan con
            «Incorporar normas».
          </p>
        </div>
      ) : error ? (
        <p className="rounded-lg bg-sev-high-bg px-4 py-3 text-sm text-sev-high-ink">{error}</p>
      ) : fichas === null ? (
        <div className="flex h-40 flex-col items-center justify-center text-sm text-ink-muted">
          <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
          <p className="mt-3">Consultando el inventario…</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-1 items-center gap-2 rounded-lg border border-hairline px-3 py-2">
              <Search className="size-[18px] text-ink-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título, tipo, entidad o colección"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
              />
            </label>
            <button
              type="button"
              onClick={() => setElegidas(new Set(faltantes.map((ficha) => ficha.referencia)))}
              disabled={faltantes.length === 0}
              className="text-sm font-medium text-brand hover:underline disabled:opacity-40"
            >
              Elegir las {faltantes.length} que faltan
            </button>
          </div>

          <p className="mt-2 text-xs text-ink-muted">
            {fichas.length} documento(s) en el inventario ·{' '}
            {fichas.filter((ficha) => ficha.ya_en_catalogo).length} ya están en este catálogo
          </p>

          <ul className="mt-3 max-h-[52vh] divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">
            {encontradas.map((ficha) => (
              <li key={ficha.referencia}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm hover:bg-canvas/50">
                  <input
                    type="checkbox"
                    checked={elegidas.has(ficha.referencia)}
                    onChange={() => alternar(ficha.referencia)}
                    className="mt-1 size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{ficha.titulo}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {[ficha.tipo, ficha.parte, ficha.entidad, ficha.anio, ficha.coleccion]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {ficha.carpeta && (
                      <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                        {ficha.carpeta}
                      </span>
                    )}
                  </span>
                  {ficha.ya_en_catalogo && (
                    <span className="shrink-0 rounded-full bg-sev-low-bg px-2.5 py-1 text-xs font-medium text-sev-low-ink">
                      Ya está
                    </span>
                  )}
                </label>
              </li>
            ))}

            {encontradas.length === 0 && (
              <li className="py-10 text-center text-sm text-ink-muted">
                Ningún documento coincide con la búsqueda.
              </li>
            )}
          </ul>
        </>
      )}
    </Modal>
  );
}
