import 'server-only';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Vista previa fiel del documento original.
 *
 * El navegador solo sabe representar PDF. Un memorando llega casi siempre en
 * DOCX, y lo que el revisor necesita ver no es el texto extraído —eso ya está
 * en la ficha— sino el documento tal cual: su membrete, sus tablas, sus
 * firmas. Por eso se convierte a PDF en el servidor en lugar de reconstruirlo:
 * un PDF fabricado a partir del texto se parecería al documento sin serlo, y
 * en un expediente esa diferencia importa.
 *
 * El convertidor es el que haya en la máquina, por orden de preferencia:
 *  1. LibreOffice (`soffice`), que además funciona en servidores Linux;
 *  2. Word o Excel por automatización, que es lo que hay en los equipos del
 *     SERFOR y lo que mejor respeta el formato.
 *
 * El resultado se guarda junto al original y se reutiliza mientras el archivo
 * no cambie: convertir tarda unos segundos y no tiene sentido repetirlo cada
 * vez que se abre la ficha.
 */

/** Rutas donde suele estar LibreOffice cuando está instalado. */
const RUTAS_SOFFICE = [
  process.env.SACD_SOFFICE,
  'C:/Program Files/LibreOffice/program/soffice.exe',
  'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
].filter((ruta): ruta is string => Boolean(ruta));

/** Convertir un documento extenso lleva segundos; más de esto es que se colgó. */
const TIEMPO_MAXIMO_MS = 120_000;

export class ErrorDeConversion extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = 'ErrorDeConversion';
  }
}

/**
 * Las automatizaciones de Office no admiten dos conversiones a la vez: la
 * segunda encuentra la aplicación ocupada y falla. Se encolan.
 */
let turno: Promise<unknown> = Promise.resolve();

function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = turno.then(tarea, tarea);
  // La cola no debe romperse porque una conversión falle.
  turno = resultado.catch(() => undefined);
  return resultado;
}

function absoluta(ruta: string): string {
  return path.isAbsolute(ruta) ? ruta : path.join(process.cwd(), ruta);
}

async function fechaDe(ruta: string): Promise<number | null> {
  try {
    return (await fs.stat(ruta)).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Devuelve la ruta de un PDF que representa el documento. Si el original ya lo
 * es, se devuelve tal cual; si no, se convierte una vez y se guarda en caché.
 */
export async function pdfDelDocumento(storagePath: string): Promise<string> {
  const origen = absoluta(storagePath);

  if (path.extname(origen).toLowerCase() === '.pdf') return origen;

  const destino = `${origen.slice(0, -path.extname(origen).length)}.vista.pdf`;

  const fechaOrigen = await fechaDe(origen);
  if (fechaOrigen === null) {
    throw new ErrorDeConversion('El archivo original ya no está en el almacén.', 410);
  }

  // Una conversión anterior sirve mientras el original no se haya rehecho.
  const fechaDestino = await fechaDe(destino);
  if (fechaDestino !== null && fechaDestino >= fechaOrigen) return destino;

  return enCola(async () => {
    // Otra petición pudo convertirlo mientras esta esperaba su turno.
    const yaHecho = await fechaDe(destino);
    if (yaHecho !== null && yaHecho >= fechaOrigen) return destino;

    await convertir(origen, destino);
    return destino;
  });
}

async function convertir(origen: string, destino: string): Promise<void> {
  const soffice = await primeroQueExista(RUTAS_SOFFICE);

  if (soffice) {
    await conLibreOffice(soffice, origen, destino);
    return;
  }

  if (process.platform === 'win32') {
    await conOffice(origen, destino);
    return;
  }

  throw new ErrorDeConversion(
    'No hay ningún convertidor a PDF instalado en el servidor. Instale LibreOffice ' +
      'o defina SACD_SOFFICE con la ruta de «soffice».',
    501,
  );
}

async function primeroQueExista(rutas: string[]): Promise<string | null> {
  for (const ruta of rutas) {
    try {
      await fs.access(ruta);
      return ruta;
    } catch {
      // Sigue con la siguiente.
    }
  }
  return null;
}

/** LibreOffice escribe el PDF en un directorio, con el nombre del original. */
async function conLibreOffice(soffice: string, origen: string, destino: string): Promise<void> {
  const salida = path.dirname(destino);

  await ejecutar(soffice, [
    '--headless',
    '--norestore',
    '--convert-to',
    'pdf',
    '--outdir',
    salida,
    origen,
  ]);

  const generado = path.join(
    salida,
    `${path.basename(origen, path.extname(origen))}.pdf`,
  );

  if (generado !== destino) await fs.rename(generado, destino);
}

/** Word o Excel, por automatización. Solo en Windows y con Office instalado. */
async function conOffice(origen: string, destino: string): Promise<void> {
  const script = path.join(process.cwd(), 'scripts', 'convertir-a-pdf.ps1');

  await ejecutar('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-Origen',
    origen,
    '-Destino',
    destino,
  ]);
}

function ejecutar(comando: string, argumentos: string[]): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(comando, argumentos, { windowsHide: true });

    let error = '';
    proceso.stderr.on('data', (trozo) => {
      error += String(trozo);
    });

    const reloj = setTimeout(() => {
      proceso.kill();
      rechazar(
        new ErrorDeConversion(
          'La conversión a PDF tardó demasiado y se interrumpió. Descargue el archivo original.',
          504,
        ),
      );
    }, TIEMPO_MAXIMO_MS);

    proceso.on('error', (fallo) => {
      clearTimeout(reloj);
      rechazar(new ErrorDeConversion(`No se pudo invocar el convertidor: ${fallo.message}`));
    });

    proceso.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) {
        resolver();
        return;
      }
      rechazar(
        new ErrorDeConversion(
          `El convertidor terminó con error${error.trim() ? `: ${error.trim().split('\n')[0]}` : '.'}`,
        ),
      );
    });
  });
}
