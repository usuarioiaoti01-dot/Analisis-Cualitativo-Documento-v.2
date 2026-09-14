import { clasificarSecciones, textoEvaluable } from '../src/lib/tramite.ts';
import { segmentar } from '../src/lib/segmentacion.ts';

/** Memorando real, con su carátula delante del cuerpo. */
const MEMORANDO = [
  '--- Página 1 ---',
  'MEMORANDO N° 000123-2026-MIDAGRI-SERFOR-GG-OTI',
  'JAIME DELGADO RAMOS',
  'Gerente General',
  'MARTÍN RODOLFO MONTOYA NEYRA',
  'Director de la Oficina de Tecnologías de la Información',
  'ASUNTO',
  'Opinión sobre la propuesta de directiva de gobierno digital.',
  'FECHA',
  'Lima, 14 de setiembre de 2026',
  'ANTECEDENTES',
  'Mediante el documento de la referencia se remite la propuesta de directiva.',
  'ANÁLISIS TÉCNICO',
  'La propuesta guarda correspondencia con el marco de gobierno digital vigente.',
  'BASE LEGAL',
  'Ley N° 29763, Ley Forestal y de Fauna Silvestre.',
  'CONCLUSIONES',
  'La propuesta resulta viable en los términos expuestos.',
  'RECOMENDACIONES',
  'Se recomienda su aprobación.',
].join('\n');

/** Una directiva no tiene carátula: su primera sección ya es cuerpo. */
const DIRECTIVA = [
  'DIRECTIVA GENERAL N° 000002-2024-SERFOR-GG',
  'Lineamientos para la gestión documental',
  'I. OBJETO',
  'Establecer los lineamientos aplicables.',
  'II. ALCANCE',
  'Todas las unidades de organización.',
].join('\n');

let fallos = 0;

function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (!condicion) fallos += 1;
  console.log(`${condicion ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

/* ── Memorando ──────────────────────────────────────────────────────────── */

const seccionesMemo = segmentar(MEMORANDO);
const rolesMemo = clasificarSecciones(seccionesMemo);
const tramite = seccionesMemo.filter((_, i) => rolesMemo[i] === 'tramite').map((s) => s.heading);
const cuerpo = seccionesMemo.filter((_, i) => rolesMemo[i] === 'cuerpo').map((s) => s.heading);

console.log('trámite:', tramite.join(' | '));
console.log('cuerpo :', cuerpo.join(' | '));

comprobar(
  'la carátula queda fuera del análisis',
  tramite.some((h) => h.startsWith('MEMORANDO')) &&
    tramite.some((h) => h.includes('JAIME DELGADO')) &&
    tramite.includes('ASUNTO') &&
    tramite.includes('FECHA'),
);
comprobar(
  'el cuerpo conserva sus cinco secciones',
  cuerpo.length === 5 && cuerpo[0].startsWith('ANTECEDENTES'),
  `${cuerpo.length} secciones`,
);

const evaluable = textoEvaluable(MEMORANDO, seccionesMemo);
comprobar('el texto evaluable empieza en ANTECEDENTES', evaluable.texto.includes('ANTECEDENTES'));
comprobar('el texto evaluable no incluye al remitente', !evaluable.texto.includes('JAIME DELGADO'));
comprobar('el texto evaluable conserva la marca de página', evaluable.texto.startsWith('--- Página 1 ---'));
comprobar('el texto evaluable llega hasta el final', evaluable.texto.includes('Se recomienda su aprobación.'));

/* ── Directiva ──────────────────────────────────────────────────────────── */

const seccionesDir = segmentar(DIRECTIVA);
const rolesDir = clasificarSecciones(seccionesDir);
const cuerpoDir = seccionesDir.filter((_, i) => rolesDir[i] === 'cuerpo').map((s) => s.heading);

comprobar(
  'las secciones numeradas nunca se descartan',
  seccionesDir.every((s, i) => s.numbering === null || rolesDir[i] === 'cuerpo'),
);
comprobar('la directiva conserva OBJETO y ALCANCE', cuerpoDir.length >= 2, cuerpoDir.join(' | '));

/* ── Guardas ────────────────────────────────────────────────────────────── */

comprobar(
  'un documento que pareciera todo carátula se analiza entero',
  clasificarSecciones([
    { numbering: null, heading: 'ASUNTO' },
    { numbering: null, heading: 'FECHA' },
  ]).every((rol) => rol === 'cuerpo'),
);
comprobar(
  'un título de cuerpo detiene la corrida aunque venga primero',
  clasificarSecciones([
    { numbering: null, heading: 'ANTECEDENTES' },
    { numbering: null, heading: 'ASUNTO' },
  ])[1] === 'cuerpo',
);

console.log(fallos === 0 ? '\nTodas las comprobaciones pasaron.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
