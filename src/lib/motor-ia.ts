import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Etapa 4 — evaluación cualitativa del contenido contra la matriz de criterios.
 *
 * A diferencia de las etapas 5 y 6, esta sí envía el texto del documento a la
 * API de Anthropic. La entidad autorizó ese envío sin restricción el 13 de
 * septiembre de 2026; si esa decisión cambia, este módulo es el único punto que
 * hay que intervenir.
 *
 * Toda cita que devuelva el modelo se verifica literalmente contra el documento
 * antes de guardarse (véase `evidencia.ts`). La que no aparece se descarta.
 */

/** Modelo por omisión. Configurable por si la entidad fija otro. */
const MODELO = process.env.SACD_MODELO ?? 'claude-opus-5';

/**
 * Tope de tokens de entrada. Por encima no se trunca el documento en silencio:
 * se devuelve un error explicando el límite, para que la decisión sea del
 * usuario y no una pérdida callada de contenido.
 */
const MAX_TOKENS_ENTRADA = Number(process.env.SACD_MAX_TOKENS_ENTRADA ?? 400_000);

export interface CriterioParaEvaluar {
  id: number;
  dimension: string;
  description: string;
  indicator: string | null;
  weight: number;
  scale_max: number;
  rule: string | null;
}

export interface HallazgoDelModelo {
  mensaje: string;
  cita_textual: string;
  riesgo: 'bajo' | 'medio' | 'alto' | 'critico';
  recomendacion: string;
}

export interface ResultadoDelModelo {
  criterio_id: number;
  resultado: 'cumple' | 'parcial' | 'no_cumple' | 'no_aplica';
  puntaje: number | null;
  comentario: string;
  hallazgos: HallazgoDelModelo[];
}

export interface RespuestaDelMotor {
  resultados: ResultadoDelModelo[];
  usage: {
    entrada: number;
    /** Tokens escritos en caché: la primera vez, el documento entero pasa por aquí. */
    cacheEscrito: number;
    cacheLeido: number;
    salida: number;
  };
}

/** Error con un mensaje pensado para mostrarse al usuario tal cual. */
export class ErrorDeMotor extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'ErrorDeMotor';
  }
}

/** Esquema de la respuesta. Obliga al modelo a devolver un resultado por criterio. */
function esquemaDeSalida(criterios: CriterioParaEvaluar[]) {
  const escalaMaxima = Math.max(...criterios.map((c) => c.scale_max), 5);

  return {
    type: 'json_schema' as const,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['resultados'],
      properties: {
        resultados: {
          type: 'array',
          // La API no admite `minItems` distinto de 0 o 1, así que la
          // completitud no puede exigirse por esquema: se pide en las
          // instrucciones y se comprueba al recibir la respuesta.
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['criterio_id', 'resultado', 'puntaje', 'comentario', 'hallazgos'],
            properties: {
              criterio_id: {
                type: 'integer',
                description: 'Identificador del criterio evaluado, tal como se entregó.',
              },
              resultado: {
                type: 'string',
                enum: ['cumple', 'parcial', 'no_cumple', 'no_aplica'],
              },
              puntaje: {
                // La salida estructurada no admite `minimum`/`maximum`: el
                // rango se pide en la descripción y `normalizarPuntaje` lo
                // recorta al recibir la respuesta.
                type: ['integer', 'null'],
                description:
                  `Puntaje entero de 1 a ${escalaMaxima} en la escala del criterio. ` +
                  'Nulo solo si el resultado es no_aplica.',
              },
              comentario: {
                type: 'string',
                description: 'Justificación breve del resultado, en español, referida al documento.',
              },
              hallazgos: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['mensaje', 'cita_textual', 'riesgo', 'recomendacion'],
                  properties: {
                    mensaje: {
                      type: 'string',
                      description: 'Qué problema concreto se detectó.',
                    },
                    cita_textual: {
                      type: 'string',
                      description:
                        'Fragmento copiado LITERALMENTE del documento que sustenta el hallazgo. Entre 15 y 300 caracteres.',
                    },
                    riesgo: { type: 'string', enum: ['bajo', 'medio', 'alto', 'critico'] },
                    recomendacion: {
                      type: 'string',
                      description: 'Ajuste concreto que corregiría el hallazgo.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

const INSTRUCCIONES = `Eres un evaluador documental de la Dirección de Políticas del SERFOR (Perú).
Tu trabajo es evaluar un documento institucional contra una matriz de criterios aprobada.

Reglas que no puedes quebrantar:

1. TODA cita textual que incluyas debe estar copiada LITERALMENTE del documento,
   carácter por carácter. No parafrasees, no corrijas la ortografía, no completes
   palabras cortadas. Las citas se verifican automáticamente contra el documento
   y las que no aparezcan se descartan junto con su hallazgo.
2. Si un criterio no puede evaluarse porque el documento no trata la materia,
   responde "no_aplica" con puntaje nulo. No inventes un incumplimiento.
3. Emite un hallazgo solo cuando puedas señalar el pasaje concreto que lo motiva.
   Un criterio que se cumple no necesita hallazgos.
4. El riesgo es "critico" solo cuando el defecto puede invalidar el documento o
   exponer a la entidad: ausencia de habilitación legal, contradicción con una
   norma de rango superior, o compromiso sin sustento presupuestal.
5. Escribe en español institucional peruano, sin adjetivos innecesarios.
6. La decisión final es de un revisor humano. Tu resultado es un insumo, no un
   dictamen: señala lo que observas y por qué, no lo que debería aprobarse.
7. Junto al documento recibes el catálogo normativo de la entidad. Es la única
   referencia normativa admitida: no declares un incumplimiento apoyándote en
   normas que no figuren allí ni en tu conocimiento general de la legislación,
   porque el revisor no podría verificarlo contra nada.`;

/** Presenta la matriz de forma que el modelo pueda responder criterio por criterio. */
function describirCriterios(criterios: CriterioParaEvaluar[]): string {
  return criterios
    .map((criterio) => {
      const partes = [
        `- criterio_id ${criterio.id} · dimensión «${criterio.dimension}» · peso ${criterio.weight}%`,
        `  Criterio: ${criterio.description}`,
        `  Escala: 1 (ausente) a ${criterio.scale_max} (óptimo)`,
      ];
      if (criterio.indicator) partes.push(`  Pregunta de evaluación: ${criterio.indicator}`);
      if (criterio.rule) partes.push(`  Regla: ${criterio.rule}`);
      return partes.join('\n');
    })
    .join('\n\n');
}

/**
 * El SDK resuelve la credencial de varias fuentes (ANTHROPIC_API_KEY,
 * ANTHROPIC_AUTH_TOKEN, perfiles de `ant auth login`) y **no falla al
 * construirse**: la ausencia de credencial solo aparece en la primera llamada.
 * Por eso el manejo del caso vive en `traducirError`, no aquí.
 */
function crearCliente(): Anthropic {
  return new Anthropic();
}

/** Convierte cualquier fallo del SDK en un error con mensaje presentable. */
function traducirError(error: unknown): ErrorDeMotor {
  if (error instanceof ErrorDeMotor) return error;

  if (error instanceof Anthropic.AuthenticationError) {
    return new ErrorDeMotor('Las credenciales de la API de Anthropic no son válidas.', 401);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ErrorDeMotor(
      'La API de Anthropic está limitando las solicitudes. Reintente en unos minutos.',
      429,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new ErrorDeMotor(`Error ${error.status} de la API de Anthropic: ${error.message}`);
  }

  // Sin credencial el SDK lanza un Error corriente en la primera petición.
  const mensaje = error instanceof Error ? error.message : '';
  if (mensaje.includes('Could not resolve authentication method')) {
    return new ErrorDeMotor(
      'No hay credenciales de la API de Anthropic configuradas en el servidor. ' +
        'Defina ANTHROPIC_API_KEY en el entorno y reinicie la aplicación.',
      503,
    );
  }

  return new ErrorDeMotor(mensaje || 'Error desconocido al invocar el motor de análisis.');
}

/** Evalúa el documento contra la matriz y devuelve el resultado de cada criterio. */
export async function evaluarConIa(
  documento: string,
  criterios: CriterioParaEvaluar[],
  metadatos: { titulo: string; tipoDocumental: string },
  /** Catálogo normativo que sirve de referencia. Véase `base-conocimiento`. */
  baseDeConocimiento = '',
): Promise<RespuestaDelMotor> {
  const client = crearCliente();

  const contextoDocumento = [
    `Título: ${metadatos.titulo}`,
    `Tipo documental: ${metadatos.tipoDocumental}`,
    '',
    'Texto íntegro del documento:',
    documento,
  ].join('\n');

  const instruccion = [
    'Evalúa el documento anterior contra los siguientes criterios.',
    `Devuelve exactamente ${criterios.length} resultados: uno por cada criterio_id listado,`,
    'sin omitir ninguno y sin repetir ninguno.',
    '',
    describirCriterios(criterios),
  ].join('\n');

  try {
    // No se trunca el documento en silencio: si excede el tope, el usuario decide.
    const conteo = await client.messages.countTokens({
      model: MODELO,
      system: [
        { type: 'text', text: INSTRUCCIONES },
        ...(baseDeConocimiento ? [{ type: 'text' as const, text: baseDeConocimiento }] : []),
      ],
      messages: [{ role: 'user', content: contextoDocumento }],
    });

    if (conteo.input_tokens > MAX_TOKENS_ENTRADA) {
      throw new ErrorDeMotor(
        `El documento ocupa ${conteo.input_tokens.toLocaleString('es-PE')} tokens y el tope configurado ` +
          `es ${MAX_TOKENS_ENTRADA.toLocaleString('es-PE')}. No se evalúa un documento truncado: ` +
          `divídalo o eleve SACD_MAX_TOKENS_ENTRADA.`,
        413,
      );
    }

    // Se usa streaming porque la entrada es extensa y el tope de salida alto:
    // evita agotar el tiempo de espera de la petición HTTP.
    const stream = client.messages.stream({
      model: MODELO,
      max_tokens: 32_000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: esquemaDeSalida(criterios) },
      system: [
        // El documento y el catálogo se cachean: reevaluarlo con otra matriz
        // no vuelve a pagar ni uno ni otro.
        { type: 'text', text: INSTRUCCIONES },
        ...(baseDeConocimiento
          ? [
              {
                type: 'text' as const,
                text: baseDeConocimiento,
                cache_control: { type: 'ephemeral' as const },
              },
            ]
          : []),
        { type: 'text', text: contextoDocumento, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: instruccion }],
    });

    const respuesta = await stream.finalMessage();

    if (respuesta.stop_reason === 'refusal') {
      throw new ErrorDeMotor(
        'El modelo declinó evaluar el documento por motivos de seguridad. ' +
          `Categoría: ${respuesta.stop_details?.category ?? 'no indicada'}.`,
        422,
      );
    }
    if (respuesta.stop_reason === 'max_tokens') {
      throw new ErrorDeMotor(
        'La respuesta se cortó por longitud. Reduzca el número de criterios de la matriz o divida el documento.',
        502,
      );
    }

    const texto = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('');

    let datos: { resultados?: ResultadoDelModelo[] };
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new ErrorDeMotor('El motor devolvió una respuesta que no es JSON válido.');
    }

    if (!Array.isArray(datos.resultados)) {
      throw new ErrorDeMotor('El motor no devolvió la lista de resultados esperada.');
    }

    return {
      resultados: datos.resultados,
      usage: {
        // `input_tokens` excluye lo que fue a caché; sin sumar la escritura, el
        // consumo informado de un documento extenso parece ridículamente bajo.
        entrada: respuesta.usage.input_tokens,
        cacheEscrito: respuesta.usage.cache_creation_input_tokens ?? 0,
        cacheLeido: respuesta.usage.cache_read_input_tokens ?? 0,
        salida: respuesta.usage.output_tokens,
      },
    };
  } catch (error) {
    throw traducirError(error);
  }
}

/** Indica si el servidor tiene con qué invocar el motor. */
export function hayCredenciales(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export { MODELO };
