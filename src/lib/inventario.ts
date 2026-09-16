import 'server-only';

/**
 * Enlace con el **Inventario Normativo del SERFOR**
 * (github.com/usuarioiaoti01-dot/Inventario-Normativo-SERFOR).
 *
 * Esa aplicación ya es el repositorio institucional de la normativa: sus
 * fichas viven en tablas de Postgres (Supabase) y sus PDF en un bucket
 * privado. Mantener aquí una segunda copia cargada a mano significaría que las
 * dos se separan en cuanto alguien añada una norma en una sola de ellas. Este
 * módulo trae de allí lo que haga falta, de modo que cada documento que se
 * suma al inventario quede disponible para sustentar evaluaciones.
 *
 * **Cómo se autentica.** Las políticas de acceso del inventario exigen sesión
 * iniciada (`to authenticated`), así que la clave pública no basta. Se inicia
 * sesión con una cuenta del propio inventario —conviene que sea de solo
 * lectura— cuyas credenciales se leen del entorno. No se usa la clave
 * `service_role`: esa salta todas las reglas de acceso, y para leer un
 * catálogo no hace falta ese poder.
 *
 * Sin credenciales configuradas el módulo no falla por su cuenta: informa que
 * el enlace no está configurado, y la aplicación sigue funcionando con la
 * carga manual de siempre.
 */

/** Valores públicos, tomados del `config.js` del propio inventario. */
const URL_POR_OMISION = 'https://armvuvoluoxspfjpefex.supabase.co';
const CLAVE_PUBLICA_POR_OMISION = 'sb_publishable_2D6Q9AO9zVk02_ERcrO6MA_oIY7eRyD';

/** Tablas del inventario que se consultan, en orden de aparición. */
const TABLAS = (process.env.SACD_INVENTARIO_TABLAS ?? 'documentos,normativos_opr')
  .split(',')
  .map((tabla) => tabla.trim())
  .filter(Boolean);

/** Bucket donde el inventario guarda los archivos. */
const BUCKET = process.env.SACD_INVENTARIO_BUCKET ?? 'documentos';

export class ErrorDeInventario extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'ErrorDeInventario';
  }
}

/** Ficha de un documento del inventario, ya normalizada. */
export interface DocumentoDelInventario {
  /** Identificador estable dentro de esta aplicación: «tabla:id». */
  referencia: string;
  tabla: string;
  tipo: string;
  titulo: string;
  entidad: string | null;
  anio: number | null;
  estado: string | null;
  coleccion: string | null;
  /** Ruta del archivo dentro del bucket. */
  archivo: string;
  /** Nombre original del archivo, cuando el inventario lo conserva. */
  original: string | null;
}

interface FilaDelInventario {
  id: number;
  tipo: string;
  titulo: string;
  entidad: string | null;
  anio: number | null;
  estado: string | null;
  coleccion: string | null;
  archivo: string;
  original: string | null;
}

function configuracion() {
  return {
    url: (process.env.SACD_INVENTARIO_URL ?? URL_POR_OMISION).replace(/\/$/, ''),
    clavePublica: process.env.SACD_INVENTARIO_ANON_KEY ?? CLAVE_PUBLICA_POR_OMISION,
    usuario: process.env.SACD_INVENTARIO_USUARIO,
    clave: process.env.SACD_INVENTARIO_CLAVE,
  };
}

/** ¿Hay con qué consultar el inventario? */
export function inventarioConfigurado(): boolean {
  const { usuario, clave } = configuracion();
  return Boolean(usuario && clave);
}

/**
 * Sesión en el inventario. Se guarda mientras dure: iniciar sesión en cada
 * consulta gastaría una petición de autenticación por cada listado.
 */
let sesion: { token: string; expira: number } | null = null;

async function token(): Promise<{ token: string; clavePublica: string; url: string }> {
  const { url, clavePublica, usuario, clave } = configuracion();

  if (!usuario || !clave) {
    throw new ErrorDeInventario(
      'El enlace con el Inventario Normativo no está configurado. Defina ' +
        'SACD_INVENTARIO_USUARIO y SACD_INVENTARIO_CLAVE en el entorno del servidor.',
      501,
    );
  }

  // Un minuto de margen: un token que caduca en el camino da un 401 confuso.
  if (sesion && sesion.expira > Date.now() + 60_000) {
    return { token: sesion.token, clavePublica, url };
  }

  const respuesta = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: clavePublica, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usuario, password: clave }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.json().catch(() => ({}));
    throw new ErrorDeInventario(
      `El inventario rechazó las credenciales (${respuesta.status}): ` +
        `${detalle.error_description ?? detalle.msg ?? 'sin detalle'}.`,
      respuesta.status === 400 || respuesta.status === 401 ? 401 : 502,
    );
  }

  const datos = (await respuesta.json()) as { access_token: string; expires_in: number };
  sesion = { token: datos.access_token, expira: Date.now() + datos.expires_in * 1000 };

  return { token: sesion.token, clavePublica, url };
}

/** Lista las fichas del inventario, de todas las tablas configuradas. */
export async function listarInventario(): Promise<DocumentoDelInventario[]> {
  const { token: acceso, clavePublica, url } = await token();
  const documentos: DocumentoDelInventario[] = [];

  for (const tabla of TABLAS) {
    const consulta =
      `${url}/rest/v1/${tabla}` +
      '?select=id,tipo,titulo,entidad,anio,estado,coleccion,archivo,original' +
      '&order=titulo.asc';

    const respuesta = await fetch(consulta, {
      headers: { apikey: clavePublica, Authorization: `Bearer ${acceso}` },
    });

    // Una tabla que no existe en ese proyecto no debe tumbar el listado
    // entero: se informa por consola y se sigue con las demás.
    if (respuesta.status === 404) {
      console.warn(`[inventario] La tabla «${tabla}» no existe en el proyecto.`);
      continue;
    }
    if (!respuesta.ok) {
      throw new ErrorDeInventario(
        `El inventario respondió ${respuesta.status} al listar «${tabla}».`,
      );
    }

    const filas = (await respuesta.json()) as FilaDelInventario[];
    for (const fila of filas) {
      documentos.push({
        referencia: `${tabla}:${fila.id}`,
        tabla,
        tipo: fila.tipo,
        titulo: fila.titulo,
        entidad: fila.entidad,
        anio: fila.anio,
        estado: fila.estado,
        coleccion: fila.coleccion,
        archivo: fila.archivo,
        original: fila.original,
      });
    }
  }

  return documentos;
}

/** Descarga un archivo del inventario por su ruta dentro del bucket. */
export async function descargarDelInventario(archivo: string): Promise<Buffer> {
  const { token: acceso, clavePublica, url } = await token();

  const respuesta = await fetch(
    `${url}/storage/v1/object/${BUCKET}/${archivo.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { apikey: clavePublica, Authorization: `Bearer ${acceso}` } },
  );

  if (!respuesta.ok) {
    throw new ErrorDeInventario(
      `No se pudo descargar «${archivo}» del inventario (${respuesta.status}).`,
    );
  }

  return Buffer.from(await respuesta.arrayBuffer());
}

/** Nombre con el que se guardará el archivo traído. */
export function nombreDeArchivo(documento: DocumentoDelInventario): string {
  if (documento.original) return documento.original;

  const base = documento.archivo.split('/').pop() ?? `${documento.referencia}.pdf`;
  return base;
}
