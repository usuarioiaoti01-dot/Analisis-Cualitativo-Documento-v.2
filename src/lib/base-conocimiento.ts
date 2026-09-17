import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { queryAll, queryOne } from './sqlite';
import { clavesDeNorma, extraerCitas } from './citas';
import { leerArchivo } from './almacen';
import { detectarFormato, extraerTexto } from './extraccion';
import { etiquetaDeTipo } from './tipos-normativos';

/**
 * Base de conocimiento de una evaluación.
 *
 * Hasta ahora el motor leía el documento y la matriz, y nada más: podía decir
 * que una cita no estaba en el catálogo, pero no si lo que el documento afirma
 * se corresponde con lo que la norma dice. El catálogo normativo existe
 * precisamente para eso, y aquí es donde deja de ser una lista y pasa a ser
 * material de consulta.
 *
 * Qué se le entrega al motor, y por qué en ese orden:
 *
 *  1. **El índice del catálogo completo** —código, tipo, título, emisor—, que
 *     es barato y le permite saber qué normativa existe, incluso la que el
 *     documento no cita. De ahí salen las observaciones por omisión: «no
 *     invoca la directiva que regula esta materia».
 *  2. **El texto de las normas que el documento cita** y que están en el
 *     catálogo. Son las que el evaluador humano abriría para contrastar.
 *  3. **El texto de las normas del tipo pertinente** cuando aún queda
 *     presupuesto, empezando por las de la materia del documento.
 *
 * El presupuesto es en caracteres y se reparte, no se reserva: más vale una
 * norma entera que diez truncadas a la mitad de una frase.
 */

/** Tope del material de consulta. Unos 40 000 tokens de catálogo por evaluación. */
const PRESUPUESTO = Number(process.env.SACD_PRESUPUESTO_CATALOGO ?? 160_000);

/** Ninguna norma se lleva más de esta porción del presupuesto. */
const MAXIMO_POR_NORMA = 40_000;

/**
 * Cuántas palabras del título de una norma deben aparecer en el documento
 * para considerarla pertinente. Con una sola, «forestal» arrastraría medio
 * catálogo; con dos, la coincidencia ya es temática.
 */
const MINIMO_DE_COINCIDENCIAS = 2;

/** Palabras que aparecen en casi todos los títulos y no distinguen nada. */
const VACIAS = new Set([
  'para', 'sobre', 'entre', 'segun', 'ante', 'nacional', 'general', 'publica',
  'publico', 'estado', 'sector', 'norma', 'normas', 'directiva', 'lineamientos',
  'resolucion', 'decreto', 'supremo', 'reglamento', 'aprueba', 'aprobar',
  'aprobacion', 'modifica', 'documento', 'documentos', 'gestion', 'serfor',
  'midagri', 'ministerio', 'anexo',
]);

export interface NormaConsultada {
  id: number;
  code: string;
  title: string;
  doc_type: string;
  /** Por qué se incluyó: la cita el documento, o trata de lo mismo. */
  motivo: 'citada' | 'de la materia';
  caracteres: number;
}

export interface BaseDeConocimiento {
  /** Texto listo para el bloque de sistema, o cadena vacía si no hay catálogo. */
  texto: string;
  /** Normas cuyo contenido se incluyó, para poder informarlo. */
  incluidas: NormaConsultada[];
  /** Normas citadas por el documento que no están en el catálogo. */
  citadasSinCatalogar: string[];
  /** Total de normas del catálogo, incluidas o no. */
  totalCatalogo: number;
}

interface FilaNorma {
  id: number;
  code: string;
  title: string;
  issuer: string;
  subject: string;
  status: string;
  doc_type: string;
  aliases: string | null;
  storage_path: string | null;
}

/**
 * Arma el material de consulta para evaluar un documento.
 *
 * `tiposPertinentes` acota qué familias del catálogo interesan; si viene vacío
 * se consideran todas. La materia del documento evaluado sirve para ordenar,
 * no para excluir: una norma de otra materia que el documento cita sigue
 * siendo la primera que hay que leer.
 */
export async function construirBaseDeConocimiento(
  db: DatabaseSync,
  textoDelDocumento: string,
  opciones: { tiposPertinentes?: string[]; criterios?: string[] } = {},
): Promise<BaseDeConocimiento> {
  const normas = queryAll<FilaNorma>(
    db,
    `SELECT id, code, title, issuer, subject, status, doc_type, aliases, storage_path
     FROM norms ORDER BY doc_type, code`,
  );

  if (normas.length === 0) {
    return { texto: '', incluidas: [], citadasSinCatalogar: [], totalCatalogo: 0 };
  }

  /* ── Qué cita el documento ──────────────────────────────────────────── */

  const citas = extraerCitas(textoDelDocumento);
  const porClave = new Map<string, FilaNorma>();
  for (const norma of normas) {
    for (const clave of clavesDeNorma(norma.code, norma.aliases)) porClave.set(clave, norma);
  }

  const citadas = new Map<number, FilaNorma>();
  const sinCatalogar = new Set<string>();

  for (const cita of citas) {
    const norma = porClave.get(cita.clave);
    if (norma) citadas.set(norma.id, norma);
    else sinCatalogar.add(cita.textoCitado);
  }

  /* ── En qué orden se intenta incluir el texto ───────────────────────── */

  // Lo que el documento cita va siempre: es lo que el revisor abriría. Después,
  // y solo si queda presupuesto, las normas que hablan de lo mismo. El resto
  // del catálogo figura en el índice, que es barato: saber que una norma existe
  // basta para observar que el documento la omite.
  // Los criterios de la matriz entran en el vocabulario: si un criterio
  // pregunta por penalidades, las normas que regulan penalidades son
  // pertinentes aunque el documento evaluado apenas las nombre.
  const tipos = opciones.tiposPertinentes ?? [];
  const vocabulario = palabrasDe(
    [textoDelDocumento, ...(opciones.criterios ?? [])].join('\n'),
  );

  const porPertinencia = normas
    .filter(
      (norma) => !citadas.has(norma.id) && (tipos.length === 0 || tipos.includes(norma.doc_type)),
    )
    .map((norma) => ({ norma, puntaje: pertinencia(norma, vocabulario) }))
    .filter((candidata) => candidata.puntaje >= MINIMO_DE_COINCIDENCIAS)
    .sort((a, b) => b.puntaje - a.puntaje);

  const candidatas: { norma: FilaNorma; motivo: NormaConsultada['motivo'] }[] = [
    ...[...citadas.values()].map((norma) => ({ norma, motivo: 'citada' as const })),
    ...porPertinencia.map(({ norma }) => ({ norma, motivo: 'de la materia' as const })),
  ];

  const incluidas: NormaConsultada[] = [];
  const bloques: string[] = [];
  let gastado = 0;

  for (const { norma, motivo } of candidatas) {
    if (gastado >= PRESUPUESTO) break;

    const contenido = await textoDeLaNorma(db, norma);
    if (!contenido) continue;

    const disponible = Math.min(MAXIMO_POR_NORMA, PRESUPUESTO - gastado);
    // Un fragmento de mil caracteres no sostiene ninguna comprobación: se deja
    // fuera y se dice en el índice que la norma existe.
    if (disponible < 2_000) break;

    const recorte = contenido.length > disponible ? contenido.slice(0, disponible) : contenido;
    const truncado = recorte.length < contenido.length;

    bloques.push(
      [
        `### ${norma.code} — ${norma.title}`,
        `Emisor: ${norma.issuer} · Materia: ${norma.subject} · Estado: ${norma.status}` +
          (truncado ? ' · TEXTO PARCIAL: solo el comienzo de la norma' : ''),
        '',
        recorte.trim(),
      ].join('\n'),
    );

    incluidas.push({
      id: norma.id,
      code: norma.code,
      title: norma.title,
      doc_type: norma.doc_type,
      motivo,
      caracteres: recorte.length,
    });

    gastado += recorte.length;
  }

  /* ── El texto que verá el motor ─────────────────────────────────────── */

  const indice = normas
    .map(
      (norma) =>
        `- [${etiquetaDeTipo(norma.doc_type)}] ${norma.code} — ${norma.title}` +
        ` (${norma.issuer}; ${norma.status})` +
        (incluidas.some((incluida) => incluida.id === norma.id) ? ' · texto adjunto' : ''),
    )
    .join('\n');

  const texto = [
    'CATÁLOGO NORMATIVO DE LA DIRECCIÓN DE POLÍTICAS — SERFOR',
    '',
    'Es la normativa que la entidad reconoce como aplicable. Úsalo así:',
    '- Contrasta lo que el documento afirma con lo que dicen las normas adjuntas;',
    '  si el documento invoca una norma para algo que esa norma no dice, es un hallazgo.',
    '- Si el documento omite una norma del catálogo que regula directamente su materia,',
    '  también es un hallazgo.',
    '- No des por incumplido nada apoyándote en normas que no estén aquí, ni en tu',
    '  conocimiento general de la legislación peruana: este catálogo es la referencia.',
    '- De las normas marcadas «texto adjunto» tienes el contenido más abajo; del resto,',
    '  solo su existencia.',
    '',
    `ÍNDICE (${normas.length} normas)`,
    indice,
    '',
    sinCatalogar.size > 0
      ? `NORMAS QUE EL DOCUMENTO CITA Y NO ESTÁN EN EL CATÁLOGO (${sinCatalogar.size})` +
        '\n' + [...sinCatalogar].map((cita) => `- ${cita}`).join('\n') +
        '\nDe estas no puedes verificar el contenido: no afirmes que la cita es correcta' +
        '\nni que es errónea; a lo sumo observa que no consta en el catálogo.\n'
      : '',
    bloques.length > 0 ? 'TEXTO DE LAS NORMAS PERTINENTES' : '',
    bloques.join('\n\n'),
  ]
    .join('\n')
    .trim();

  return {
    texto,
    incluidas,
    citadasSinCatalogar: [...sinCatalogar],
    totalCatalogo: normas.length,
  };
}

/** Palabras significativas de un texto, normalizadas y sin las vacías. */
function palabrasDe(texto: string): Set<string> {
  const palabras = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z]{5,}/g);

  return new Set((palabras ?? []).filter((palabra) => !VACIAS.has(palabra)));
}

/**
 * Cuántas palabras significativas del título y la materia de la norma
 * aparecen en el documento. Es una medida tosca, pero explicable: la norma
 * entra porque el documento habla de lo que ella regula, no porque un modelo
 * lo haya intuido.
 */
function pertinencia(norma: FilaNorma, vocabulario: Set<string>): number {
  const suyas = palabrasDe(`${norma.title} ${norma.subject}`);
  let coincidencias = 0;
  for (const palabra of suyas) if (vocabulario.has(palabra)) coincidencias += 1;
  return coincidencias;
}

/**
 * Texto de una norma. Se guarda al incorporarla; las que entraron antes de
 * que existiera esa tabla se extraen de su archivo la primera vez y quedan
 * guardadas, para no repetir la extracción en cada evaluación.
 */
async function textoDeLaNorma(db: DatabaseSync, norma: FilaNorma): Promise<string | null> {
  const guardado = queryOne<{ content: string }>(
    db,
    'SELECT content FROM norm_contents WHERE norm_id = ?',
    norma.id,
  );
  if (guardado) return guardado.content;

  if (!norma.storage_path) return null;

  const buffer = await leerArchivo(norma.storage_path);
  if (!buffer) return null;

  const formato = detectarFormato(norma.storage_path, '');
  if (!formato) return null;

  try {
    const { content } = await extraerTexto(buffer, formato);
    if (content.trim().length === 0) return null;

    db.prepare(
      'INSERT OR REPLACE INTO norm_contents (norm_id, content, extracted_at) VALUES (?, ?, ?)',
    ).run(norma.id, content, Date.now());

    return content;
  } catch {
    // Una norma ilegible no debe impedir la evaluación: se omite su texto y
    // sigue figurando en el índice.
    return null;
  }
}
