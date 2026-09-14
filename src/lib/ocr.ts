import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { MODELO } from './motor-ia';

/**
 * Transcripción de PDF escaneados.
 *
 * Un PDF escaneado no tiene capa de texto: `unpdf` no extrae nada y el
 * documento queda fuera de todo el análisis. Buena parte de los expedientes
 * llegan así, firmados y digitalizados.
 *
 * Se transcribe enviando el PDF a la API de Anthropic, que lee las páginas como
 * imágenes. Se eligió frente a Tesseract por dos razones: no añade dependencias
 * nativas —el equipo no tiene cadena de compilación— y acierta mucho más en
 * documentos institucionales peruanos, con sellos, membretes y firmas sobre el
 * texto. El precio es que **el OCR requiere credencial de la API** y que el
 * documento sale del perímetro, igual que en la etapa 4.
 *
 * El texto transcrito conserva las marcas «--- Página N ---», que es lo que
 * usan la segmentación, la ubicación de las citas y la verificación de
 * evidencia.
 */

/** Tope de páginas por transcripción, por debajo del límite de la API. */
const MAX_PAGINAS = 100;

/** Tamaño máximo del PDF que admite la API en una sola petición. */
const MAX_BYTES = 30 * 1024 * 1024;

export interface TextoTranscrito {
  content: string;
  warnings: string[];
}

export class ErrorDeOcr extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'ErrorDeOcr';
  }
}

const INSTRUCCIONES = `Transcribe el documento adjunto. Es un escaneo sin capa de texto.

Reglas:

1. Transcribe LITERALMENTE lo que está escrito, carácter por carácter. No
   corrijas la ortografía, no completes abreviaturas, no reordenes nada.
2. Antes del texto de cada página escribe exactamente esta marca, en su propia
   línea: --- Página N --- , con N el número de página empezando en 1.
   La marca es obligatoria incluso si la página está en blanco.
3. Conserva la estructura: títulos, numerales, artículos y viñetas en sus
   propias líneas, con su numeración tal como aparece.
4. Transcribe las tablas fila por fila, separando las celdas con « | ».
5. Si un fragmento es ilegible, escribe [ilegible] en su lugar. No adivines.
6. No añadas comentarios, resúmenes ni encabezados propios. Devuelve solo la
   transcripción.`;

/** Transcribe un PDF escaneado y devuelve su texto con las marcas de página. */
export async function transcribirPdf(buffer: Buffer, paginas: number): Promise<TextoTranscrito> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new ErrorDeOcr(
      `El archivo pesa ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB y la transcripción admite ` +
        `hasta ${MAX_BYTES / 1024 / 1024} MB. Divida el documento.`,
      413,
    );
  }
  if (paginas > MAX_PAGINAS) {
    throw new ErrorDeOcr(
      `El documento tiene ${paginas} páginas y la transcripción admite hasta ${MAX_PAGINAS} por ` +
        'vez. Divídalo antes de cargarlo.',
      413,
    );
  }

  const client = new Anthropic();

  try {
    // Streaming: la transcripción de decenas de páginas es una salida larga y
    // una petición sin flujo agotaría el tiempo de espera.
    const stream = client.messages.stream({
      model: MODELO,
      max_tokens: 64_000,
      system: INSTRUCCIONES,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: buffer.toString('base64'),
              },
            },
            { type: 'text', text: 'Transcribe este documento siguiendo las reglas indicadas.' },
          ],
        },
      ],
    });

    const respuesta = await stream.finalMessage();

    if (respuesta.stop_reason === 'refusal') {
      throw new ErrorDeOcr(
        'El modelo declinó transcribir el documento por motivos de seguridad. ' +
          `Categoría: ${respuesta.stop_details?.category ?? 'no indicada'}.`,
        422,
      );
    }

    const content = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('')
      .trim();

    if (content.length === 0) {
      throw new ErrorDeOcr('La transcripción no devolvió texto.');
    }

    const warnings: string[] = [
      'Texto obtenido por transcripción automática del escaneo: puede diferir del original. ' +
        'Verifique las citas contra el documento antes de sustentar una decisión.',
    ];

    if (respuesta.stop_reason === 'max_tokens') {
      warnings.push(
        'La transcripción se cortó por longitud: el documento quedó incompleto. Divídalo y vuelva a cargarlo.',
      );
    }

    const ilegibles = (content.match(/\[ilegible\]/g) ?? []).length;
    if (ilegibles > 0) {
      warnings.push(`${ilegibles} fragmento(s) resultaron ilegibles en el escaneo.`);
    }

    return { content, warnings };
  } catch (error) {
    if (error instanceof ErrorDeOcr) throw error;

    if (error instanceof Anthropic.AuthenticationError) {
      throw new ErrorDeOcr('Las credenciales de la API de Anthropic no son válidas.', 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ErrorDeOcr('La API está limitando las solicitudes. Reintente en unos minutos.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ErrorDeOcr(`Error ${error.status} de la API de Anthropic: ${error.message}`);
    }

    const mensaje = error instanceof Error ? error.message : '';
    if (mensaje.includes('Could not resolve authentication method')) {
      throw new ErrorDeOcr(
        'La transcripción de escaneos requiere credencial de la API de Anthropic. ' +
          'Defina ANTHROPIC_API_KEY en el servidor.',
        503,
      );
    }

    throw new ErrorDeOcr(mensaje || 'Error desconocido durante la transcripción.');
  }
}
