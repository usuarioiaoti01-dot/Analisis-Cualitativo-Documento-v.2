# Comparación con el prototipo de origen

Origen: `https://evaluador-cualitativo-documental.serfor-oti-7899.chatgpt.site/`
(acceso mediante inicio de sesión de ChatGPT). Relevamiento: 13 de septiembre de 2026.

## Qué se encontró en el original

El sitio es una aplicación **Next.js compilada**: el código publicado son
paquetes minificados (`_next/static/chunks/…`), no fuente legible. No hay
repositorio ni fuente accesible desde el sitio. Por eso la copia se hizo por
relevamiento funcional —recorriendo cada sección, cada modal y cada llamada de
red— y no por descarga de archivos fuente.

### Front

Una sola página con navegación por estado (no hay rutas por sección: la barra
lateral cambia el contenido sin cambiar la URL). Seis secciones:

| Sección | Contenido observado |
|---|---|
| Resumen | 4 tarjetas de indicadores, lista de documentos recientes con buscador, «Calidad por dimensión» (5 barras), tarjeta «Validación normativa», bandeja «Hallazgos que requieren atención» (3 filas con botón «Revisar»). |
| Documentos | Tabla `Documento / Tipo / Versión / Estado`, con estado de carga «Cargando repositorio…» y botón «Registrar documento». |
| Evaluaciones | Formulario «Ejecutar evaluación» (selector de documento + selector de matriz + botón «Iniciar») y tarjetas de «Matrices de evaluación» con botón «Nueva matriz». |
| Catálogo normativo | Buscador, botón «Cargar normas prioritarias» que incorpora 10 referencias, y lista de normas con etiqueta «Vigente». |
| Usuarios y roles | Marcador: «Este módulo se encuentra preparado para la siguiente configuración del sistema.» |
| Configuración | El mismo marcador. |

Modales:

- **Incorporar documento**: zona de arrastre, «PDF, DOCX o XLSX · hasta 25 MB»,
  selector de tipo documental, botones «Cancelar» / «Iniciar evaluación».
- **Nueva matriz de evaluación**: nombre, tipo documental, tabla de criterios
  (dimensión, criterio, peso, eliminar), «+ Agregar criterio», totalizador
  «Ponderación total» y la regla «La suma de las ponderaciones debe ser 100%».

### Back

Solo **dos rutas de API** respondían:

| Ruta | Respuesta observada |
|---|---|
| `GET /api/documents` | `{ documents: [{ id, title, status, version, created_at, updated_at, document_type }] }` |
| `GET /api/evaluations` | `{ documents: [{ id, title }], templates: [{ id, name }] }` |

Se probaron además `criteria`, `rubrics`, `norms`, `catalog`, `users`, `roles`,
`settings`, `findings`, `summary`, `stats`, `dashboard`, `templates`, `analysis`,
`reports`, `audit`, `upload`, `me`: todas devolvieron 404.

## Qué se copió tal cual

- Toda la interfaz: distribución, jerarquía tipográfica, paleta, iconografía,
  rótulos y textos, en español, incluidos los mensajes de estado y los
  marcadores de los módulos sin implementar.
- Los indicadores del panel de resumen (128, 14, 3, 84.6/100), los tres
  documentos de ejemplo, los cinco porcentajes por dimensión y los tres
  hallazgos. En el original están incrustados en el front y no provienen de
  ninguna API; aquí se conservan en `src/lib/demo.ts`, aislados y rotulados
  como datos de demostración.
- La rúbrica por omisión con sus cinco dimensiones y pesos (30/20/25/15/10).
- Las 10 normas prioritarias del catálogo, con emisor y materia.
- El contrato de `GET /api/documents` y `GET /api/evaluations`.

## Qué se completó

El original no exponía forma de escribir datos por API observable, pero la
interfaz sí ofrece las acciones. Se implementaron las rutas que faltaban para
que los flujos de la interfaz funcionen de punta a punta:

| Añadido | Motivo |
|---|---|
| `POST /api/documents` | «Registrar documento» / «Iniciar evaluación» del modal de carga. |
| `POST /api/evaluations` | Botón «Iniciar» del formulario de evaluación. |
| `POST /api/evaluations/templates` | Botón «Guardar matriz». Valida que las ponderaciones sumen 100. |
| `GET` y `POST /api/catalog` | «Cargar normas prioritarias». En el original el catálogo se mantenía en estado del cliente y se perdía al recargar; aquí se persiste. |
| Persistencia en SQLite | El original no exponía su motor de datos. Se eligió el SQLite integrado de Node para no requerir servicios externos ni compilación nativa. |
| `GET /api/evaluations` devuelve las matrices con sus criterios | El original devolvía solo `{ id, name }`, insuficiente para dibujar la tarjeta de matriz (que muestra número de criterios y ponderación total). La respuesta es un superconjunto compatible. |

## Qué no se replicó

- **El motor de análisis.** No se observó ninguna llamada que analizara el
  contenido de un documento; el puntaje aquí es determinista, no analítico (ver
  el README).
- **Almacenamiento del archivo cargado.** El original tampoco mostró una ruta de
  subida; el modal solo deriva el título del nombre del archivo.
- **Autenticación.** El original delega el acceso en el inicio de sesión de
  ChatGPT del hospedaje, que no es replicable fuera de él. La sesión mostrada en
  la barra lateral es fija.
- **Los módulos «Usuarios y roles» y «Configuración»**, que en el original son
  marcadores sin funcionalidad.
