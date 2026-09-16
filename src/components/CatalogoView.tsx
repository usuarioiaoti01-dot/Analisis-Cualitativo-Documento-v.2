'use client';

import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Database,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { NormRecord, ResultadoIncorporacion } from '@/lib/types';
import { TIPOS_DE_CATALOGO } from '@/lib/tipos-normativos';
import { IncorporarNormasModal } from './IncorporarNormasModal';
import { InventarioModal } from './InventarioModal';

const ESTADO_TONE: Record<ResultadoIncorporacion['estado'], string> = {
  incorporada: 'text-sev-low-ink',
  duplicada: 'text-ink-muted',
  sin_identificar: 'text-sev-medium-ink',
  error: 'text-sev-high-ink',
};

/** Normas por página. Un catálogo de decenas de normas no se navega en una lista única. */
const POR_PAGINA = 10;

const ESTADO_ETIQUETA: Record<ResultadoIncorporacion['estado'], string> = {
  incorporada: 'incorporada(s)',
  duplicada: 'ya estaban',
  sin_identificar: 'sin identificar',
  error: 'con error',
};

interface CatalogoViewProps {
  norms: NormRecord[];
  onRecargar: () => Promise<void>;
  onLoadPriority: () => Promise<number>;
}

export function CatalogoView({ norms, onRecargar, onLoadPriority }: CatalogoViewProps) {
  const [query, setQuery] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoIncorporacion[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [pagina, setPagina] = useState(0);
  const [informeAbierto, setInformeAbierto] = useState(false);
  const [subiendoAbierto, setSubiendoAbierto] = useState(false);
  const [inventarioAbierto, setInventarioAbierto] = useState(false);
  /** Pestaña activa: un identificador de tipo, o «todas». */
  const [tipoActivo, setTipoActivo] = useState('todas');

  /**
   * Pestañas: solo los tipos que tienen normas, en el orden del catálogo. Una
   * pestaña vacía no informa de nada y estorba para llegar a las que sí tienen.
   */
  const pestanas = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const norm of norms) {
      const tipo = norm.doc_type ?? 'otro';
      conteo.set(tipo, (conteo.get(tipo) ?? 0) + 1);
    }

    return [
      { id: 'todas', etiqueta: 'TODAS', total: norms.length },
      ...TIPOS_DE_CATALOGO.filter((tipo) => conteo.has(tipo.id)).map((tipo) => ({
        id: tipo.id,
        etiqueta: tipo.etiqueta,
        total: conteo.get(tipo.id) ?? 0,
      })),
    ];
  }, [norms]);

  const encontradas = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return norms.filter((norm) => {
      if (tipoActivo !== 'todas' && (norm.doc_type ?? 'otro') !== tipoActivo) return false;
      if (!needle) return true;

      return [norm.code, norm.title, norm.issuer, norm.subject].some((campo) =>
        campo.toLowerCase().includes(needle),
      );
    });
  }, [norms, query, tipoActivo]);

  const totalPaginas = Math.max(1, Math.ceil(encontradas.length / POR_PAGINA));
  // Al filtrar, la página actual puede quedar fuera de rango.
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const visibles = encontradas.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

  /** Resumen del último informe de carga, para no obligar a leerlo entero. */
  const conteoResultados = useMemo(() => {
    if (!resultados) return null;
    const conteo: Partial<Record<ResultadoIncorporacion['estado'], number>> = {};
    for (const r of resultados) conteo[r.estado] = (conteo[r.estado] ?? 0) + 1;
    return conteo;
  }, [resultados]);

  /** Sube uno o varios archivos; cada uno se informa por separado. */
  async function incorporar(archivos: File[], docType: string) {
    if (archivos.length === 0) return;

    setCargando(true);
    setResultados(null);
    setAviso(null);
    try {
      const form = new FormData();
      for (const archivo of archivos) form.append('files', archivo);
      form.append('doc_type', docType);

      const response = await fetch('/api/catalog/documentos', { method: 'POST', body: form });
      const payload = await response.json();

      if (!response.ok && !payload.resultados) {
        setAviso(payload.error ?? 'No fue posible incorporar los archivos.');
        return;
      }

      setResultados(payload.resultados);
      // Un informe de treinta archivos no debe empujar la lista fuera de la vista.
      setInformeAbierto(payload.resultados.length <= 5);
      setPagina(0);
      await onRecargar();
    } finally {
      setCargando(false);
    }
  }

  /** Trae del Inventario Normativo las fichas elegidas. */
  async function traerDelInventario(referencias: string[]) {
    setCargando(true);
    setResultados(null);
    setAviso(null);
    try {
      const response = await fetch('/api/catalog/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referencias }),
      });
      const payload = await response.json();

      if (!response.ok && !payload.resultados) {
        setAviso(payload.error ?? 'No fue posible traer las normas del inventario.');
        return;
      }

      setResultados(payload.resultados);
      setInformeAbierto(payload.resultados.length <= 5);
      setPagina(0);
      await onRecargar();
    } finally {
      setCargando(false);
    }
  }

  async function eliminar(norm: NormRecord) {
    const response = await fetch(`/api/catalog/${norm.id}`, { method: 'DELETE' });
    if (response.ok) await onRecargar();
  }

  async function guardar(normId: number, cambios: Partial<NormRecord>) {
    const response = await fetch(`/api/catalog/${normId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAviso(payload.error ?? 'No fue posible guardar los cambios.');
      return;
    }
    setEditando(null);
    setAviso(null);
    await onRecargar();
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

        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setSubiendoAbierto(true)}
            disabled={cargando}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            <Upload className="size-[18px]" aria-hidden />
            {cargando ? 'Incorporando…' : 'Incorporar normas'}
          </button>
          <p className="text-xs text-ink-muted">Word (DOCX), PDF o XLSX · una o varias a la vez</p>

          <button
            type="button"
            onClick={() => setInventarioAbierto(true)}
            disabled={cargando}
            className="flex items-center gap-2 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
          >
            <Database className="size-[18px]" aria-hidden />
            Traer del Inventario Normativo
          </button>

          {norms.length === 0 && (
            <button
              type="button"
              onClick={async () => setAviso(`Se incorporaron ${await onLoadPriority()} referencias.`)}
              className="text-xs font-medium text-brand hover:underline"
            >
              Cargar las 10 normas prioritarias
            </button>
          )}
        </div>
      </div>

      {resultados && conteoResultados && (
        <div className="mt-5 rounded-lg border border-hairline">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">
              <strong className="text-ink">{resultados.length} archivo(s)</strong>
              <span className="text-ink-muted">
                {' · '}
                {(Object.keys(conteoResultados) as ResultadoIncorporacion['estado'][])
                  .map((estado) => `${conteoResultados[estado]} ${ESTADO_ETIQUETA[estado]}`)
                  .join(' · ')}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setInformeAbierto((valor) => !valor)}
                className="text-sm font-medium text-brand hover:underline"
              >
                {informeAbierto ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              <button
                type="button"
                onClick={() => setResultados(null)}
                aria-label="Cerrar el informe de carga"
                className="text-ink-muted hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {informeAbierto && (
            <ul className="max-h-64 space-y-1 overflow-y-auto border-t border-hairline px-4 py-3 text-sm">
              {resultados.map((resultado) => (
                <li key={resultado.archivo} className="flex flex-wrap gap-x-2">
                  <span className={`font-medium ${ESTADO_TONE[resultado.estado]}`}>
                    {resultado.norma?.code ?? resultado.archivo}
                  </span>
                  <span className="text-ink-muted">— {resultado.detalle}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aviso && (
        <p className="mt-4 rounded-lg bg-sev-medium-bg px-4 py-3 text-sm text-sev-medium-ink">
          {aviso}
        </p>
      )}

      {/* El catálogo es la línea base de conocimiento de las evaluaciones: se
          navega por tipo, que es como se revisa si está completo. */}
      <nav
        className="mt-6 flex flex-wrap gap-1 border-b border-hairline"
        aria-label="Tipos del catálogo"
      >
        {pestanas.map((pestana) => (
          <button
            key={pestana.id}
            type="button"
            onClick={() => {
              setTipoActivo(pestana.id);
              setPagina(0);
            }}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold tracking-[0.08em] transition-colors ${
              tipoActivo === pestana.id
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {pestana.etiqueta}
            <span className="ml-1.5 font-normal text-ink-muted">{pestana.total}</span>
          </button>
        ))}
      </nav>

      <label className="mt-4 flex items-center gap-2 rounded-lg border border-hairline px-3 py-2.5 focus-within:border-brand">
        <Search className="size-[18px] text-ink-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPagina(0);
          }}
          placeholder="Buscar por norma, materia o entidad"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </label>

      {norms.length === 0 ? (
        <p className="py-14 text-center text-sm text-ink-muted">
          Aún no hay normas cargadas. Use «Incorporar normas» para añadirlas.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {visibles.map((norm) =>
            editando === norm.id ? (
              <FilaEditable
                key={norm.id}
                norm={norm}
                onCancelar={() => setEditando(null)}
                onGuardar={(cambios) => guardar(norm.id, cambios)}
              />
            ) : (
              <FilaNorma
                key={norm.id}
                norm={norm}
                onEditar={() => setEditando(norm.id)}
                onEliminar={() => eliminar(norm)}
              />
            ),
          )}

          {encontradas.length === 0 && (
            <li className="py-10 text-center text-sm text-ink-muted">
              Ninguna norma coincide con la búsqueda.
            </li>
          )}
        </ul>
      )}

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
          <p className="text-sm text-ink-muted">
            {paginaActual * POR_PAGINA + 1}–
            {Math.min((paginaActual + 1) * POR_PAGINA, encontradas.length)} de {encontradas.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina(paginaActual - 1)}
              disabled={paginaActual === 0}
              className="flex items-center gap-1 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Anterior
            </button>
            <span className="text-sm text-ink-muted">
              {paginaActual + 1} / {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina(paginaActual + 1)}
              disabled={paginaActual >= totalPaginas - 1}
              className="flex items-center gap-1 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      {subiendoAbierto && (
        <IncorporarNormasModal
          onClose={() => setSubiendoAbierto(false)}
          onSubmit={incorporar}
        />
      )}

      {inventarioAbierto && (
        <InventarioModal
          onClose={() => setInventarioAbierto(false)}
          onTraer={traerDelInventario}
        />
      )}
    </section>
  );
}

function FilaNorma({
  norm,
  onEditar,
  onEliminar,
}: {
  norm: NormRecord;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  return (
    <li className="flex items-start gap-4 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <BookOpen className="size-[18px]" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{norm.code}</p>
        <p className="mt-0.5 text-sm text-ink">{norm.title}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {norm.issuer} · {norm.subject}
          {norm.file_name && ` · ${norm.file_name}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="rounded-full bg-sev-low-bg px-2.5 py-1 text-xs font-medium text-sev-low-ink">
          {norm.status}
        </span>
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Corregir ${norm.code}`}
          className="rounded-lg p-1.5 text-ink-muted transition-colors hover:text-brand"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onEliminar}
          aria-label={`Retirar ${norm.code}`}
          className="rounded-lg p-1.5 text-ink-muted transition-colors hover:text-sev-high-ink"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function FilaEditable({
  norm,
  onCancelar,
  onGuardar,
}: {
  norm: NormRecord;
  onCancelar: () => void;
  onGuardar: (cambios: Partial<NormRecord>) => void;
}) {
  const [code, setCode] = useState(norm.code);
  const [title, setTitle] = useState(norm.title);
  const [issuer, setIssuer] = useState(norm.issuer);
  const [subject, setSubject] = useState(norm.subject);
  const [status, setStatus] = useState(norm.status);

  const campo =
    'w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-brand';

  return (
    <li className="py-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="sm:col-span-1">
          <span className="text-xs text-ink-muted">Código</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={campo} />
        </label>
        <label className="sm:col-span-1">
          <span className="text-xs text-ink-muted">Estado</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={campo}>
            <option value="Vigente">Vigente</option>
            <option value="Derogada">Derogada</option>
            <option value="Modificada">Modificada</option>
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs text-ink-muted">Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={campo} />
        </label>
        <label>
          <span className="text-xs text-ink-muted">Emisor</span>
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} className={campo} />
        </label>
        <label>
          <span className="text-xs text-ink-muted">Materia</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={campo} />
        </label>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onGuardar({ code, title, issuer, subject, status })}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          <Check className="size-4" aria-hidden />
          Guardar
        </button>
      </div>
    </li>
  );
}
