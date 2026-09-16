import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll } from '@/lib/sqlite';
import { clavesDeNorma, extraerCitas } from '@/lib/citas';
import { clasificarTipo } from '@/lib/tipos-normativos';
import { incorporarAlCatalogo } from '@/lib/incorporacion';
import {
  ErrorDeInventario,
  descargarDelInventario,
  inventarioConfigurado,
  listarInventario,
  nombreDeArchivo,
  type DocumentoDelInventario,
} from '@/lib/inventario';
import type { ResultadoIncorporacion } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Traer varias normas descarga y analiza cada archivo.
export const maxDuration = 600;

/**
 * GET /api/catalog/inventario — qué hay en el Inventario Normativo y qué de
 * eso falta en este catálogo.
 *
 * La marca «ya está» es exacta para lo que se trajo por aquí: cada ficha
 * traída guarda su procedencia. Para lo que se cargó a mano se cae al
 * reconocimiento del código en la carpeta, el título o el nombre del archivo,
 * que es una aproximación: el inventario no tiene un campo de código.
 */
export async function GET() {
  if (!inventarioConfigurado()) {
    return NextResponse.json(
      {
        configurado: false,
        error:
          'El enlace con el Inventario Normativo no está configurado. Defina ' +
          'SACD_INVENTARIO_USUARIO y SACD_INVENTARIO_CLAVE en el servidor con una cuenta ' +
          'de solo lectura del inventario.',
        documentos: [],
      },
      { status: 200 },
    );
  }

  try {
    const documentos = await listarInventario();
    sincronizarTipos(documentos);

    const presentes = clavesDelCatalogo();
    const traidas = procedenciasDelCatalogo();

    return NextResponse.json({
      configurado: true,
      documentos: documentos.map((documento) => ({
        ...documento,
        ya_en_catalogo:
          traidas.has(`inventario://${documento.referencia}`) ||
          [documento.carpeta, documento.titulo, documento.original]
            .filter((fuente): fuente is string => Boolean(fuente))
            .some((fuente) => clavesDeNorma(fuente, null).some((clave) => presentes.has(clave))),
      })),
    });
  } catch (error) {
    return responderError(error);
  }
}

/**
 * POST /api/catalog/inventario — trae al catálogo las fichas indicadas.
 *
 * Cuerpo: `{ referencias: ['documentos:12', 'normativos_opr:4'] }`.
 *
 * Cada archivo pasa por la misma incorporación que una carga manual: se
 * identifica la norma con el modelo, se detectan duplicados y los complementos
 * entran como tales. Traer algo dos veces no duplica la ficha.
 */
export async function POST(request: Request) {
  let referencias: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.referencias)) referencias = body.referencias.filter(esTexto);
  } catch {
    // Cuerpo inválido: se trata igual que uno vacío.
  }

  if (referencias.length === 0) {
    return NextResponse.json({ error: 'No se indicó ninguna norma a traer.' }, { status: 400 });
  }

  const db = getDb();

  try {
    const disponibles = new Map(
      (await listarInventario()).map((documento) => [documento.referencia, documento]),
    );

    const resultados: ResultadoIncorporacion[] = [];

    for (const referencia of ordenarPorParte(referencias, disponibles)) {
      const documento = disponibles.get(referencia);

      if (!documento) {
        resultados.push({
          archivo: referencia,
          estado: 'error',
          detalle: 'La ficha ya no está en el inventario.',
        });
        continue;
      }

      resultados.push(await traer(db, documento));
    }

    const incorporadas = resultados.filter((r) => r.estado === 'incorporada').length;
    return NextResponse.json({ resultados, incorporadas }, { status: incorporadas > 0 ? 201 : 200 });
  } catch (error) {
    return responderError(error);
  }
}

async function traer(
  db: ReturnType<typeof getDb>,
  documento: DocumentoDelInventario,
): Promise<ResultadoIncorporacion> {
  try {
    const buffer = await descargarDelInventario(documento.archivo);

    return await incorporarAlCatalogo(db, {
      nombre: nombreDeArchivo(documento),
      buffer,
      origen: 'el Inventario Normativo',
      ficha: fichaDe(documento),
      // El inventario declara el tipo de cada documento: se respeta.
      docType: clasificarTipo(documento.tipo),
    });
  } catch (error) {
    return {
      archivo: documento.titulo,
      estado: 'error',
      detalle: error instanceof Error ? error.message : 'No se pudo traer el archivo.',
    };
  }
}

/**
 * Orden en que se incorporan los archivos de una misma norma.
 *
 * El código de la carpeta es el de la resolución que aprueba la norma, así que
 * esa pieza debe llevarse el código limpio y las demás quedar como sus
 * complementos. Sin este orden, el código principal se lo quedaba el primero
 * que llegara —a menudo un anexo—, que es justo el que menos lo merece.
 */
const PRIORIDAD_DE_PARTE = ['resolucion', 'documento', 'norma'];

function ordenarPorParte(
  referencias: string[],
  disponibles: Map<string, DocumentoDelInventario>,
): string[] {
  const peso = (referencia: string) => {
    const parte = disponibles.get(referencia)?.parte?.toLowerCase() ?? '';
    const posicion = PRIORIDAD_DE_PARTE.findIndex((clave) => parte.includes(clave));
    return posicion === -1 ? PRIORIDAD_DE_PARTE.length : posicion;
  };

  return [...referencias].sort((a, b) => peso(a) - peso(b));
}

/**
 * Ficha que aporta el inventario, cuando trae el código de la norma.
 *
 * El código vive en `carpeta` —«RGG N° D000026-2021-MIDAGRI-SERFOR-GG»— y se
 * normaliza con el extractor de citas para que la etapa 5 reconozca después
 * esa misma norma citada en un documento. Sin carpeta no hay código fiable y
 * se deja que la incorporación lo deduzca como en una carga manual.
 *
 * Una norma puede constar de varios archivos —la resolución que la aprueba, el
 * documento en sí, sus anexos— y todos comparten carpeta, es decir, código. El
 * primero que entra se queda con el código; a los siguientes se les antepone su
 * «parte» al detectarse la colisión, de modo que ninguno se pierda como
 * duplicado y quede claro qué es cada uno.
 */
function fichaDe(documento: DocumentoDelInventario) {
  if (!documento.carpeta) return undefined;

  const cita = extraerCitas(documento.carpeta)[0];
  if (!cita) return undefined;

  return {
    code: `${cita.tipo} N.º ${cita.numero}`,
    title: documento.titulo,
    issuer: documento.entidad ?? 'SERFOR',
    subject: documento.tipo,
    complemento: documento.parte?.trim() || null,
    sourceUrl: `inventario://${documento.referencia}`,
  };
}

/** Claves de las normas que ya están en el catálogo. */
function clavesDelCatalogo(): Set<string> {
  const filas = queryAll<{ code: string; aliases: string | null }>(
    getDb(),
    'SELECT code, aliases FROM norms',
  );

  const claves = new Set<string>();
  for (const fila of filas) {
    for (const clave of clavesDeNorma(fila.code, fila.aliases)) claves.add(clave);
  }
  return claves;
}

/**
 * Pone al día el tipo de las normas que vinieron del inventario.
 *
 * El tipo lo declara la fuente —«Directiva», «Lineamientos»—, y es más fiable
 * que deducirlo del código: la resolución que aprueba una directiva lleva
 * código de resolución, pero lo que el catálogo debe guardar es una directiva.
 * Las normas traídas antes de que el catálogo tuviera tipos quedaron
 * clasificadas por su código, y aquí se corrigen solas.
 */
function sincronizarTipos(documentos: DocumentoDelInventario[]): void {
  const db = getDb();
  const actuales = queryAll<{ id: number; source_url: string; doc_type: string }>(
    db,
    "SELECT id, source_url, doc_type FROM norms WHERE source_url LIKE 'inventario://%'",
  );

  if (actuales.length === 0) return;

  const tipoPorReferencia = new Map(
    documentos.map((documento) => [`inventario://${documento.referencia}`, clasificarTipo(documento.tipo)]),
  );

  const actualizar = db.prepare('UPDATE norms SET doc_type = ? WHERE id = ?');

  for (const norma of actuales) {
    const declarado = tipoPorReferencia.get(norma.source_url);
    if (declarado && declarado !== norma.doc_type) actualizar.run(declarado, norma.id);
  }
}

/** Procedencias ya traídas del inventario. */
function procedenciasDelCatalogo(): Set<string> {
  const filas = queryAll<{ source_url: string }>(
    getDb(),
    "SELECT source_url FROM norms WHERE source_url LIKE 'inventario://%'",
  );
  return new Set(filas.map((fila) => fila.source_url));
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

function responderError(error: unknown) {
  if (error instanceof ErrorDeInventario) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
