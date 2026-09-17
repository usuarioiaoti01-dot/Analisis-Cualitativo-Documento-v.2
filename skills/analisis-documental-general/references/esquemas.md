# Esquemas de salida e integración con el SACD

Las claves de estos esquemas son contrato con el módulo `sacd-analisis`. Renombrar
una clave, aunque sea para que lea mejor, rompe la ingesta del resultado.

## Índice

1. [Esquema de salida de evaluación](#1-esquema-de-salida-de-evaluación)
2. [Vocabularios controlados](#2-vocabularios-controlados)
3. [Esquema de rúbrica propuesta](#3-esquema-de-rúbrica-propuesta-modo-e3ae3b)
4. [Reglas de agregación](#4-reglas-de-agregación)
5. [Puntos de integración con el SACD](#5-puntos-de-integración-con-el-sacd)

---

## 1. Esquema de salida de evaluación

Objeto raíz con tres bloques: `documento`, `metricas` y `resultados`.

```json
{
  "documento": {
    "documento_id": "DOC-2026-0147",
    "nombre": "Informe N° 0142-2026-SERFOR-OTI",
    "tipo_documental": "informe_tecnico",
    "unidad_organica_emisora": "Oficina de Tecnologías de la Información",
    "destinatario_declarado": "Gerencia General",
    "destinatario_inferido": false,
    "perfil": {
      "destinatario": "interno",
      "funcion": "sustenta",
      "origen": "preajuste",
      "justificacion": "Informe que funda la decisión de la Gerencia General; destinatario es otra unidad orgánica del SERFOR."
    },
    "dimension": "D4_claridad",
    "rubrica_id": "RUB-D4-INFORME-001",
    "rubrica_version": 1,
    "estandar_base": "ISO 24495-1:2023",
    "evaluado_en": "2026-09-16T10:22:00-05:00"
  },

  "metricas": {
    "palabras": 1284,
    "oraciones": 47,
    "parrafos": 19,
    "palabras_por_oracion": 27.3,
    "oracion_mas_larga": 111,
    "oraciones_por_parrafo": 2.5,
    "szigriszt_pazos": 35.6,
    "escala_inflesz": "muy difícil",
    "fernandez_huerta": 64.8,
    "densidad_pasiva": 41.2,
    "densidad_subordinacion": 1.44,
    "densidad_nominalizacion": 7.3,
    "conectores_distintos": 3,
    "siglas_sin_desarrollar": ["PIDE", "SGTD", "SNIFFS"],
    "umbrales_aplicados": "interno/sustenta",
    "herramienta": "metricas_claridad.py"
  },

  "resultados": [
    {
      "criterio_id": "D4-07",
      "criterio_enunciado": "Las obligaciones, magnitudes y condiciones se concretan.",
      "principio_iso": "relevante",
      "veredicto": "NC",
      "criticidad": "alta",
      "hallazgo": "El documento condiciona la implementación a trámites y plazos que no concreta: emplea fórmulas indeterminadas en los pasajes que fijan obligación.",
      "evidencia": [
        {
          "cita": "el mismo que deberá ser tramitado ante la SGTD según corresponda",
          "ubicacion": { "seccion": "III. Análisis", "parrafo": 2, "pagina": 3 },
          "verificacion_literal": true
        },
        {
          "cita": "El presupuesto será estimado en su momento, de ser necesario.",
          "ubicacion": { "seccion": "III. Análisis", "parrafo": 3, "pagina": 3 },
          "verificacion_literal": true
        }
      ],
      "fundamento": "ISO 24495-1 exige que el lector pueda usar lo que entiende. Ambos pasajes fijan una obligación sin responsable, plazo ni condición determinable, por lo que trasladan al área usuaria la decisión que el informe debía adoptar.",
      "recomendacion": "Sustituir por: 'la OTI tramitará el convenio de interoperabilidad ante la SGTD dentro de los quince (15) días hábiles siguientes a la aprobación del presente informe' y consignar el monto estimado o la fecha en que se emitirá la estimación.",
      "reescritura": {
        "original": "El presupuesto será estimado en su momento, de ser necesario.",
        "propuesta": "La OTI remitirá la estimación presupuestal a la Oficina General de Administración el 30 de octubre de 2026.",
        "nota": "La fecha es un marcador: el área usuaria debe fijarla, no puede derivarse del texto."
      },
      "confianza": 0.91,
      "escala_revision_humana": true,
      "motivo_escalamiento": "NC de criticidad alta",
      "revision_humana": "pendiente"
    }
  ],

  "consolidado_dimension": {
    "dimension": "D4_claridad",
    "resultado": "No cumple",
    "regla_aplicada": "Existe al menos un criterio NC de criticidad Alta",
    "conteo": { "C": 3, "CP": 4, "NC": 2, "NA": 1, "NE": 0 },
    "criterios_escalados": ["D4-07", "D4-08"],
    "cobertura_evidencia": 1.0
  }
}
```

**Campos obligatorios en todo resultado con veredicto C, CP o NC:** al menos un
elemento en `evidencia` con `verificacion_literal: true`. Sin él, el veredicto que
se persiste es `NE` (regla 8.3.1 del procedimiento y criterio de aceptación CA-04).

**`reescritura` es opcional** y se incluye en hallazgos de criticidad Alta o Media
cuando el pasaje admite corrección sin decidir algo que corresponde al área usuaria.
Cuando la propuesta contiene un dato que el documento no provee, decláralo en
`nota` en lugar de presentarlo como corrección lista.

---

## 2. Vocabularios controlados

| Campo | Valores admitidos |
|---|---|
| `veredicto` | `C` · `CP` · `NC` · `NA` · `NE` |
| `criticidad` | `alta` · `media` · `baja` |
| `principio_iso` | `encuentra` · `entiende` · `usa` · `relevante` |
| `tipo_documental` | **Vocabulario abierto.** Identificador en minúsculas con guion bajo. Valores frecuentes: `informe_tecnico` · `informe_legal` · `opinion_tecnica` · `memorando` · `oficio` · `carta` · `notificacion` · `resolucion_directoral` · `directiva` · `lineamiento` · `protocolo` · `acta_supervision` · `acta_reunion` · `constancia` · `certificado` · `convenio` · `tdr` · `eett` · `plan_manejo_forestal` · `titulo_habilitante`. Si el tipo no figura, acuña el identificador y decláralo; el perfil es lo que gobierna la evaluación |
| `perfil.destinatario` | `ciudadano` · `externo` · `interno` |
| `perfil.funcion` | `decide` · `regula` · `sustenta` · `informa` · `registra` |
| `perfil.origen` | `preajuste` (tipo con preajuste en la rúbrica) · `derivado` (perfil deducido de los dos ejes) · `declarado` (lo fijó el usuario o la rúbrica aprobada) |
| `dimension` | `D4_claridad` (fijo en esta skill) |
| `revision_humana` | `pendiente` · `concordante` · `discrepante` · `no_requerida` |
| `escala_revision_humana` | booleano |
| `confianza` | número de 0 a 1, dos decimales |

`escala_revision_humana` es `true` cuando: el veredicto es `NE`, o es `NC` con
criticidad `alta`, o `confianza` es menor que 0,70. Declara el disparador en
`motivo_escalamiento`.

---

## 3. Esquema de rúbrica propuesta (modo E3A/E3B)

```json
{
  "rubrica_id": "RUB-D4-NOTIFICACION-001",
  "version": 1,
  "tipo_documental": "notificacion",
  "perfil": {
    "destinatario": "ciudadano",
    "funcion": "decide",
    "origen": "preajuste",
    "justificacion": "Notificación dirigida a un administrado que produce efectos sobre su esfera jurídica."
  },
  "dimension": "D4_claridad",
  "modalidad": "B",
  "estado": "borrador",
  "estandar_base": "ISO 24495-1:2023",
  "propuesta_por": "analisis-documental-general",
  "aprobada_por": null,
  "fecha_aprobacion": null,
  "umbrales": {
    "szigriszt_minimo": 60,
    "palabras_por_oracion_maximo": 20,
    "oracion_mas_larga_maximo": 35,
    "densidad_pasiva_maxima": 15
  },
  "criterios": [
    {
      "id": "D4-08",
      "dimension": "D4_claridad",
      "principio_iso": "usa",
      "enunciado": "La notificación indica qué debe hacer el destinatario, ante quién, en qué plazo computable y con qué consecuencia si no actúa.",
      "criticidad": "alta",
      "aplicabilidad": "siempre",
      "fuente": "ISO 24495-1:2023, principio 'usable'; TUO de la Ley N° 27444, debido procedimiento",
      "guia_evaluacion": {
        "cumple": "Los cuatro elementos están presentes y el plazo precisa si los días son hábiles o calendario y desde cuándo se cuentan.",
        "cumple_parcial": "La actuación se indica pero falta el plazo computable, el canal o la consecuencia.",
        "no_cumple": "No es posible determinar qué hacer, o el plazo carece de naturaleza o de hito de inicio."
      }
    }
  ]
}
```

**`estado` nace siempre en `borrador`.** La aprobación es un acto del Director
General en la etapa E4; el SACD rechaza toda rúbrica que llegue marcada de otro
modo, y el requisito RF-206 impide ejecutar análisis con rúbrica no aprobada.

---

## 4. Reglas de agregación

Por dimensión —regla cualitativa, no promedio:

| Resultado | Condición |
|---|---|
| **No cumple** | Al menos un criterio NC de criticidad Alta, o el 40 % o más de los criterios aplicables en NC |
| **Cumple parcialmente** | Al menos un CP o NC, ninguno de criticidad Alta |
| **Cumple** | Todos los criterios aplicables en C, o en NA justificado |

Los criterios **NE no cuentan como cumplimiento** y bloquean el resultado "Cumple"
hasta que se resuelvan en revisión humana.

D4 es una de las cinco dimensiones que alimentan el dictamen global del SACD. Esta
skill **no emite dictamen global**: lo calcula el módulo de consolidación con las
cinco dimensiones a la vista.

---

## 5. Puntos de integración con el SACD

| Elemento del SACD | Correspondencia |
|---|---|
| `resultado_criterio` (modelo de datos) | Un registro por objeto de `resultados` |
| `evidencia` (modelo de datos) | Un registro por elemento de `evidencia`; `documento_segmento_id` se resuelve con la ubicación |
| Etapa E5 — Evaluación | Sección 3 del procedimiento de la skill |
| Etapa E6 — Verificación de evidencia | La verifica el SACD por coincidencia literal; la skill debe entregar la cita sin alterar |
| RF-503 / RF-507 — un criterio por invocación | Evaluar un criterio a la vez |
| RF-508 — escalamiento | `escala_revision_humana` |
| RF-511 — reproducibilidad | `metricas.herramienta` y `rubrica_version` se persisten con el resultado |
| M9 — documento comentado | `reescritura` alimenta el comentario anclado; formato del comentario en RF-904 |
| RF-1106 — plantillas versionadas | Esta skill es la especificación de la que derivan las plantillas de `sacd-ia/resources/prompts`; el cambio de la skill obliga a versionar la plantilla |

**Normalización compartida.** La comparación literal de citas normaliza espacios,
saltos de línea y guiones. El script de métricas usa la misma normalización. Si se
modifica en un lado, debe modificarse en el otro, o citas válidas empezarán a
descartarse en E6.
