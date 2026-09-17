import { VEREDICTOS, consolidar, escalamiento } from '../src/lib/veredictos.ts';

/**
 * Las reglas de la skill: qué escala a revisión humana y cómo consolida la
 * dimensión. Se prueban sin modelo porque son reglas, no juicios: si alguna
 * cambia sin querer, un dictamen puede pasar de «No cumple» a «Cumple» sin que
 * nadie lo note.
 */

let fallos = 0;

function comprobar(nombre: string, condicion: boolean, detalle = '') {
  if (!condicion) fallos += 1;
  console.log(`${condicion ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

/* ── Traducción de veredictos ───────────────────────────────────────────── */

comprobar(
  'los cinco veredictos de la skill tienen estado propio',
  VEREDICTOS.C === 'cumple' &&
    VEREDICTOS.CP === 'parcial' &&
    VEREDICTOS.NC === 'no_cumple' &&
    VEREDICTOS.NA === 'no_aplica' &&
    VEREDICTOS.NE === 'no_evaluable',
);

/* ── Escalamiento ───────────────────────────────────────────────────────── */

comprobar('todo NE escala', escalamiento('no_evaluable', 'baja', 0.99).escalado);
comprobar('un NC de criticidad alta escala', escalamiento('no_cumple', 'alta', 0.95).escalado);
comprobar(
  'un NC de criticidad media no escala por sí solo',
  !escalamiento('no_cumple', 'media', 0.95).escalado,
);
comprobar('la confianza baja escala', escalamiento('cumple', 'baja', 0.69).escalado);
comprobar('la confianza justa en el umbral no escala', !escalamiento('cumple', 'baja', 0.7).escalado);
comprobar('sin confianza informada no se inventa un escalamiento', !escalamiento('cumple', 'baja', null).escalado);

/* ── Consolidación de la dimensión ──────────────────────────────────────── */

const todosCumplen = [
  { resultado: 'cumple' as const, criticidad: 'alta' },
  { resultado: 'cumple' as const, criticidad: 'media' },
  { resultado: 'no_aplica' as const, criticidad: 'baja' },
];
comprobar(
  'cumple cuando todo lo aplicable está en C',
  consolidar(todosCumplen).resultado === 'Cumple',
  consolidar(todosCumplen).resultado,
);

const unNcAlto = [
  { resultado: 'cumple' as const, criticidad: 'alta' },
  { resultado: 'cumple' as const, criticidad: 'alta' },
  { resultado: 'no_cumple' as const, criticidad: 'alta' },
];
comprobar(
  'un solo NC de criticidad alta basta para no cumplir',
  consolidar(unNcAlto).resultado === 'No cumple',
  consolidar(unNcAlto).regla,
);

// Nueve de diez criterios en C no salvan a un documento con cuatro NC medios.
const cuarentaPorCiento = [
  { resultado: 'no_cumple' as const, criticidad: 'media' },
  { resultado: 'no_cumple' as const, criticidad: 'media' },
  { resultado: 'cumple' as const, criticidad: 'media' },
  { resultado: 'cumple' as const, criticidad: 'media' },
  { resultado: 'cumple' as const, criticidad: 'media' },
];
comprobar(
  'el 40 % en NC no cumple aunque ninguno sea de criticidad alta',
  consolidar(cuarentaPorCiento).resultado === 'No cumple',
  consolidar(cuarentaPorCiento).regla,
);

const conNe = [
  { resultado: 'cumple' as const, criticidad: 'media' },
  { resultado: 'cumple' as const, criticidad: 'media' },
  { resultado: 'no_evaluable' as const, criticidad: 'media' },
];
comprobar(
  'un NE bloquea el «Cumple» aunque el resto cumpla',
  consolidar(conNe).resultado === 'Cumple parcialmente',
  consolidar(conNe).regla,
);

const soloParciales = [
  { resultado: 'cumple' as const, criticidad: 'media' },
  { resultado: 'parcial' as const, criticidad: 'media' },
];
comprobar(
  'un CP deja la dimensión en cumplimiento parcial',
  consolidar(soloParciales).resultado === 'Cumple parcialmente',
);

comprobar(
  'sin criterios aplicables la dimensión no se declara cumplida',
  consolidar([{ resultado: 'no_aplica' as const }]).resultado === 'No evaluable',
);

console.log(fallos === 0 ? '\nTodas las reglas se cumplen.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
