/** Secciones del espacio de trabajo, en el orden en que aparecen en la barra lateral. */

export const SECTIONS = [
  { id: 'resumen', label: 'Resumen', title: 'Control de calidad documental' },
  { id: 'documentos', label: 'Documentos', title: 'Carga de Documentos a Evaluar' },
  { id: 'evaluaciones', label: 'Evaluaciones', title: 'Evaluaciones' },
  { id: 'catalogo', label: 'Catálogo normativo', title: 'Catálogo normativo' },
  { id: 'usuarios', label: 'Usuarios y roles', title: 'Usuarios y roles' },
  { id: 'configuracion', label: 'Configuración', title: 'Configuración' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export function getSection(id: SectionId) {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
}
