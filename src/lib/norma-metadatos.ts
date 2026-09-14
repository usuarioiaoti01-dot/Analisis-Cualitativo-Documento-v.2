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
 * El segundo problema son los documentos que **complementan** una norma sin
 * tener código propio: una fe de erratas, una modificatoria, un anexo. Pedirles
 * «su» código devolvía el de la norma madre, y entonces el catálogo los
 * rechazaba como duplicados y se perdían sin que nadie lo notara. Se les da un
 * código compuesto que los distingue de la norma que complementan.
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

/** Cómo se nombra un documento que complementa a otra norma sin código propio. */
const ETIQUETA_COMPLEMENTO: Record<string, string> = {
  modificatoria: 'Modificatoria',
  fe_de_erratas: 'Fe de erratas',
  anexo: 'Anexo',
};

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
    required: ['naturaleza', 'code_propio', 'code_referido', 'title', 'issuer', 'subject'],
    properties: {
      naturaleza: {
        type: 'string',
        enum: ['norma', 'modificatoria', 'fe_de_erratas', 'anexo', 'otro'],
        description:
          'Qué es el documento. «norma» si se sostiene por sí mismo, aunque reglamente a otra ' +
          '(un reglamento aprobado por decreto supremo es una norma). «modificatoria», ' +
          '«fe_de_erratas» o «anexo» si solo complementa a otra norma. «otro» para lineamientos, ' +
          'estrategias, manuales o políticas sin código de norma.',
      },
      code_propio: {
        type: 'string',
        description:
          'Código del PROPIO documento, no de las normas que cita. Cadena vacía si el documento ' +
          'no tiene uno. Formato: «Decreto Supremo N° 115-2025-PCM», «Ley N° 29763», ' +
          '«Directiva N° 0031-2026-MIDAGRI-SG-OACID».',
      },
      code_referido: {
        type: 'string',
        description:
          'Código de la norma que este documento modifica, corrige o complementa. Cadena vacía ' +
          'si no aplica.',
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
      // Holgado a propósito: el razonamiento adaptativo consume de este mismo
      // presupuesto, y con 1000 la respuesta se cortaba a medio JSON.
      max_tokens: 8000,
      system: [
        'Identificas normas legales peruanas. Respondes solo con los datos que aparecen en el',
        'texto; no inventas ni completas con conocimiento externo.',
        '',
        'Lo más importante: distingue la norma QUE ES el documento de las normas que el',
        'documento CITA. El encabezado de una norma peruana suele nombrar primero las normas',
        'que la sustentan o que reglamenta; ninguna de esas es su código.',
      ].join('\n'),
      // Identificar una ficha no requiere deliberación: esfuerzo bajo.
      output_config: { effort: 'low', format: ESQUEMA },
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
    if (respuesta.stop_reason === 'max_tokens') {
      console.warn(`[catálogo] La identificación de «${fileName}» se cortó por longitud.`);
      return null;
    }

    const texto = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('');

    const datos = JSON.parse(texto) as {
      naturaleza?: string;
      code_propio?: string;
      code_referido?: string;
      title?: string;
      issuer?: string;
      subject?: string;
    };
    console.log('[diag]', fileName.slice(0,40), JSON.stringify(datos));
    if (!datos.title) return null;

    // El código debe pasar por el extractor de citas: si este no lo reconoce,
    // la etapa 5 tampoco lo emparejaría con las citas de un documento.
    const propio = datos.code_propio ? normalizarCodigo(datos.code_propio) : null;
    const referido = datos.code_referido ? normalizarCodigo(datos.code_referido) : null;

    const base = {
      title: datos.title.trim(),
      issuer: (datos.issuer ?? 'Por determinar').trim(),
      subject: (datos.subject ?? 'Por determinar').trim(),
    };

    if (propio) {
      return { ...base, code: propio, requiereRevision: false };
    }

    // Sin código propio pero con norma madre: es un complemento. Se le da un
    // código que lo distinga, para que no se confunda con la norma que
    // complementa ni se descarte como duplicado suyo.
    const etiqueta = ETIQUETA_COMPLEMENTO[datos.naturaleza ?? ''];
    if (etiqueta && referido) {
      return { ...base, code: `${etiqueta} de ${referido}`, requiereRevision: true };
    }

    return null;
  } catch (error) {
    // La heurística se hace cargo, pero el motivo se registra: una degradación
    // silenciosa hace parecer que la identificación «funciona mal» cuando en
    // realidad nunca llegó a consultarse al modelo.
    console.warn(
      `[catálogo] No se pudo identificar «${fileName}» con el modelo:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
