import { extraerCitas } from '../src/lib/citas.ts';

/**
 * El orden de los tipos importa: las siglas se solapan («RDE» contiene «RD»),
 * y un tipo mal reconocido empareja la cita con la norma equivocada del
 * catálogo. Cada caso fija un tipo que el extractor debe distinguir.
 */
const CASOS: [texto: string, tipo: string, numero: string][] = [
  ['RGG N° D000026-2021-MIDAGRI-SERFOR-GG', 'Resolución de Gerencia General', 'D000026-2021-MIDAGRI-SERFOR-GG'],
  ['RDE N° D000030-2023-MIDAGRI-SERFOR-DE', 'Resolución de Dirección Ejecutiva', 'D000030-2023-MIDAGRI-SERFOR-DE'],
  [
    'Resolución de Dirección Ejecutiva N° 118-2020-MINAGRI-SERFOR-DE',
    'Resolución de Dirección Ejecutiva',
    '118-2020-MINAGRI-SERFOR-DE',
  ],
  ['RSG N.º 018-2017-SERFOR-SG', 'Resolución de Secretaría General', '018-2017-SERFOR-SG'],
  ['R.D. N° 004-2019-JUS', 'Resolución Directoral', '004-2019-JUS'],
  ['R.M. N° 0123-2024-MIDAGRI', 'Resolución Ministerial', '0123-2024-MIDAGRI'],
  ['Decreto Supremo N.º 085-2023-PCM', 'Decreto Supremo', '085-2023-PCM'],
  ['D.S. 009-2025-EF', 'Decreto Supremo', '009-2025-EF'],
  ['Ley N° 29763', 'Ley', '29763'],
  ['Directiva General N.º D00005-2022-MIDAGRI-SERFOR-GG', 'Directiva General', 'D00005-2022-MIDAGRI-SERFOR-GG'],
  ['DI 0031-2026-MIDAGRI/SG-OACID', 'Directiva', '0031-2026-MIDAGRI/SG-OACID'],
];

let fallos = 0;

for (const [texto, tipo, numero] of CASOS) {
  const cita = extraerCitas(texto)[0];
  const ok = cita?.tipo === tipo && cita?.numero === numero;
  if (!ok) fallos += 1;

  const obtenido = cita ? `${cita.tipo} → ${cita.numero}` : '(no reconocida)';
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${texto}${ok ? '' : ` — se obtuvo ${obtenido}`}`);
}

// Una cita partida por el corte de renglón de un PDF sigue siendo una cita.
const partida = extraerCitas('conforme a la Ley\nN° 27444, Ley del Procedimiento')[0];
const okPartida = partida?.tipo === 'Ley' && partida.numero === '27444';
if (!okPartida) fallos += 1;
console.log(`${okPartida ? 'OK  ' : 'FALLA'} cita partida entre dos renglones`);

// «Directiva General» no debe generar además una cita suelta de «Directiva».
const unaSola = extraerCitas('Directiva General N.º D00005-2022-MIDAGRI-SERFOR-GG').length === 1;
if (!unaSola) fallos += 1;
console.log(`${unaSola ? 'OK  ' : 'FALLA'} el tipo más específico no deja una cita duplicada`);

console.log(fallos === 0 ? '\nTodas las citas se reconocieron.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
