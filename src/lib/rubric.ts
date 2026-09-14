/**
 * Datos de la rúbrica base y del inventario normativo prioritario.
 *
 * Módulo sin dependencias de servidor: lo consumen tanto las rutas de API como
 * los componentes de cliente que precargan la matriz por omisión.
 */

/**
 * Matriz por omisión. Las cinco dimensiones y sus pesos reproducen la rúbrica
 * base del evaluador; la suma debe ser 100.
 */
export const DEFAULT_CRITERIA = [
  { dimension: 'Contenido', description: 'Objetivo y alcance claramente definidos', weight: 30 },
  { dimension: 'Estructura', description: 'Estructura y secciones obligatorias', weight: 20 },
  { dimension: 'Base legal', description: 'Sustento legal pertinente y vigente', weight: 25 },
  { dimension: 'Fuentes y citas', description: 'Fuentes verificables y trazables', weight: 15 },
  { dimension: 'Coincidencias', description: 'Consistencia con antecedentes institucionales', weight: 10 },
] as const;

/** Referencias prioritarias del inventario normativo interno. */
export const PRIORITY_NORMS = [
  {
    code: 'Ley N.º 29763',
    title: 'Ley Forestal y de Fauna Silvestre',
    issuer: 'Congreso de la República',
    subject: 'Forestal',
  },
  {
    code: 'RSG N.º 018-2017-SERFOR-SG',
    title: 'Directiva para la Gestión de Recursos Informáticos del SERFOR',
    issuer: 'SERFOR',
    subject: 'Tecnologías de la información',
  },
  {
    code: 'Directiva General N.º D00005-2022-MIDAGRI-SERFOR-GG',
    title: 'Directiva de Gestión Documental del SERFOR',
    issuer: 'SERFOR',
    subject: 'Gestión documental',
  },
  {
    code: 'Ley N.º 32069',
    title: 'Ley General de Contrataciones Públicas',
    issuer: 'Congreso de la República',
    subject: 'Contrataciones',
  },
  {
    code: 'Ley N.º 29733',
    title: 'Ley de Protección de Datos Personales',
    issuer: 'Congreso de la República',
    subject: 'Protección de datos',
  },
  {
    code: 'Decreto Supremo N.º 085-2023-PCM',
    title: 'Política Nacional de Transformación Digital al 2030',
    issuer: 'PCM',
    subject: 'Transformación digital',
  },
  {
    code: 'Decreto Supremo N.º 029-2021-PCM',
    title: 'Reglamento de la Ley de Gobierno Digital',
    issuer: 'PCM',
    subject: 'Gobierno Digital',
  },
  {
    code: 'Decreto Legislativo N.º 1412',
    title: 'Ley de Gobierno Digital',
    issuer: 'PCM',
    subject: 'Gobierno Digital',
  },
  {
    code: 'Directiva N.º 002-2024-PCM/SGTD',
    title: 'Directiva que regula el uso de la firma digital en las entidades públicas',
    issuer: 'PCM / SGTD',
    subject: 'Firma digital',
  },
  {
    code: 'Directiva N.º 001-2026-PCM/SGTD',
    title:
      'Directiva que regula el servicio de correo electrónico institucional en las entidades públicas',
    issuer: 'PCM / SGTD',
    subject: 'Gobierno Digital',
  },
] as const;
