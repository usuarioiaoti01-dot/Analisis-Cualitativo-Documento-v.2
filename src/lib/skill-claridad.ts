import 'server-only';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Skill «analisis-documental-general»: el método con el que se evalúa.
 *
 * La skill vive en `skills/analisis-documental-general/` y es la pieza central
 * del análisis, no un añadido. Aporta tres cosas que el motor no tenía:
 *
 *  1. **Un procedimiento**: encuadrar el documento por su lector y su función
 *     antes de juzgarlo, evaluar un criterio a la vez y fundar cada veredicto
 *     en un principio de la ISO 24495-1.
 *  2. **El veredicto NE**. «No encontré prueba» y «probé que no cumple» son
 *     cosas distintas, y confundirlas destruye la credibilidad de un dictamen
 *     automatizado. Sin NE, el motor tenía que elegir entre acusar sin prueba
 *     o callar.
 *  3. **Medición objetiva** previa al juicio, con el script que la propia
 *     skill empaqueta: dos corridas del mismo análisis dan los mismos números.
 *
 * Lo que la skill NO decide es qué se evalúa: los criterios los pone la matriz
 * aprobada de la entidad. La propia skill lo dice —«si el usuario aporta una
 * rúbrica aprobada propia, esa manda sobre la de referencia»—, así que aquí se
 * combinan método de la skill y criterios de la matriz.
 *
 * Se copia dentro del repositorio a propósito: el método con el que se emitió
 * un dictamen debe poder reconstruirse tal como estaba ese día, y una skill
 * que viva fuera cambia sin que la aplicación se entere.
 */

const RAIZ = path.join(process.cwd(), 'skills', 'analisis-documental-general');

/** Ejecutable de Python. En Windows suele ser «python» a secas. */
const PYTHON = process.env.SACD_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

/** Medir un documento extenso no debería pasar de unos segundos. */
const TIEMPO_MAXIMO_MS = 60_000;

export type PerfilDestinatario = 'ciudadano' | 'externo' | 'interno';
export type PerfilFuncion = 'decide' | 'regula' | 'sustenta' | 'informa' | 'registra';

export interface PerfilDelDocumento {
  destinatario: PerfilDestinatario;
  funcion: PerfilFuncion;
  /** «preajuste» cuando el tipo documental figura en la rúbrica; «derivado» si no. */
  origen: 'preajuste' | 'derivado';
  justificacion: string;
}

/**
 * Preajustes de la sección 4 de `references/rubrica-d4-serfor.md`, por el tipo
 * documental que maneja esta aplicación. Lo que no figure se deriva.
 */
const PREAJUSTES: Record<string, { destinatario: PerfilDestinatario; funcion: PerfilFuncion }> = {
  'informe': { destinatario: 'interno', funcion: 'sustenta' },
  'informe técnico': { destinatario: 'interno', funcion: 'sustenta' },
  'informe legal': { destinatario: 'interno', funcion: 'sustenta' },
  'tdr': { destinatario: 'interno', funcion: 'sustenta' },
  'memorando': { destinatario: 'interno', funcion: 'informa' },
  'memorando múltiple': { destinatario: 'interno', funcion: 'informa' },
  'oficio': { destinatario: 'externo', funcion: 'informa' },
  'oficio múltiple': { destinatario: 'externo', funcion: 'informa' },
  'carta': { destinatario: 'ciudadano', funcion: 'decide' },
  'carta múltiple': { destinatario: 'ciudadano', funcion: 'decide' },
  'directiva': { destinatario: 'interno', funcion: 'regula' },
  'proyecto normativo': { destinatario: 'interno', funcion: 'regula' },
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Encuadra el documento en los dos ejes que gobiernan la evaluación. */
export function perfilDe(tipoDocumental: string): PerfilDelDocumento {
  const clave = Object.keys(PREAJUSTES).find(
    (tipo) => normalizar(tipo) === normalizar(tipoDocumental),
  );

  if (clave) {
    const preajuste = PREAJUSTES[clave];
    return {
      ...preajuste,
      origen: 'preajuste',
      justificacion: `Preajuste de la rúbrica D4 para «${tipoDocumental}».`,
    };
  }

  // Sin preajuste no se fuerza el documento dentro del tipo más parecido: se
  // aplica el perfil más exigente de los que caben y se declara, que es lo que
  // la skill pide hacer ante la duda.
  return {
    destinatario: 'interno',
    funcion: 'informa',
    origen: 'derivado',
    justificacion:
      `«${tipoDocumental}» no tiene preajuste en la rúbrica. Se deriva el perfil más ` +
      'conservador para un documento de trámite interno; revíselo si el destinatario real ' +
      'es un administrado, porque entonces la exigencia sube.',
  };
}

/* ── Medición objetiva ──────────────────────────────────────────────────── */

export interface MetricasDeClaridad {
  palabras: number;
  oraciones: number;
  palabras_por_oracion: number;
  oracion_mas_larga: number;
  szigriszt_pazos: number;
  escala_inflesz: string;
  fernandez_huerta: number;
  densidad_pasiva: number;
  densidad_subordinacion: number;
  densidad_nominalizacion: number;
  conectores_distintos: number;
  siglas_sin_desarrollar: string[];
  umbrales: Record<string, number>;
  fuera_de_umbral: string[];
  hallazgos?: { tipo: string; cita: string; nota?: string }[];
  [clave: string]: unknown;
}

/**
 * Ejecuta el script de la skill. Devuelve `null` si no hay Python o si el
 * script falla: la evaluación sigue sin métricas, diciéndolo, porque perder el
 * análisis entero por no poder medir sería peor.
 */
export async function medirClaridad(
  texto: string,
  perfil: PerfilDestinatario,
): Promise<MetricasDeClaridad | null> {
  const script = path.join(RAIZ, 'scripts', 'metricas_claridad.py');
  const temporal = path.join(os.tmpdir(), `sacd-${randomUUID()}.txt`);

  try {
    await fs.writeFile(temporal, texto, 'utf8');
    const salida = await ejecutar(PYTHON, [script, temporal, '--perfil', perfil, '--json']);
    return JSON.parse(salida) as MetricasDeClaridad;
  } catch (error) {
    console.warn(
      '[claridad] No se pudieron calcular las métricas:',
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    await fs.rm(temporal, { force: true });
  }
}

function ejecutar(comando: string, argumentos: string[]): Promise<string> {
  return new Promise((resolver, rechazar) => {
    // El script imprime acentos: sin esto, Windows los rompe al capturarlos.
    const proceso = spawn(comando, argumentos, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let salida = '';
    let error = '';
    proceso.stdout.on('data', (trozo) => (salida += String(trozo)));
    proceso.stderr.on('data', (trozo) => (error += String(trozo)));

    const reloj = setTimeout(() => {
      proceso.kill();
      rechazar(new Error('el cálculo de métricas tardó demasiado'));
    }, TIEMPO_MAXIMO_MS);

    proceso.on('error', (fallo) => {
      clearTimeout(reloj);
      rechazar(new Error(`no se pudo invocar «${comando}»: ${fallo.message}`));
    });

    proceso.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) resolver(salida);
      else rechazar(new Error(error.trim().split('\n')[0] || `código de salida ${codigo}`));
    });
  });
}

/* ── El método, tal como lo redacta la skill ────────────────────────────── */

let metodoEnMemoria: string | null = null;

/**
 * Texto del método que se entrega al modelo: la skill y sus referencias.
 *
 * Se leen del disco y no se copian a una plantilla aparte: duplicar el método
 * garantiza que un día la plantilla y la skill digan cosas distintas, y el
 * dictamen dejaría de corresponder al procedimiento aprobado.
 */
export async function metodoDeAnalisis(): Promise<string> {
  if (metodoEnMemoria) return metodoEnMemoria;

  const partes: string[] = [];

  for (const archivo of [
    'SKILL.md',
    path.join('references', 'iso-24495-1.md'),
    path.join('references', 'rubrica-d4-serfor.md'),
  ]) {
    try {
      const contenido = await fs.readFile(path.join(RAIZ, archivo), 'utf8');
      // El preámbulo YAML de la skill es metadato de activación, no método.
      partes.push(`===== ${archivo} =====\n${contenido.replace(/^---\n[\s\S]*?\n---\n/, '')}`);
    } catch {
      console.warn(`[claridad] No se encontró «${archivo}» de la skill.`);
    }
  }

  if (partes.length === 0) return '';

  metodoEnMemoria = [
    'MÉTODO DE ANÁLISIS — skill «analisis-documental-general» del SERFOR.',
    '',
    'Este es el procedimiento con el que debes evaluar. Gobierna cómo se evalúa:',
    'el encuadre por lector y función, la exigencia de cita literal, la distinción',
    'entre NC y NE, la criticidad y la confianza.',
    '',
    'Qué toma la skill y qué toma la matriz:',
    '- El MÉTODO es el de la skill, sin excepciones.',
    '- Los CRITERIOS son los de la matriz aprobada de la entidad, que se te entregan',
    '  aparte. La propia skill lo ordena así: una rúbrica aprobada propia manda sobre',
    '  la rúbrica D4 de referencia. La rúbrica D4 que aparece más abajo se usa para',
    '  interpretar los criterios de la matriz y derivar su criticidad, no para',
    '  sustituirlos ni para añadir criterios que la matriz no contiene.',
    '',
    partes.join('\n\n'),
  ].join('\n');

  return metodoEnMemoria;
}

/** Resumen de las métricas para el prompt, en el formato que la skill espera. */
export function metricasParaElPrompt(
  metricas: MetricasDeClaridad | null,
  perfil: PerfilDelDocumento,
): string {
  const encuadre = [
    'ENCUADRE DEL DOCUMENTO (eje 1 y eje 2 de la skill)',
    `- Lector previsto: ${perfil.destinatario}`,
    `- Función: ${perfil.funcion}`,
    `- Origen del perfil: ${perfil.origen}`,
    `- Justificación: ${perfil.justificacion}`,
    'Si al leer el documento concluyes que este encuadre es erróneo, dilo en el',
    'comentario del primer criterio y evalúa con el perfil que corresponda.',
  ].join('\n');

  if (!metricas) {
    return [
      encuadre,
      '',
      'MEDICIÓN OBJETIVA: no disponible en esta corrida. No estimes los índices a ojo:',
      'funda los veredictos en el texto y omite toda afirmación numérica sobre',
      'legibilidad.',
    ].join('\n');
  }

  const fuera = metricas.fuera_de_umbral ?? [];

  return [
    encuadre,
    '',
    'MEDICIÓN OBJETIVA (scripts/metricas_claridad.py, ya ejecutado sobre este documento)',
    `- Palabras: ${metricas.palabras} · Oraciones: ${metricas.oraciones} · Palabras por oración: ${metricas.palabras_por_oracion}`,
    `- Oración más larga: ${metricas.oracion_mas_larga} palabras`,
    `- Szigriszt-Pazos: ${metricas.szigriszt_pazos} (${metricas.escala_inflesz}) · Fernández Huerta: ${metricas.fernandez_huerta}`,
    `- Voz pasiva: ${metricas.densidad_pasiva}% · Subordinación: ${metricas.densidad_subordinacion} · Nominalización: ${metricas.densidad_nominalizacion}%`,
    `- Conectores distintos: ${metricas.conectores_distintos}`,
    `- Siglas sin desarrollar: ${(metricas.siglas_sin_desarrollar ?? []).join(', ') || 'ninguna'}`,
    `- Umbrales del perfil «${perfil.destinatario}»: ${JSON.stringify(metricas.umbrales ?? {})}`,
    `- Fuera de umbral: ${fuera.length > 0 ? fuera.join(', ') : 'ninguno'}`,
    '',
    'Estos números son dato, no veredicto: un umbral rebasado no es un defecto si el',
    'pasaje, leído, resulta claro. Cítalos cuando funden un hallazgo y no inventes',
    'otros.',
    ...(metricas.hallazgos && metricas.hallazgos.length > 0
      ? [
          '',
          'PASAJES CRÍTICOS YA EXTRAÍDOS LITERALMENTE (material de evidencia preferente):',
          ...metricas.hallazgos
            .slice(0, 25)
            .map((hallazgo) => `- [${hallazgo.tipo}] «${hallazgo.cita}»`),
        ]
      : []),
  ].join('\n');
}
