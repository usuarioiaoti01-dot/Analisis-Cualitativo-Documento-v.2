import { verificarCita } from '../src/lib/evidencia.ts';

const documento = [
  '--- Página 1 ---',
  'IV. BASE LEGAL',
  '4.1 Ley N° 27815, Ley del Código de Ética de la Función Pública y sus',
  'modificatorias.',
  '',
  '--- Página 7 ---',
  'VII. DISPOSICIONES',
  'El   área  usuaria   deberá   remitir   el   requerimiento  con  la  documentación',
  'sustentatoria correspondiente.',
].join('\n');

const secciones = [
  { id: 1, numbering: 'IV', heading: 'BASE LEGAL', page_from: 1, char_start: 17, char_end: 120 },
  { id: 2, numbering: 'VII', heading: 'DISPOSICIONES', page_from: 7, char_start: 120, char_end: documento.length },
];

const casos: [string, string, boolean][] = [
  ['cita exacta', 'Ley del Código de Ética de la Función Pública', true],
  ['cita partida entre renglones', 'Función Pública y sus\nmodificatorias', true],
  ['cita con espacios múltiples colapsados', 'El área usuaria deberá remitir el requerimiento', true],
  ['cita con comillas tipográficas', '“Ley del Código de Ética de la Función Pública”'.replace(/[“”]/g, ''), true],
  ['cita inventada', 'El proveedor asumirá una penalidad del veinte por ciento', false],
  ['cita alterada en una palabra', 'Ley del Código de Ética de la Función Publica y sus modificaciones', false],
  ['cita demasiado corta', 'BASE LEGAL', false],
];

let fallos = 0;
for (const [nombre, cita, esperado] of casos) {
  const resultado = verificarCita(documento, secciones, cita);
  const ok = Boolean(resultado) === esperado;
  if (!ok) fallos += 1;
  const ubic = resultado ? ` -> ${resultado.ubicacion}` : '';
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${ubic}`);
}

console.log(fallos === 0 ? '\nTodas las verificaciones pasaron.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
