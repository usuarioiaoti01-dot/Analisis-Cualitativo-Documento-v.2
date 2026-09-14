# Proceso de evaluación cualitativa documental

Este documento fija el proceso que implementa el sistema y el estado de cada
etapa. Es la referencia para saber qué está construido y qué no.

## Las siete etapas

| Etapa | Qué realiza | Estado |
|---|---|---|
| 1. Registro del documento | Carga el documento, identifica tipo documental, fecha y versión. | 🟡 Parcial — faltan autor, unidad responsable, fecha propia del documento, versionado y carga múltiple |
| 2. Definición de matriz de criterios | El evaluador selecciona o configura criterios, pesos, escalas y reglas. | 🟢 Operativo — cinco matrices precargadas, escala 1–5, indicadores por criterio |
| 3. Extracción y estructuración | Obtiene texto y lo segmenta en secciones numeradas. | 🟡 Parcial — texto y secciones sí; faltan tablas, citas, fechas, responsables y anexos como entidades propias |
| 4. Evaluación cualitativa | Analiza el contenido contra cada criterio. | 🔴 Motor provisional — la estructura de resultados existe, pero el motor **no lee el documento** |
| 5. Validación legal y normativa | Contrasta citas contra el catálogo normativo. | 🟢 Operativa — reconoce las citas, las verifica y emite hallazgos con evidencia |
| 6. Comparación con repositorio | Busca similitudes y versiones previas. | 🟢 Operativa — Jaccard y contención sobre shingles, con fragmentos coincidentes |
| 7. Informe y decisión | Consolida, permite validación humana y emite el informe. | 🔴 No implementada — el esquema ya prevé `validated_by` y el estado de cada hallazgo |

## Las cinco dimensiones

Comunes a todas las matrices, con su peso de referencia:

| Dimensión | Peso |
|---|---:|
| Contenido | 30% |
| Estructura | 20% |
| Base legal | 25% |
| Evidencia y fuentes | 15% |
| Coincidencias con repositorio | 10% |

Lo que cambia entre tipos documentales son los criterios dentro de cada
dimensión y cómo se reparte el peso entre ellos. En toda matriz la suma de las
ponderaciones es exactamente 100; la API lo rechaza con 422 si no lo es.

## Escala

Cada criterio se puntúa de 1 a 5 (`criteria.scale_max`, configurable):

| Valor | Etiqueta | Significado |
|---:|---|---|
| 1 | Ausente | El criterio no se aborda en el documento |
| 2 | Insuficiente | Se menciona, pero sin desarrollo ni sustento |
| 3 | Aceptable | Se cumple lo mínimo; quedan vacíos relevantes |
| 4 | Satisfactorio | Se cumple con sustento; observaciones menores |
| 5 | Óptimo | Se cumple íntegramente y con evidencia verificable |

El aporte de un criterio al puntaje final es `(puntaje / escala) × peso`. El
resultado cualitativo se deriva de la proporción: ≥ 90% cumple, ≥ 60% cumple
parcialmente, por debajo no cumple.

## Matrices precargadas

Se instalan en la primera ejecución, definidas en `src/lib/rubric.ts`:

| Matriz | Tipo documental | Criterios |
|---|---|---:|
| Matriz general de calidad documental | Cualquiera | 5 |
| Matriz de informe técnico | Informe técnico | 10 |
| Matriz de TDR y especificaciones técnicas | TDR | 10 |
| Matriz de oficio y memorando | Oficio | 8 |
| Matriz de proyecto normativo y directiva | Proyecto normativo | 10 |

## Estructura de un hallazgo

La tabla `findings` recoge los ocho elementos del proceso. Las etapas 5 y 6 ya
escriben hallazgos; la etapa 4 todavía no.

| Campo | Columna |
|---|---|
| Criterio evaluado | `criterion_id`, `dimension` |
| Resultado | `result` — cumple / parcial / no cumple / no aplica |
| Puntaje | en `evaluation_results.raw_score` |
| Evidencia textual exacta | `evidence_text` |
| Ubicación | `evidence_location`, `section_id` |
| Riesgo | `risk` — bajo / medio / alto / crítico |
| Recomendación | `recommendation` |
| Documento o norma de contraste | `reference_kind`, `reference_id`, `reference_label` |
| Estado de atención | `status`, `resolved_by`, `resolved_at` |

`source` distingue de dónde nació el hallazgo: `evaluacion` (etapa 4),
`normativa` (etapa 5) o `similitud` (etapa 6).

## Etapa 5 — validación legal y normativa

`POST /api/documents/[id]/contraste` reconoce las citas normativas del texto por
coincidencia de patrones y las contrasta contra el catálogo. **No usa modelos de
lenguaje**: corre entera dentro del perímetro de la entidad.

El reconocimiento separa el tipo del número y normaliza ambos, de modo que
«Ley N° 29763», «Ley N.º 29763» y «Ley 29763» se resuelvan a la misma norma.
Cubre leyes, decretos supremos, decretos legislativos, decretos de urgencia,
resoluciones (ministeriales, de secretaría general, directorales, jefaturales,
ejecutivas) y directivas, con las abreviaturas de uso corriente. El campo
`norms.aliases` recoge formas alternativas de citar una misma norma.

Dos detalles que el texto de un PDF impone: las citas se parten entre renglones
(«Ley» al final de uno y «N° 30225» al comienzo del siguiente) y los
correlativos se cortan con guion («004-2019-» / «JUS»). La búsqueda se hace
sobre una copia con los saltos convertidos en espacios —sustitución carácter por
carácter, así los índices siguen valiendo sobre el original— y el patrón del
número tolera un espacio tras el guion.

Hallazgos que emite:

| Situación | Riesgo | Por qué |
|---|---|---|
| La norma citada no figura en el catálogo | Bajo | Lo más probable es que falte incorporarla, no que la cita sea errónea |
| La norma citada no figura como vigente | Alto | El sustento legal puede haber decaído |

Una norma citada veinte veces produce un hallazgo, no veinte; el mensaje indica
cuántas veces aparece.

## Etapa 6 — comparación con el repositorio

Usa *shingling*: el texto se corta en secuencias solapadas de cinco palabras y se
comparan los conjuntos resultantes. Tampoco usa modelos de lenguaje.

Se calculan **dos** medidas, y basta con que una supere su umbral:

| Medida | Fórmula | Umbral | Qué detecta |
|---|---|---:|---|
| Jaccard | intersección / unión | 0.15 | Documentos gemelos y versiones del mismo texto |
| Contención | intersección / conjunto menor | 0.30 | Reutilización parcial |

La contención es indispensable. El Jaccard penaliza la diferencia de tamaño: un
TDR breve reproducido dentro de un documento extenso da un índice bajísimo
aunque esté copiado entero. En la prueba real, un documento con 6 000 caracteres
tomados de una directiva de 50 páginas dio **Jaccard 0.07 y contención 0.96**: el
Jaccard por sí solo lo habría descartado.

La coincidencia se clasifica como versión previa (títulos parecidos y Jaccard
alto), similitud inusual o reutilización. El hallazgo incluye los fragmentos
textuales compartidos más largos como evidencia.

El resumen informa **todas** las comparaciones con sus dos índices, no solo las
que superan el umbral: saber que un documento se comparó y quedó en 2% es tan
útil como el aviso.

## Sobre el motor provisional

`POST /api/evaluations` deriva un puntaje determinista del identificador del
documento y del criterio. **No analiza el contenido.** Existe para que el flujo
completo quede ejercitado y verificable mientras se construye el motor real.

Cada evaluación queda marcada con `engine = 'deterministic'` y la interfaz lo
advierte de forma visible. Por la misma razón **no emite hallazgos**: un hallazgo
con evidencia inventada sería peor que ninguno.

## Entidades

| Entidad del proceso | Tabla |
|---|---|
| `documentos` | `documents` |
| `repositorio_contenido` | `document_contents` + `document_sections` |
| `matrices_evaluacion` | `templates` + `criteria` |
| `evaluaciones` | `evaluations` + `evaluation_results` |
| `hallazgos` | `findings` |
| `referencias_legales` | `norms` |
| `similitudes_documentales` | `document_similarities` |

## Decisión sobre el perímetro

La etapa 4 requiere un modelo de lenguaje, lo que implica que el texto del
documento sale del perímetro de la entidad hacia la API del proveedor. El 13 de
septiembre de 2026 se decidió permitirlo **sin restricción**, sin marca de
documento reservado.

Si esa decisión cambia, el punto de intervención es único: la ruta
`POST /api/evaluations`. Las etapas 5 y 6 no usan modelos de lenguaje y no se
verían afectadas.

## La decisión final es humana

El sistema detecta evidencias, inconsistencias, citas incompletas y similitudes.
La interpretación y la aprobación corresponden al responsable técnico o legal. El
esquema lo refleja: `evaluations.validated_by` y `findings.status` registran
quién validó y qué se hizo con cada hallazgo. Un puntaje automático no sustituye
al criterio administrativo.
