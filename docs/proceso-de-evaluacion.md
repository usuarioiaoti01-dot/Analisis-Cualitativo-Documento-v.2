# Proceso de evaluación cualitativa documental

Este documento fija el proceso que implementa el sistema y el estado de cada
etapa. Es la referencia para saber qué está construido y qué no.

## Las siete etapas

| Etapa | Qué realiza | Estado |
|---|---|---|
| 1. Registro del documento | Carga el documento, identifica tipo documental, fecha y versión. | 🟡 Parcial — faltan autor, unidad responsable, fecha propia del documento, versionado y carga múltiple |
| 2. Definición de matriz de criterios | El evaluador selecciona o configura criterios, pesos, escalas y reglas. | 🟢 Operativo — cinco matrices precargadas, escala 1–5, indicadores por criterio |
| 3. Extracción y estructuración | Obtiene texto y lo segmenta en secciones jerárquicas. | 🟡 Parcial — texto y secciones con sus numerales anidados; faltan tablas, fechas, responsables y anexos como entidades propias |
| 4. Evaluación cualitativa | Analiza el contenido contra cada criterio. | 🟢 Operativa — motor con IA que lee el documento y emite hallazgos con evidencia verificada; el provisional se conserva como alternativa |
| 5. Validación legal y normativa | Contrasta citas contra el catálogo normativo. | 🟢 Operativa — reconoce las citas, las verifica y emite hallazgos con evidencia |
| 6. Comparación con repositorio | Busca similitudes y versiones previas. | 🟢 Operativa — Jaccard y contención sobre shingles, con fragmentos coincidentes |
| 7. Informe y decisión | Consolida, permite validación humana y emite el informe. | 🟢 Operativa — decisión por hallazgo, validación de la evaluación e informe imprimible |

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

La tabla `findings` recoge los ocho elementos del proceso. Las tres etapas que
producen hallazgos —4, 5 y 6— escriben en ella con la misma forma.

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

### Jerarquía de secciones

Las secciones se anidan por su numeración: los romanos, los artículos y los
títulos sin numerar son de primer nivel, «4.2» cuelga de «IV» y «4.2.1» de
«4.2». Sin eso el índice de una directiva de 50 páginas es un listado plano de
cientos de entradas que no sirve para navegar.

Un encabezado no empieza en minúscula. Esa sola regla descarta las menciones
dentro de una frase —«Artículo 11 de la LCE», «4.2 de la presente directiva»—
que el corte de renglón del PDF deja al inicio de la línea y que antes se
tomaban por títulos.

Queda ruido inevitable en documentos con muchas tablas y formularios: las filas
de una tabla en mayúsculas se parecen a un título. Resolverlo requiere
reconocer tablas en la extracción, que es un trabajo aparte.

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

## Etapa 4 — evaluación cualitativa

`POST /api/evaluations` con `engine: 'ai'` envía el texto íntegro del documento y
la matriz a la API de Anthropic, y obtiene un resultado por criterio con sus
hallazgos. Es la única etapa que saca el texto del perímetro de la entidad.

**Modelo:** `claude-opus-5` (configurable con `SACD_MODELO`), con razonamiento
adaptativo y salida estructurada por esquema JSON, de modo que la respuesta trae
siempre un resultado por cada `criterio_id` solicitado. El documento viaja en el
bloque de sistema **con caché**: reevaluarlo con otra matriz no vuelve a pagar el
documento entero.

### La regla que sostiene todo: la evidencia se verifica

Un hallazgo vale por su evidencia. Si la cita que lo acompaña no está en el
documento, el hallazgo no sustenta nada, y un revisor que verifica una cita
inexistente pierde la confianza en el informe completo.

Por eso **toda cita se busca literalmente en el documento antes de guardarse**
(`src/lib/evidencia.ts`). La búsqueda tolera diferencias de espaciado —un PDF
parte las palabras entre renglones— y de comillas tipográficas, pero **no de
contenido**: si el motor cambió una palabra, la cita no coincide.

La cita que no aparece **se descarta junto con su hallazgo**, y la respuesta
informa cuántos se descartaron en `resumen.citas_descartadas`. Ese contador es
además un indicador de calidad de la corrida: si sube, algo va mal en las
instrucciones o en el texto extraído.

Lo que se guarda es el texto **del documento**, no el que devolvió el motor, y la
ubicación se resuelve contra las secciones de la etapa 3.

### Otras decisiones

- Un criterio `no_aplica` sale del denominador del puntaje: castigar al documento
  por un criterio que el propio análisis declara inaplicable distorsionaría el
  resultado.
- Un puntaje fuera de la escala del criterio se recorta al rango válido.
- El documento no se trunca nunca en silencio. Si excede `SACD_MAX_TOKENS_ENTRADA`
  la ruta responde 413 explicando el límite.
- Los hallazgos de evaluación se reemplazan en cada corrida; los de las etapas 5
  y 6 no se tocan.

### El motor provisional sigue disponible

Con `engine: 'deterministic'` el puntaje se deriva del identificador del documento
y del criterio, sin leer el contenido. Se conserva para ejercitar el flujo sin
consumir la API y como alternativa cuando no hay credencial configurada. No emite
hallazgos, por la misma razón de siempre: un hallazgo sin evidencia real sería
peor que ninguno.

`GET /api/evaluations` informa en `motor.ia_disponible` si el servidor tiene
credencial; la interfaz deshabilita el motor con IA y lo advierte cuando no la
hay.

## Etapa 7 — informe y decisión

El sistema detecta; una persona decide. Esta etapa es la que convierte un
análisis en un acto administrativo con responsable.

### Decisión sobre cada hallazgo

`PATCH /api/findings/[id]` con `status`: `aceptado`, `descartado`, `subsanado` o
`pendiente`. Se registra quién decidió y cuándo. Volver a «pendiente» limpia la
firma, para que no quede como resuelto algo que se reabrió.

### Validación de la evaluación

`POST /api/evaluations/[id]/validar` cierra el ciclo: registra validador, fecha
y una nota opcional, y el documento pasa a «Conforme».

**No se puede validar con hallazgos pendientes.** Si quedan observaciones sin
decidir, la conformidad no tendría sustento; la ruta responde 409 diciendo
cuántas faltan. Tampoco se puede validar dos veces.

### Informe

`GET /api/documents/[id]/informe` consolida documento, evaluación, resultado por
criterio, hallazgos con su decisión y coincidencias del repositorio. La página
`/informe/[id]` lo presenta sin la barra lateral ni los controles de la
aplicación, con estilos de impresión, para guardarlo como PDF y adjuntarlo al
expediente. Si la evaluación se hizo con el motor provisional, el informe lo
advierte en su cuerpo: un informe que no dice cómo se calculó su puntaje induce
a error.

### Quién firma

Mientras no haya autenticación, la identidad sale de `src/lib/sesion.ts`, en un
único punto. **La trazabilidad es nominal, no verificada**: registra un nombre,
no prueba quién lo escribió. Incorporar el inicio de sesión es sustituir ese
módulo.

## Matrices: modificación y eliminación

Una matriz que ya se usó no puede tratarse como un borrador.

- **Modificar** (`PUT /api/evaluations/templates/[id]`): los criterios con `id`
  se actualizan, los nuevos se crean y los que desaparecen se retiran. Un
  criterio retirado **que ya fue calificado se archiva, no se borra**: borrarlo
  dejaría sin explicación los resultados y hallazgos que lo citan. Los
  archivados no se ofrecen en evaluaciones nuevas, pero siguen apareciendo en
  las evaluaciones históricas.
- **Eliminar** (`DELETE /api/evaluations/templates/[id]`): solo si la matriz no
  se usó en ninguna evaluación. Si se usó, responde 409 e indica desactivarla.

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

Si esa decisión cambia, el punto de intervención es único: `src/lib/motor-ia.ts`
es el único módulo que envía texto fuera. Las etapas 5 y 6 son coincidencia de
patrones y comparación de conjuntos: corren enteras dentro del equipo y no se
verían afectadas.

## La decisión final es humana

El sistema detecta evidencias, inconsistencias, citas incompletas y similitudes.
La interpretación y la aprobación corresponden al responsable técnico o legal. El
esquema lo refleja: `evaluations.validated_by` y `findings.status` registran
quién validó y qué se hizo con cada hallazgo. Un puntaje automático no sustituye
al criterio administrativo.
