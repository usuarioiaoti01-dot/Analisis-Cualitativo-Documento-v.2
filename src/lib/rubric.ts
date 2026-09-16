/**
 * Rúbricas de evaluación y catálogo normativo prioritario.
 *
 * Módulo sin dependencias de servidor: lo consumen tanto las rutas de API como
 * los componentes de cliente que precargan una matriz.
 *
 * Las cinco dimensiones y sus pesos de referencia (30/20/25/15/10) son comunes
 * a todas las matrices; lo que cambia entre tipos documentales son los criterios
 * dentro de cada dimensión y el reparto del peso entre ellos. En toda matriz la
 * suma de las ponderaciones es exactamente 100.
 */

export interface CriterioPlantilla {
  dimension: string;
  description: string;
  weight: number;
  /** Pregunta concreta que debe responder el evaluador. */
  indicator: string;
  /** Tope de la escala ordinal. 5 significa que el criterio se puntúa de 1 a 5. */
  scaleMax?: number;
}

export interface MatrizPlantilla {
  name: string;
  documentType: string;
  criteria: CriterioPlantilla[];
}

/** Las cinco dimensiones, con su peso de referencia. */
export const DIMENSIONES = [
  { nombre: 'Contenido', peso: 30 },
  { nombre: 'Estructura', peso: 20 },
  { nombre: 'Base legal', peso: 25 },
  { nombre: 'Evidencia y fuentes', peso: 15 },
  { nombre: 'Coincidencias con repositorio', peso: 10 },
] as const;

/** Escala ordinal común. El puntaje de un criterio va de 1 a 5. */
export const ESCALA = [
  { valor: 1, etiqueta: 'Ausente', descripcion: 'El criterio no se aborda en el documento.' },
  { valor: 2, etiqueta: 'Insuficiente', descripcion: 'Se menciona, pero sin desarrollo ni sustento.' },
  { valor: 3, etiqueta: 'Aceptable', descripcion: 'Se cumple lo mínimo; quedan vacíos relevantes.' },
  { valor: 4, etiqueta: 'Satisfactorio', descripcion: 'Se cumple con sustento; observaciones menores.' },
  { valor: 5, etiqueta: 'Óptimo', descripcion: 'Se cumple íntegramente y con evidencia verificable.' },
] as const;

/**
 * Matriz general, aplicable a cualquier tipo documental. Es la que precarga el
 * modal de «Nueva matriz» y la que se instala en la primera ejecución.
 */
export const DEFAULT_CRITERIA: CriterioPlantilla[] = [
  {
    dimension: 'Contenido',
    description: 'Objetivo y alcance claramente definidos',
    weight: 30,
    indicator: '¿El documento declara con precisión qué busca y hasta dónde llega?',
  },
  {
    dimension: 'Estructura',
    description: 'Estructura y secciones obligatorias',
    weight: 20,
    indicator: '¿Están presentes y ordenadas todas las secciones que exige el tipo documental?',
  },
  {
    dimension: 'Base legal',
    description: 'Sustento legal pertinente y vigente',
    weight: 25,
    indicator: '¿Las normas citadas son pertinentes al objeto y se encuentran vigentes?',
  },
  {
    dimension: 'Evidencia y fuentes',
    description: 'Fuentes verificables y trazables',
    weight: 15,
    indicator: '¿Cada afirmación relevante remite a una fuente que puede comprobarse?',
  },
  {
    dimension: 'Coincidencias con repositorio',
    description: 'Consistencia con antecedentes institucionales',
    weight: 10,
    indicator: '¿El documento es consistente con sus antecedentes y no duplica contenido sin justificarlo?',
  },
];

const MATRIZ_INFORME_TECNICO: MatrizPlantilla = {
  name: 'Matriz de informe técnico',
  documentType: 'Informe Técnico',
  criteria: [
    {
      dimension: 'Contenido',
      description: 'Problema y objetivo',
      weight: 12,
      indicator: '¿El informe delimita el problema que atiende y el objetivo que persigue?',
    },
    {
      dimension: 'Contenido',
      description: 'Análisis técnico',
      weight: 10,
      indicator: '¿El análisis es suficiente, coherente con el problema y libre de contradicciones internas?',
    },
    {
      dimension: 'Contenido',
      description: 'Conclusiones y recomendaciones',
      weight: 8,
      indicator: '¿Las conclusiones se derivan del análisis y las recomendaciones son accionables?',
    },
    {
      dimension: 'Estructura',
      description: 'Secciones obligatorias',
      weight: 12,
      indicator: '¿Incluye antecedentes, base legal, análisis, conclusiones y recomendaciones?',
    },
    {
      dimension: 'Estructura',
      description: 'Redacción, numeración y anexos',
      weight: 8,
      indicator: '¿La numeración es consistente y los anexos están referenciados en el cuerpo?',
    },
    {
      dimension: 'Base legal',
      description: 'Competencia funcional',
      weight: 13,
      indicator: '¿El órgano que emite el informe es competente sobre la materia que resuelve?',
    },
    {
      dimension: 'Base legal',
      description: 'Pertinencia y vigencia de la normativa citada',
      weight: 12,
      indicator: '¿Las normas invocadas están vigentes y guardan relación con el objeto del informe?',
    },
    {
      dimension: 'Evidencia y fuentes',
      description: 'Sustento de los datos',
      weight: 9,
      indicator: '¿Las cifras y afirmaciones técnicas remiten a una fuente identificable?',
    },
    {
      dimension: 'Evidencia y fuentes',
      description: 'Trazabilidad documental',
      weight: 6,
      indicator: '¿Los documentos de referencia se citan con número, fecha y emisor?',
    },
    {
      dimension: 'Coincidencias con repositorio',
      description: 'Consistencia con antecedentes',
      weight: 10,
      indicator: '¿El informe contradice o repite sin justificación pronunciamientos anteriores de la entidad?',
    },
  ],
};

const MATRIZ_TDR: MatrizPlantilla = {
  name: 'Matriz de TDR y especificaciones técnicas',
  documentType: 'TDR',
  criteria: [
    {
      dimension: 'Contenido',
      description: 'Necesidad y objeto de la contratación',
      weight: 10,
      indicator: '¿La necesidad está sustentada y el objeto de la contratación es unívoco?',
    },
    {
      dimension: 'Contenido',
      description: 'Alcance y actividades',
      weight: 10,
      indicator: '¿Las actividades describen el trabajo sin ambigüedad y sin remitir a criterios subjetivos?',
    },
    {
      dimension: 'Contenido',
      description: 'Entregables',
      weight: 10,
      indicator: '¿Cada entregable define producto, formato y condición de aceptación?',
    },
    {
      dimension: 'Estructura',
      description: 'Secciones obligatorias del requerimiento',
      weight: 10,
      indicator: '¿Contiene finalidad pública, objeto, alcance, entregables, plazos, perfil y conformidad?',
    },
    {
      dimension: 'Estructura',
      description: 'Plazos y cronograma',
      weight: 10,
      indicator: '¿Los plazos son determinados, consistentes entre sí y computables desde un hito cierto?',
    },
    {
      dimension: 'Base legal',
      description: 'Coherencia con la Ley N.º 32069 y su Reglamento',
      weight: 13,
      indicator: '¿El requerimiento se ajusta a la normativa de contrataciones vigente?',
    },
    {
      dimension: 'Base legal',
      description: 'Penalidades y causales de resolución',
      weight: 12,
      indicator: '¿Las penalidades están tipificadas, son proporcionales y tienen fórmula de cálculo?',
    },
    {
      dimension: 'Evidencia y fuentes',
      description: 'Perfil del proveedor sustentado',
      weight: 8,
      indicator: '¿Los requisitos de experiencia y formación guardan proporción con el objeto y no restringen la competencia?',
    },
    {
      dimension: 'Evidencia y fuentes',
      description: 'Criterios de conformidad verificables',
      weight: 7,
      indicator: '¿La conformidad se otorga contra evidencia objetiva y no contra apreciación discrecional?',
    },
    {
      dimension: 'Coincidencias con repositorio',
      description: 'Reutilización de requerimientos previos',
      weight: 10,
      indicator: '¿El TDR reproduce requerimientos anteriores sin adecuarlos a la necesidad actual?',
    },
  ],
};

const MATRIZ_OFICIO: MatrizPlantilla = {
  name: 'Matriz de oficio y memorando',
  documentType: 'Oficio',
  criteria: [
    {
      dimension: 'Contenido',
      description: 'Petición concreta',
      weight: 15,
      indicator: '¿Se identifica sin ambigüedad qué se solicita o comunica y qué se espera del destinatario?',
    },
    {
      dimension: 'Contenido',
      description: 'Antecedentes',
      weight: 15,
      indicator: '¿Los antecedentes permiten entender el asunto sin recurrir a documentos externos?',
    },
    {
      dimension: 'Estructura',
      description: 'Destinatario y referencia',
      weight: 10,
      indicator: '¿El destinatario es el órgano competente y la referencia identifica el expediente?',
    },
    {
      dimension: 'Estructura',
      description: 'Claridad de la acción requerida',
      weight: 10,
      indicator: '¿La acción solicitada y su plazo están expresados de forma inequívoca?',
    },
    {
      dimension: 'Base legal',
      description: 'Competencia del órgano',
      weight: 13,
      indicator: '¿El órgano remitente tiene atribución para formular lo que solicita?',
    },
    {
      dimension: 'Base legal',
      description: 'Sustento normativo',
      weight: 12,
      indicator: '¿La solicitud invoca la norma que la habilita, con artículo y vigencia correctos?',
    },
    {
      dimension: 'Evidencia y fuentes',
      description: 'Documentos de sustento citados',
      weight: 15,
      indicator: '¿Los documentos que sustentan la petición se citan con número, fecha y emisor?',
    },
    {
      dimension: 'Coincidencias con repositorio',
      description: 'Consistencia con comunicaciones previas',
      weight: 10,
      indicator: '¿El documento reitera o contradice comunicaciones anteriores sobre el mismo asunto?',
    },
  ],
};

const MATRIZ_NORMATIVO: MatrizPlantilla = {
  name: 'Matriz de proyecto normativo y directiva',
  documentType: 'Proyecto normativo',
  criteria: [
    {
      dimension: 'Contenido',
      description: 'Objeto y finalidad',
      weight: 8,
      indicator: '¿El objeto delimita la materia regulada y la finalidad explica el resultado buscado?',
    },
    {
      dimension: 'Contenido',
      description: 'Definiciones',
      weight: 7,
      indicator: '¿Los términos técnicos empleados están definidos y se usan de forma consistente?',
    },
    {
      dimension: 'Contenido',
      description: 'Roles y responsabilidades',
      weight: 8,
      indicator: '¿Cada obligación tiene un responsable identificado dentro de la estructura de la entidad?',
    },
    {
      dimension: 'Contenido',
      description: 'Procedimientos',
      weight: 7,
      indicator: '¿Los procedimientos indican actor, insumo, plazo y producto en cada paso?',
    },
    {
      dimension: 'Estructura',
      description: 'Estructura normativa y numeración',
      weight: 10,
      indicator: '¿La numeración de artículos y numerales es correlativa y sin referencias rotas?',
    },
    {
      dimension: 'Estructura',
      description: 'Disposiciones complementarias y transitorias',
      weight: 10,
      indicator: '¿Prevé entrada en vigencia, régimen transitorio y derogaciones expresas?',
    },
    {
      dimension: 'Base legal',
      description: 'Habilitación legal',
      weight: 13,
      indicator: '¿Existe norma de rango suficiente que habilite a la entidad a regular esta materia?',
    },
    {
      dimension: 'Base legal',
      description: 'Jerarquía y consistencia con normas superiores',
      weight: 12,
      indicator: '¿El proyecto respeta la jerarquía normativa y no contradice normas de rango superior?',
    },
    {
      dimension: 'Evidencia y fuentes',
      description: 'Sustento técnico de la propuesta',
      weight: 15,
      indicator: '¿La necesidad de regular está sustentada en evidencia y no solo en apreciación?',
    },
    {
      dimension: 'Coincidencias con repositorio',
      description: 'Duplicidad con normativa vigente',
      weight: 10,
      indicator: '¿La materia ya está regulada por una norma vigente que el proyecto no deroga ni modifica?',
    },
  ],
};

/** Matrices que se instalan en la primera ejecución, una por tipo documental. */
export const MATRICES_POR_TIPO: MatrizPlantilla[] = [
  { name: 'Matriz general de calidad documental', documentType: 'Informe Técnico', criteria: DEFAULT_CRITERIA },
  MATRIZ_INFORME_TECNICO,
  MATRIZ_TDR,
  MATRIZ_OFICIO,
  MATRIZ_NORMATIVO,
];

/**
 * Referencias prioritarias del inventario normativo interno.
 *
 * `aliases` recoge las formas alternativas con que una norma suele citarse en
 * los documentos; es lo que permitirá reconocer la cita aunque no coincida
 * literalmente con el código.
 */
export const PRIORITY_NORMS = [
  {
    code: 'Ley N.º 29763',
    title: 'Ley Forestal y de Fauna Silvestre',
    issuer: 'Congreso de la República',
    subject: 'Forestal',
    aliases: 'Ley 29763|Ley Forestal y de Fauna Silvestre|LFFS',
  },
  {
    code: 'RSG N.º 018-2017-SERFOR-SG',
    title: 'Directiva para la Gestión de Recursos Informáticos del SERFOR',
    issuer: 'SERFOR',
    subject: 'Tecnologías de la información',
    aliases: 'RSG 018-2017-SERFOR-SG|Resolución de Secretaría General 018-2017-SERFOR-SG',
  },
  {
    code: 'Directiva General N.º D00005-2022-MIDAGRI-SERFOR-GG',
    title: 'Directiva de Gestión Documental del SERFOR',
    issuer: 'SERFOR',
    subject: 'Gestión documental',
    aliases: 'D00005-2022-MIDAGRI-SERFOR-GG|Directiva 005-2022-MIDAGRI-SERFOR-GG',
  },
  {
    code: 'Ley N.º 32069',
    title: 'Ley General de Contrataciones Públicas',
    issuer: 'Congreso de la República',
    subject: 'Contrataciones',
    aliases: 'Ley 32069|Ley General de Contrataciones Públicas|LGCP',
  },
  {
    code: 'Ley N.º 29733',
    title: 'Ley de Protección de Datos Personales',
    issuer: 'Congreso de la República',
    subject: 'Protección de datos',
    aliases: 'Ley 29733|Ley de Protección de Datos Personales|LPDP',
  },
  {
    code: 'Decreto Supremo N.º 085-2023-PCM',
    title: 'Política Nacional de Transformación Digital al 2030',
    issuer: 'PCM',
    subject: 'Transformación digital',
    aliases: 'DS 085-2023-PCM|D.S. N.º 085-2023-PCM',
  },
  {
    code: 'Decreto Supremo N.º 029-2021-PCM',
    title: 'Reglamento de la Ley de Gobierno Digital',
    issuer: 'PCM',
    subject: 'Gobierno Digital',
    aliases: 'DS 029-2021-PCM|D.S. N.º 029-2021-PCM|Reglamento de la Ley de Gobierno Digital',
  },
  {
    code: 'Decreto Legislativo N.º 1412',
    title: 'Ley de Gobierno Digital',
    issuer: 'PCM',
    subject: 'Gobierno Digital',
    aliases: 'DL 1412|D.L. N.º 1412|Decreto Legislativo 1412|Ley de Gobierno Digital',
  },
  {
    code: 'Directiva N.º 002-2024-PCM/SGTD',
    title: 'Directiva que regula el uso de la firma digital en las entidades públicas',
    issuer: 'PCM / SGTD',
    subject: 'Firma digital',
    aliases: 'Directiva 002-2024-PCM/SGTD|Directiva 002-2024-PCM-SGTD',
  },
  {
    code: 'Directiva N.º 001-2026-PCM/SGTD',
    title:
      'Directiva que regula el servicio de correo electrónico institucional en las entidades públicas',
    issuer: 'PCM / SGTD',
    subject: 'Gobierno Digital',
    aliases: 'Directiva 001-2026-PCM/SGTD|Directiva 001-2026-PCM-SGTD',
  },
] as const;
