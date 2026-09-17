---
name: analisis-documental-general
description: Analiza documentos institucionales del SERFOR en su dimensión de claridad (D4), según ISO 24495-1:2023, con veredictos C/CP/NC/NA/NE, evidencia literal citada, métricas de legibilidad, recomendación y reescritura. Sirve a toda unidad orgánica y a todo tipo documental, incluidos los que no figuren en catálogo alguno, porque deriva la exigencia del destinatario y de la función del documento. Úsala siempre que pidan evaluar, revisar, observar o mejorar un informe, memorando, oficio, carta, notificación, resolución, directiva, acta, convenio, opinión legal, plan de manejo, título habilitante, TDR o cualquier otro documento; también para proponer una rúbrica, medir legibilidad, detectar lenguaje vago o burocrático, o generar los resultados D4 del SACD. Actívala aunque no se nombre la norma — basta con "revisar cómo está redactado", "ver si se entiende" o "que el administrado lo entienda". No cubre estructura (D1), contenido (D2), definiciones (D3) ni información expuesta (D5).
---

# Evaluación de claridad documental — ISO 24495-1

## Qué resuelve esta skill

Convierte un juicio que normalmente es impresionista —"este documento no se
entiende"— en un dictamen verificable: cada observación queda anclada a una cita
literal del documento, fundada en un principio de la norma y acompañada de una
recomendación ejecutable.

Eso importa por una razón concreta: en el SERFOR el dictamen de claridad puede
ser cuestionado por el área usuaria o revisado por control. Un veredicto sin cita
no se sostiene; uno con cita y estándar invocado sí. La regla práctica que
gobierna todo lo demás es que **nada se afirma del documento sin señalar dónde lo
dice**.

**Ámbito: todo el SERFOR y todo tipo documental.** Sirve por igual a un informe de
la Oficina de Tecnologías de la Información, a una resolución directoral de una
Dirección de Línea, a un acta de supervisión levantada en campo por una ATFFS o a
una carta dirigida a una comunidad nativa. No depende de que el tipo documental
figure en un catálogo: la exigencia se deriva de quién lee el documento y para qué
sirve, según el perfil que se explica abajo.

Esta skill cubre **únicamente la dimensión D4 (Claridad en la exposición)**. Si el
usuario pide evaluar estructura (D1), contenido (D2), definiciones (D3) o
información expuesta (D5), evalúa D4 y dilo explícitamente: las otras dimensiones
tienen su propio anclaje normativo y su propia rúbrica.

## Los cuatro principios de la norma

ISO 24495-1:2023 define claridad como una propiedad de la relación entre el texto
y su lector, no del texto en abstracto. Un documento es claro cuando su lector
previsto:

1. **Encuentra** lo que necesita — organización, señalización, título informativo
2. **Entiende** lo que encuentra — oración, voz, terminología, hilo argumental
3. **Usa** lo que entiende — sabe qué hacer, quién lo hace, en qué plazo
4. Recibe lo **relevante** — sin relleno, sin repetición, ajustado al destinatario

De ahí se desprende la primera pregunta de toda evaluación, antes que cualquier
métrica: **¿quién es el lector previsto de este documento?** No es el mismo juicio
para un informe técnico dirigido a la Gerencia General que para una notificación
dirigida a un usuario del servicio forestal. El detalle está en
`references/iso-24495-1.md`.

## Procedimiento de evaluación

### 1. Encuadre — el perfil del documento

Identifica el emisor, el destinatario y el acto que el documento persigue. Luego
sitúa el documento en dos ejes, que son los que gobiernan toda la evaluación:

**Eje 1 — ¿quién lee?**
`ciudadano` (administrado, comunidad, usuario del servicio) · `externo`
(otra entidad, proveedor, contraparte) · `interno` (otra unidad del SERFOR)

**Eje 2 — ¿qué hace el documento?**
`decide` (resuelve, ordena, sanciona, autoriza, notifica: produce efectos sobre
alguien) · `regula` (directiva, lineamiento, protocolo: fija reglas para el futuro) ·
`sustenta` (informe, opinión, dictamen: funda la decisión de otro) ·
`informa` (comunica sin exigir actuación) · `registra` (acta, constancia: deja
constancia de un hecho)

De ese par salen la criticidad de cada criterio y los umbrales métricos, según la
tabla de `references/rubrica-d4-serfor.md`. El nombre del tipo documental es solo
un atajo: cuando coincide con un preajuste conocido —informe técnico, memorando,
notificación, oficio, TDR, resolución, directiva, acta, carta— úsalo; cuando no
figure en ninguna lista, deriva el perfil de los dos ejes y sigue adelante. **Un
tipo documental desconocido nunca es motivo para no evaluar.**

Declara siempre el perfil que aplicaste y por qué, porque de él dependen los
veredictos: quien revise el dictamen debe poder discutir el encuadre antes que los
hallazgos.

Si el destinatario no puede inferirse del propio documento, dilo: sin lector
previsto, los criterios de relevancia y adecuación se evalúan como **NE**, no se
adivinan. Ante duda entre dos perfiles, aplica el más exigente y decláralo: es
preferible una observación de más, que el evaluador humano puede levantar en E8,
que un defecto que llega al ciudadano.

### 2. Medición objetiva

Ejecuta el script empaquetado antes de emitir juicio alguno:

```bash
python scripts/metricas_claridad.py <archivo.txt> --perfil <ciudadano|externo|interno> --json
```

El `--perfil` es el eje 1 del encuadre y determina los umbrales que el script reporta
en `umbrales` y `fuera_de_umbral`. Si el destinatario es interno y quiere evitar
falsos positivos de siglas conocidas por el equipo, añada
`--siglas-conocidas SERFOR,OTI,ATFFS`; ante un destinatario ciudadano no lo use,
porque para él ninguna sigla es evidente.

Entrega índices de legibilidad (Szigriszt-Pazos con escala INFLESZ y Fernández
Huerta), longitud de oración y de párrafo, densidad de voz pasiva, subordinación,
nominalización y gerundios, siglas sin desarrollar, expresiones vagas, muletillas
burocráticas, latinismos y los pasajes críticos ya extraídos literalmente.

Úsalo siempre que tengas el texto disponible. Estimar estos valores a ojo produce
números distintos en cada corrida, y el SACD exige que dos ejecuciones del mismo
análisis den el mismo resultado. Los pasajes críticos que devuelve son citas
literales ya verificadas contra el texto: son el material de evidencia preferente.

Si el documento llega en PDF o DOCX, extrae primero el texto plano y conserva la
correspondencia con página y sección, porque la evidencia debe ubicarse.

### 3. Evaluación criterio por criterio

Aplica la rúbrica D4 de `references/rubrica-d4-serfor.md`. Los diez criterios son
los mismos para todo documento —lo que cambia con el perfil es su criticidad y sus
umbrales—, y cada uno trae su guía de cumple / cumple parcialmente / no cumple. Si
el usuario aporta una rúbrica aprobada propia, esa manda sobre la de referencia.

Evalúa **un criterio a la vez**. Evaluarlos en bloque contamina los juicios: un
documento con oraciones largas tiende a arrastrar una calificación baja en
criterios que nada tienen que ver con la longitud.

Por cada criterio produce:

| Campo | Exigencia |
|---|---|
| `veredicto` | C, CP, NC, NA o NE |
| `evidencia` | Al menos una cita **literal**, copiada carácter por carácter, con su ubicación (sección, párrafo, página si se conoce) |
| `hallazgo` | Una frase que describe el defecto observado, no una valoración genérica |
| `fundamento` | Por qué esa evidencia sustenta ese veredicto, invocando el principio ISO o la métrica |
| `recomendacion` | Acción concreta de subsanación, no "mejorar la redacción" |
| `criticidad` | Alta, Media o Baja |
| `confianza` | 0 a 1 |

### 4. Reglas que no admiten excepción

Estas reglas existen porque sin ellas el dictamen deja de ser auditable:

- **Sin cita literal verificada no hay veredicto.** Un criterio para el que no
  encuentres evidencia textual es **NE**, nunca NC. "No encontré prueba" y "probé
  que no cumple" son cosas distintas, y confundirlas es el error que más rápido
  destruye la credibilidad de un dictamen automatizado.
- **No infieras ausencia.** Afirmar que el documento no consigna el plazo, o no
  identifica al responsable, exige haber recorrido el documento completo buscando
  ese dato. Si solo revisaste fragmentos, el veredicto es NE.
- **Cita, no parafrasees.** La cita se compara literalmente contra el texto fuente
  en la etapa E6 del procedimiento; una cita "arreglada" para que lea mejor se
  descarta y arrastra el criterio a NE.
- **Claro no es simple.** La norma no pide eliminar el término técnico ni rebajar
  el rigor jurídico: pide que el término que el lector no pueda resolver se
  explique o se sustituya. Observar "usa terminología técnica" sin más es una
  observación improcedente en un informe técnico.
- **Distingue lo medible de lo interpretable.** La longitud de oración es un dato;
  que el hilo argumental sea seguible es un juicio. Presenta cada cosa como lo que
  es, y no conviertas un umbral rebasado en un defecto si el pasaje, leído, resulta
  claro: la métrica es indicio, no veredicto.
- **Escala a revisión humana** todo criterio NE, todo NC de criticidad Alta y toda
  confianza inferior a 0,70. Márcalo en el resultado; no lo resuelvas por tu cuenta.

### 5. Consolidación de la dimensión

Aplica la regla cualitativa del procedimiento, que no es un promedio:

- **No cumple** — hay al menos un NC de criticidad Alta, o el 40 % o más de los
  criterios aplicables está en NC
- **Cumple parcialmente** — hay algún CP o NC, ninguno de criticidad Alta
- **Cumple** — todos los criterios aplicables en C, o en NA justificado

## Formato de salida

Entrega siempre **dos piezas, en este orden**:

**(a) Resumen ejecutivo** en Markdown, pensado para el especialista que revisa:
resultado de la dimensión, índice de legibilidad con su escala, los tres a cinco
hallazgos de mayor criticidad con su cita, y la cuenta de criterios por veredicto.
Breve: quien necesite el detalle abre el JSON.

**(b) JSON conforme al esquema 8.2** del procedimiento, un objeto por criterio,
dentro de un arreglo `resultados`. El esquema completo, con el bloque `metricas` y
el bloque `reescritura`, está en `references/esquemas.md`. Respétalo al carácter:
lo consume directamente el módulo `sacd-analisis` y una clave renombrada rompe la
ingesta.

Cuando el documento observado tenga pasajes reescribibles, acompaña cada hallazgo
de criticidad Alta o Media con su bloque `reescritura`: el texto original literal y
la versión propuesta. La reescritura conserva el contenido jurídico y las
referencias normativas —no es una simplificación del fondo— y alimenta el
comentario anclado del entregable M9. Cuando un pasaje no pueda reescribirse sin
decidir algo que corresponde al área usuaria (un plazo que el documento no fija,
por ejemplo), dilo en la recomendación en vez de inventar el dato.

## Modo alterno: proponer la rúbrica

Si lo que se pide es la **rúbrica** y no la evaluación —etapas E3A/E3B del
procedimiento—, produce el conjunto de criterios D4 para el tipo documental
indicado, en el esquema 8.1, y **en estado `borrador`**. Ninguna rúbrica que
propongas nace aprobada: la aprobación es un acto del Director General y el SACD
la rechaza si viene marcada de otro modo. Parte de los diez criterios base, deriva
criticidad y umbrales del perfil, redacta cada enunciado en los términos propios de
ese tipo documental y justifica en `fuente` de dónde sale cada uno.

Cuando el tipo documental no tenga preajuste, construye la rúbrica igual: declara el
perfil aplicado en el propio JSON, para que quien la apruebe pueda discutir el
encuadre. Una rúbrica bien derivada de un perfil es más defendible que una copiada
de un tipo parecido.

## Límites que conviene declarar

El dictamen de claridad es **asistencia técnica a la decisión**, no un acto
administrativo. La motivación del acto corresponde al funcionario competente
conforme al TUO de la Ley N° 27444. Los índices de legibilidad son indicadores
construidos para prosa general: en textos con mucha cita normativa castigan la
puntuación legal, y conviene leerlos junto con el texto, no en su lugar. Y la
norma ISO se invoca como buena práctica internacional adoptada, sin afirmar
certificación.

## Archivos de apoyo

| Archivo | Cuándo leerlo |
|---|---|
| `references/iso-24495-1.md` | Para fundamentar un veredicto en el principio exacto de la norma, o ante una observación del área usuaria |
| `references/rubrica-d4-serfor.md` | Siempre que evalúes: trae los diez criterios, sus guías y la criticidad por tipo documental |
| `references/esquemas.md` | Antes de emitir el JSON, y al integrar con el SACD |
| `scripts/metricas_claridad.py` | En toda evaluación con texto disponible |
