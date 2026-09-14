# Análisis Cualitativo Documental — Dirección de Políticas del SERFOR

**v.2 · SERFOR — Oficina de Tecnologías de la Información**

Aplicación web que evalúa documentos institucionales (informes técnicos, TDR,
proyectos normativos) contra una matriz de criterios ponderados, y los contrasta
con el catálogo normativo de la entidad.

La interfaz se publica con el nombre **DocuCalidad**.

## El proceso

El sistema implementa un proceso de siete etapas —registro, matriz de criterios,
extracción, evaluación cualitativa, validación normativa, comparación con el
repositorio e informe— sobre cinco dimensiones ponderadas y una escala de 1 a 5.
Qué está construido y qué no, etapa por etapa, está en
[`docs/proceso-de-evaluacion.md`](docs/proceso-de-evaluacion.md).

**Estado actual:** las etapas 1 a 3, 5 y 6 funcionan; la 4 tiene un motor
provisional que no analiza el contenido; la 7 no está implementada.

## Origen

Esta versión reproduce el front y el back del prototipo publicado en
`evaluador-cualitativo-documental.serfor-oti-7899.chatgpt.site`, reconstruidos
como código fuente propio y auditable. El detalle de qué se copió tal cual, qué
se completó y qué falta está en
[`docs/comparacion-con-el-original.md`](docs/comparacion-con-el-original.md).

## Cómo levantarlo

Requiere **Node 22.5 o superior** (usa el SQLite integrado de Node, `node:sqlite`;
no hay dependencias nativas que compilar).

```bash
npm install
npm run dev
```

La aplicación queda en <http://localhost:3000>. La base SQLite se crea sola en
`data/docucalidad.db` con la matriz de criterios por omisión ya cargada.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm start` | Sirve la compilación de producción |
| `npm run typecheck` | Verificación de tipos sin emitir |

## Módulos

| Sección | Estado |
|---|---|
| **Resumen** | Panel de indicadores, calidad por dimensión y bandeja de hallazgos. Los valores son de demostración (ver `src/lib/demo.ts`). |
| **Documentos** | Repositorio documental persistido. Carga real de archivos (PDF, DOCX, XLSX) con extracción de texto, listado y vista de detalle con el contenido extraído. |
| **Evaluaciones** | Cinco matrices precargadas por tipo documental, con escala 1–5 e indicadores. Ejecuta evaluaciones y guarda el resultado de cada criterio. El motor es provisional: no analiza el contenido. |
| **Catálogo normativo** | Catálogo persistido, con carga de las 10 referencias prioritarias del inventario interno. Es lo que sustenta la validación de citas. |
| **Usuarios y roles** | Marcador; sin implementación. |
| **Configuración** | Marcador; sin implementación. |

## API

Todas las rutas responden JSON.

| Método y ruta | Descripción |
|---|---|
| `GET /api/documents` | Lista el repositorio documental. |
| `POST /api/documents` | Registra un documento. Con `multipart/form-data` (`file`, `document_type`) guarda el archivo y extrae su texto; con JSON (`{ title, document_type }`) registra solo la ficha. |
| `GET /api/documents/[id]` | Ficha del documento con sus secciones, evaluaciones, resultados por criterio y hallazgos. |
| `GET /api/documents/[id]/texto` | Texto extraído completo, aparte para no cargarlo en cada apertura de la ficha. |
| `DELETE /api/documents/[id]` | Elimina el documento, su texto y el archivo original. |
| `GET /api/documents/[id]/archivo` | Devuelve el archivo original tal como se cargó. |
| `POST /api/documents/[id]/contraste` | Ejecuta las etapas 5 y 6 y emite hallazgos. Cuerpo opcional: `{ etapas: ['normativa', 'similitud'] }`. |
| `GET /api/evaluations` | Documentos evaluables y matrices con sus criterios. |
| `POST /api/evaluations` | Ejecuta una evaluación. Cuerpo: `{ document_id, template_id }`. |
| `POST /api/evaluations/templates` | Crea una matriz. Cuerpo: `{ name, document_type, criteria[] }`. Rechaza con 422 si las ponderaciones no suman 100. |
| `GET /api/catalog` | Normas del catálogo. |
| `POST /api/catalog` | Incorpora las referencias prioritarias del inventario interno. |

### Cálculo del puntaje

`POST /api/evaluations` **no analiza el contenido del documento**. Puntúa cada
criterio de forma determinista a partir del identificador del documento y del
criterio, de modo que el flujo completo —ejecutar, guardar el resultado de cada
criterio, actualizar el estado del documento— quede ejercitado y verificable
mientras se construye el motor real.

Cada evaluación se marca con `engine = 'deterministic'`, la interfaz lo advierte,
y por la misma razón el motor **no emite hallazgos**: un hallazgo con evidencia
inventada sería peor que ninguno.

El aporte de un criterio es `(puntaje / escala) × peso`. El umbral de estados:

| Puntaje | Severidad | Estado |
|---|---|---|
| ≥ 85 | Bajo | Conforme |
| 75 – 84 | Medio | En revisión |
| < 75 | Alto | Observado |

Sustituir `puntajeDeterminista` en `src/app/api/evaluations/route.ts` por el
motor real es el siguiente paso; el resto del flujo no necesita cambios.

## Carga y extracción de texto

El cargador acepta **PDF, DOCX y XLSX** hasta 25 MB. Al subir un archivo:

1. El binario se guarda en `data/uploads/<id>.<ext>` (configurable con `SACD_UPLOAD_DIR`).
2. Se extrae el texto en el mismo proceso, sin servicios externos ni binarios que compilar:
   `unpdf` para PDF, `mammoth` para DOCX y `xlsx` para hojas de cálculo.
3. El texto se persiste en `document_contents` y el documento registra páginas,
   caracteres y el resultado de la extracción.

La extracción nunca impide el registro: si falla, el documento queda guardado con
el motivo anotado en `extraction_notes` y visible en la vista de detalle. Los
estados posibles son `ok`, `empty` (PDF escaneado, sin texto seleccionable),
`failed` y `none` (ficha registrada sin archivo).

**Los PDF escaneados todavía no se procesan**: falta OCR. El documento se marca
como «Sin texto legible» con el aviso correspondiente.

## Estructura

```
src/
  app/
    api/
      documents/route.ts              GET, POST (carga de archivo)
      documents/[id]/route.ts         GET, DELETE
      documents/[id]/texto/route.ts   GET (texto extraído completo)
      documents/[id]/contraste/route.ts POST (etapas 5 y 6)
      documents/[id]/archivo/route.ts GET (archivo original)
      evaluations/route.ts            GET, POST (ejecutar evaluación)
      evaluations/templates/route.ts  POST (crear matriz)
      catalog/route.ts                GET, POST
    layout.tsx  globals.css  page.tsx
  components/                         Vistas y modales
  lib/
    db.ts       Conexión, esquema y migraciones SQLite
    almacen.ts  Guardado y lectura de los archivos originales
    extraccion.ts  Extracción de texto de PDF, DOCX y XLSX
    segmentacion.ts Corte del texto en secciones numeradas
    citas.ts    Reconocimiento de citas normativas (etapa 5)
    similitud.ts Shingling, Jaccard y contención (etapa 6)
    sqlite.ts   Ayudas tipadas y transacciones
    seed.ts     Carga inicial idempotente
    rubric.ts   Matrices por tipo documental, escala y normas prioritarias
    demo.ts     Datos de demostración del panel de resumen
    types.ts    Tipos compartidos
    sections.ts Secciones del espacio de trabajo
```

## Base de datos

SQLite, archivo único. La ruta se configura con `SACD_DB_PATH` (ver
`.env.example`). El esquema se crea al primer arranque e incluye `documents`,
`document_contents`, `document_sections`, `templates`, `criteria`, `evaluations`,
`evaluation_results`, `findings`, `norms` y `document_similarities`.
Las bases creadas con versiones anteriores del esquema se actualizan solas al
arrancar, sin perder datos.

El directorio `data/` —base y archivos cargados— está excluido del control de versiones.

## Pendientes conocidos

- **Etapa 4** — motor de análisis real: evaluar el texto extraído contra cada
  criterio y emitir hallazgos con evidencia citada. Hoy el puntaje es
  determinista, no analítico.
- **Etapa 7** — informe consolidado, validación humana de cada hallazgo y
  exportación.
- Verificación del artículo citado dentro de una norma: hoy se valida la norma,
  no el artículo. Requiere incorporar el texto de las normas al catálogo.
- Metadatos de la etapa 1: autor, unidad responsable, fecha propia del documento,
  versionado y carga múltiple.
- OCR para PDF escaneados. Hoy esos documentos se marcan «Sin texto legible».
- Autenticación y autorización. La sesión de la barra lateral es fija.
- Los módulos «Usuarios y roles» y «Configuración» son marcadores.
- El panel de resumen usa datos de demostración, no consultas a la base.
