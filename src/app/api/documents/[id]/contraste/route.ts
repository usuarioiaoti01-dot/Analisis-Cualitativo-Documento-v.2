import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { inTransaction, queryAll, queryOne } from '@/lib/sqlite';
import { clavesDeNorma, extraerCitas, type Cita } from '@/lib/citas';
import {
  UMBRAL_CONTENCION,
  UMBRAL_JACCARD,
  clasificar,
  comparar,
  fragmentosComunes,
  huellaDe,
  riesgoDe,
} from '@/lib/similitud';
import type { NormRecord, Risk } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Hallazgo listo para insertar, sin los campos que fija la propia ruta. */
interface HallazgoNuevo {
  dimension: string;
  source: 'normativa' | 'similitud';
  risk: Risk;
  message: string;
  evidence_text: string | null;
  evidence_location: string | null;
  section_id: number | null;
  recommendation: string | null;
  reference_kind: string | null;
  reference_id: string | null;
  reference_label: string | null;
}

interface Seccion {
  id: number;
  heading: string;
  numbering: string | null;
  page_from: number | null;
  char_start: number;
  char_end: number;
}

/**
 * POST /api/documents/[id]/contraste — ejecuta las etapas 5 y 6.
 *
 * Cuerpo opcional: `{ etapas: ['normativa', 'similitud'] }`. Por omisión corre
 * ambas. Ninguna usa modelos de lenguaje: el texto no sale del equipo.
 *
 * Los hallazgos de cada etapa se reemplazan en cada ejecución, de modo que
 * volver a correr el contraste no acumula duplicados.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let etapas: string[] = ['normativa', 'similitud'];
  try {
    const body = await request.json();
    if (Array.isArray(body?.etapas) && body.etapas.length > 0) etapas = body.etapas;
  } catch {
    // Sin cuerpo: se corren ambas etapas.
  }

  const db = getDb();

  const documento = queryOne<{ id: string; title: string }>(
    db,
    'SELECT id, title FROM documents WHERE id = ?',
    id,
  );
  if (!documento) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  const contenido = queryOne<{ content: string }>(
    db,
    'SELECT content FROM document_contents WHERE document_id = ?',
    id,
  );
  if (!contenido) {
    return NextResponse.json(
      { error: 'El documento no tiene texto extraído; no hay nada que contrastar.' },
      { status: 409 },
    );
  }

  const secciones = queryAll<Seccion>(
    db,
    `SELECT id, heading, numbering, page_from, char_start, char_end
     FROM document_sections WHERE document_id = ? ORDER BY ordinal`,
    id,
  );

  const hallazgos: HallazgoNuevo[] = [];
  const resumen: Record<string, unknown> = {};

  if (etapas.includes('normativa')) {
    const resultado = validarNormativa(db, contenido.content, secciones);
    hallazgos.push(...resultado.hallazgos);
    resumen.normativa = resultado.resumen;
  }

  if (etapas.includes('similitud')) {
    const resultado = compararRepositorio(db, documento, contenido.content);
    hallazgos.push(...resultado.hallazgos);
    resumen.similitud = resultado.resumen;
  }

  const now = Date.now();

  inTransaction(db, () => {
    // Reemplazo por etapa: no se tocan los hallazgos de otras fuentes.
    const borrar = db.prepare('DELETE FROM findings WHERE document_id = ? AND source = ?');
    for (const etapa of etapas) borrar.run(id, etapa);

    const insertar = db.prepare(
      `INSERT INTO findings
         (document_id, dimension, source, risk, message, evidence_text, evidence_location,
          section_id, recommendation, reference_kind, reference_id, reference_label,
          status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    );

    for (const hallazgo of hallazgos) {
      insertar.run(
        id,
        hallazgo.dimension,
        hallazgo.source,
        hallazgo.risk,
        hallazgo.message,
        hallazgo.evidence_text,
        hallazgo.evidence_location,
        hallazgo.section_id,
        hallazgo.recommendation,
        hallazgo.reference_kind,
        hallazgo.reference_id,
        hallazgo.reference_label,
        now,
      );
    }
  });

  return NextResponse.json({ etapas, resumen, hallazgos: hallazgos.length }, { status: 201 });
}

/* ── Etapa 5: validación legal y normativa ─────────────────────────────── */

function validarNormativa(
  db: ReturnType<typeof getDb>,
  texto: string,
  secciones: Seccion[],
): { hallazgos: HallazgoNuevo[]; resumen: Record<string, number> } {
  const citas = extraerCitas(texto);

  // Índice del catálogo: cada norma puede citarse de varias formas.
  const normas = queryAll<NormRecord>(
    db,
    'SELECT id, code, title, issuer, subject, status, article, effective_to, aliases FROM norms',
  );

  const porClave = new Map<string, NormRecord>();
  for (const norma of normas) {
    for (const clave of clavesDeNorma(norma.code, norma.aliases)) porClave.set(clave, norma);
  }

  // Una norma citada veinte veces es un solo hallazgo, no veinte.
  const primeraAparicion = new Map<string, Cita>();
  const veces = new Map<string, number>();

  for (const cita of citas) {
    if (!primeraAparicion.has(cita.clave)) primeraAparicion.set(cita.clave, cita);
    veces.set(cita.clave, (veces.get(cita.clave) ?? 0) + 1);
  }

  const hallazgos: HallazgoNuevo[] = [];
  let verificadas = 0;
  let sinVerificar = 0;
  let noVigentes = 0;

  for (const [clave, cita] of primeraAparicion) {
    const norma = porClave.get(clave);
    const seccion = seccionDe(secciones, cita.indice);
    const ubicacion = ubicacionDe(seccion, texto, cita.indice);
    const repeticiones = veces.get(clave) ?? 1;

    if (!norma) {
      sinVerificar += 1;
      hallazgos.push({
        dimension: 'Base legal',
        source: 'normativa',
        // Que una norma no figure en el catálogo no significa que la cita sea
        // errónea: lo más probable es que falte incorporarla. Riesgo bajo.
        risk: 'bajo',
        message: `La cita «${cita.textoCitado}» no pudo verificarse: la norma no figura en el catálogo normativo${repeticiones > 1 ? ` (citada ${repeticiones} veces)` : ''}.`,
        evidence_text: cita.contexto,
        evidence_location: ubicacion,
        section_id: seccion?.id ?? null,
        recommendation:
          'Incorpore la norma al catálogo normativo o corrija la cita si el número o el tipo son erróneos.',
        reference_kind: null,
        reference_id: null,
        reference_label: null,
      });
      continue;
    }

    const vigente =
      norma.status === 'Vigente' && (norma.effective_to === null || norma.effective_to > Date.now());

    if (!vigente) {
      noVigentes += 1;
      hallazgos.push({
        dimension: 'Base legal',
        source: 'normativa',
        risk: 'alto',
        message: `La cita «${cita.textoCitado}» corresponde a una norma que no figura como vigente en el catálogo.`,
        evidence_text: cita.contexto,
        evidence_location: ubicacion,
        section_id: seccion?.id ?? null,
        recommendation:
          'Verifique la vigencia de la norma y, de corresponder, sustituya la cita por la norma que la reemplazó.',
        reference_kind: 'norma',
        reference_id: String(norma.id),
        reference_label: `${norma.code} — ${norma.title}`,
        });
      continue;
    }

    verificadas += 1;
  }

  return {
    hallazgos,
    resumen: {
      citas_detectadas: citas.length,
      normas_distintas: primeraAparicion.size,
      verificadas,
      no_vigentes: noVigentes,
      sin_verificar: sinVerificar,
    },
  };
}

/* ── Etapa 6: comparación con el repositorio ───────────────────────────── */

function compararRepositorio(
  db: ReturnType<typeof getDb>,
  documento: { id: string; title: string },
  texto: string,
): { hallazgos: HallazgoNuevo[]; resumen: Record<string, unknown> } {
  const otros = queryAll<{ id: string; title: string; content: string }>(
    db,
    `SELECT d.id, d.title, c.content
     FROM documents d
     JOIN document_contents c ON c.document_id = d.id
     WHERE d.id <> ?`,
    documento.id,
  );

  const huella = huellaDe(texto);
  const hallazgos: HallazgoNuevo[] = [];
  const now = Date.now();
  let coincidencias = 0;

  // Se informan todas las comparaciones, no solo las que superan el umbral:
  // saber que un documento se comparó y quedó en 3% es tan útil como el aviso.
  const comparaciones: { titulo: string; jaccard: number; contencion: number }[] = [];

  const guardar = db.prepare(
    `INSERT INTO document_similarities
       (document_id, compared_id, similarity, containment, kind, fragments, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (document_id, compared_id) DO UPDATE SET
       similarity = excluded.similarity,
       containment = excluded.containment,
       kind = excluded.kind,
       fragments = excluded.fragments,
       computed_at = excluded.computed_at`,
  );

  for (const otro of otros) {
    const huellaOtro = huellaDe(otro.content);
    const { jaccard: similarity, contencion } = comparar(huella, huellaOtro);

    comparaciones.push({
      titulo: otro.title,
      jaccard: Number(similarity.toFixed(4)),
      contencion: Number(contencion.toFixed(4)),
    });

    // Basta con que una de las dos medidas supere su umbral: el Jaccard detecta
    // documentos gemelos y la contención, la reutilización parcial.
    if (similarity < UMBRAL_JACCARD && contencion < UMBRAL_CONTENCION) continue;

    coincidencias += 1;
    const kind = clasificar(similarity, contencion, documento.title, otro.title);
    const fragmentos = fragmentosComunes(huella, huellaOtro);

    guardar.run(
      documento.id,
      otro.id,
      similarity,
      contencion,
      kind,
      JSON.stringify(fragmentos),
      now,
    );

    hallazgos.push({
      dimension: 'Coincidencias con repositorio',
      source: 'similitud',
      risk: riesgoDe(similarity, contencion),
      message: mensajeDeCoincidencia(kind, similarity, contencion, otro.title),
      evidence_text: fragmentos[0]
        ? `«${fragmentos[0].texto}» (${fragmentos[0].palabras} palabras consecutivas en común)`
        : null,
      evidence_location: `Repositorio · ${fragmentos.length} fragmento(s) coincidente(s)`,
      section_id: null,
      recommendation: recomendacionDeCoincidencia(kind),
      reference_kind: 'documento',
      reference_id: otro.id,
      reference_label: otro.title,
    });
  }

  return {
    hallazgos,
    resumen: {
      documentos_comparados: otros.length,
      coincidencias,
      umbral_jaccard: UMBRAL_JACCARD,
      umbral_contencion: UMBRAL_CONTENCION,
      comparaciones: comparaciones.sort((a, b) => b.jaccard - a.jaccard),
    },
  };
}

function mensajeDeCoincidencia(
  kind: string,
  jaccard: number,
  contencion: number,
  titulo: string,
): string {
  const similitud = Math.round(jaccard * 100);
  const reproducido = Math.round(contencion * 100);

  if (kind === 'version_previa') {
    return `Similitud del ${similitud}% con «${titulo}», que parece ser otra versión del mismo documento.`;
  }

  // Cuando la contención manda, lo informativo no es el parecido global sino
  // cuánto del documento menor se reprodujo en el otro.
  if (contencion > jaccard + 0.2) {
    return `El ${reproducido}% del contenido del documento más breve coincide con «${titulo}»; la similitud global es del ${similitud}%.`;
  }
  if (kind === 'similitud_inusual') {
    return `Similitud inusual del ${similitud}% con «${titulo}».`;
  }
  return `Similitud del ${similitud}% con «${titulo}»; se recomienda validar la reutilización.`;
}

function recomendacionDeCoincidencia(kind: string): string {
  if (kind === 'version_previa') {
    return 'Confirme cuál es la versión vigente y registre la relación entre ambas.';
  }
  if (kind === 'similitud_inusual') {
    return 'Revise si la coincidencia está justificada o si se reprodujo contenido sin adecuarlo al caso.';
  }
  return 'Verifique que el contenido reutilizado corresponda a la necesidad actual.';
}

/* ── Utilidades de ubicación ───────────────────────────────────────────── */

function seccionDe(secciones: Seccion[], indice: number): Seccion | undefined {
  return secciones.find((seccion) => indice >= seccion.char_start && indice < seccion.char_end);
}

/** Etiqueta legible: «4.2. BASE LEGAL · pág. 7». Si no hay sección, calcula la página. */
function ubicacionDe(seccion: Seccion | undefined, texto: string, indice: number): string {
  if (seccion) {
    const nombre = seccion.numbering ? `${seccion.numbering}. ${seccion.heading}` : seccion.heading;
    return seccion.page_from ? `${nombre} · pág. ${seccion.page_from}` : nombre;
  }

  const pagina = paginaDe(texto, indice);
  return pagina ? `pág. ${pagina}` : 'Ubicación no determinada';
}

/** Última marca de página que precede a la posición dada. */
function paginaDe(texto: string, indice: number): number | null {
  const anterior = texto.lastIndexOf('--- Página ', indice);
  if (anterior === -1) return null;

  const coincidencia = texto.slice(anterior, anterior + 30).match(/--- Página (\d+) ---/);
  return coincidencia ? Number(coincidencia[1]) : null;
}
