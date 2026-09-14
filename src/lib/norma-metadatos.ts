import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { extraerCitas } from './citas';
import { MODELO, hayCredenciales } from './motor-ia';

/**
 * Identificación de una norma a partir de su propio archivo.
 *
 * Quien incorpora normas al catálogo no debería tener que teclear código,
 * título, emisor y materia de cada una: están en el documento.
 *
 * El problema difícil es **cuál de los códigos que aparecen es el suyo**. La
 * primera cita del texto casi nunca lo es: un reglamento empieza nombrando la
 * ley que reglamenta, y una directiva lista su base legal antes de decir cómo
 * se llama. Tomar la primera cita metió «Ley N.º 31814» como código de un
 * decreto supremo y habría emparejado mal todas las citas de la etapa 5.
 *
 * Por eso el código lo decide el modelo, que lee el encabezado y el nombre del
 * archivo y distingue la norma propia de las referidas. Lo que devuelve se
 * normaliza con el mismo extractor de citas que usa la validación normativa
 * (`citas.ts`), de modo que una norma incorporada aquí se reconozca después en
 * el texto de un documento evaluado.
 *
 * Sin credencial se cae al nombre del archivo —que en los repositorios
 * institucionales suele contener el código propio— y el resultado se marca
 * para revisión.
 */

export interface MetadatosNorma {
  code: string;
  title: string;
  issuer: string;
  subject: string;
  /** Verdadero cuando algún campo se dedujo por heurística y conviene revisarlo. */
  requiereRevision: boolean;
}

/** Caracteres del inicio del documento que bastan para identificarlo. */
const VENTANA = 4000;

export async function detectarMetadatos(
  texto: string,
  fileName: string,
): Promise<MetadatosNorma | null> {
  const encabezado = texto.slice(0, VENTANA);

  if (hayCredenciales()) {
    const conIa = await pedirAlModelo(encabezado, fileName);
    if (conIa) return conIa;
  }

  // Sin modelo, el nombre del archivo es la mejor pista del código propio: el
  // cuerpo del documento empieza citando otras normas.
  const code = primerCodigo(fileName.replace(/[_-]+/g, ' ')) ?? primerCodigo(encabezado);
  if (!code) return null;

  return {
    code,
    title: tituloHeuristico(encabezado) ?? fileName.replace(/\.[^.]+$/, ''),
    issuer: 'Por determinar',
    subject: 'Por determinar',
    requiereRevision: true,
  };
}

/** Primer código de norma que aparece en el texto, en su forma canónica. */
function primerCodigo(texto: string): string | null {
  const cita = extraerCitas(texto)[0];
  return cita ? `${cita.tipo} N.º ${cita.numero}` : null;
}

/** Devuelve el código en la forma canónica del extractor, o null si no lo reconoce. */
function normalizarCodigo(bruto: string): string | null {
  return primerCodigo(bruto);
}

/**
 * Título probable: el renglón en mayúsculas más largo del encabezado. Es lo que
 * suele ser el título de una norma peruana, pero falla con frecuencia; por eso
 * su resultado siempre se marca para revisión.
 */
function tituloHeuristico(encabezado: string): string | null {
  const candidatos = encabezado
    .split('\n')
    .map((linea) => linea.trim().replace(/^[“"]|[”"]$/g, ''))
    .filter(
      (linea) =>
        linea.length >= 20 && linea.length <= 200 && linea === linea.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(linea),
    );

  return candidatos.sort((a, b) => b.length - a.length)[0] ?? null;
}

const ESQUEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'title', 'issuer', 'subject'],
    properties: {
      code: {
        type: 'string',
        description:
          'Código de la norma que ES este documento, no de las que cita. Un reglamento se ' +
          'identifica por su propio decreto supremo, no por la ley que reglamenta. Formato: ' +
          '«Decreto Supremo N° 115-2025-PCM», «Directiva N° 001-2025-PCM/SGTD», «Ley N° 29763».',
      },
      title: {
        type: 'string',
        description: 'Título oficial de la norma, sin el código ni comillas.',
      },
      issuer: {
        type: 'string',
        description:
          'Entidad que la emite: «Congreso de la República», «PCM», «SERFOR», «MIDAGRI», «PCM / SGTD»…',
      },
      subject: {
        type: 'string',
        description: 'Materia en dos o tres palabras: «Contrataciones», «Gobierno Digital», «Forestal»…',
      },
    },
  },
};

async function pedirAlModelo(
  encabezado: string,
  fileName: string,
): Promise<MetadatosNorma | null> {
  try {
    const client = new Anthropic();

    const respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: 1000,
      system: [
        'Identificas normas legales peruanas. Respondes solo con los datos que aparecen en el',
        'texto; no inventas ni completas con conocimiento externo.',
        '',
        'Lo más importante: distingue la norma QUE ES el documento de las normas que el',
        'documento CITA. El encabezado de una norma peruana suele nombrar primero las normas',
        'que la sustentan o que reglamenta; ninguna de esas es su código.',
      ].join('\n'),
      output_config: { format: ESQUEMA },
      messages: [
        {
          role: 'user',
          content: [
            `Nombre del archivo: ${fileName}`,
            '',
            'Primera parte del documento:',
            encabezado,
          ].join('\n'),
        },
      ],
    });

    if (respuesta.stop_reason === 'refusal') return null;

    const texto = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('');

    const datos = JSON.parse(texto) as {
      code?: string;
      title?: string;
      issuer?: string;
      subject?: string;
    };
    if (!datos.code || !datos.title) return null;

    // El código debe pasar por el extractor de citas: si este no lo reconoce,
    // la etapa 5 tampoco lo emparejaría con las citas de un documento.
    const code = normalizarCodigo(datos.code);
    if (!code) return null;

    return {
      code,
      title: datos.title.trim(),
      issuer: (datos.issuer ?? 'Por determinar').trim(),
      subject: (datos.subject ?? 'Por determinar').trim(),
      requiereRevision: false,
    };
  } catch {
    // Si el modelo no responde, la heurística se hace cargo.
    return null;
  }
}
