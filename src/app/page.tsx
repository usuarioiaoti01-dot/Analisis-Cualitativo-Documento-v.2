'use client';

import { useCallback, useEffect, useState } from 'react';
import { CargarDocumentoModal } from '@/components/CargarDocumentoModal';
import { CatalogoView } from '@/components/CatalogoView';
import { DocumentoDetalle } from '@/components/DocumentoDetalle';
import { DocumentosView } from '@/components/DocumentosView';
import { EvaluacionesView, type Motor } from '@/components/EvaluacionesView';
import { ModuloPendiente } from '@/components/ModuloPendiente';
import { NuevaMatrizModal } from '@/components/NuevaMatrizModal';
import { ResumenView } from '@/components/ResumenView';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { getSection, type SectionId } from '@/lib/sections';
import type {
  CriterionRecord,
  DocumentRecord,
  NormRecord,
  Resumen,
  TemplateRecord,
} from '@/lib/types';

/** Lanza un error legible cuando la ruta de API responde con un estado no exitoso. */
async function request<T>(input: string, init?: RequestInit): Promise<T> {
  // `FormData` fija su propio Content-Type con el delimitador; no hay que tocarlo.
  const isJson = init?.body !== undefined && !(init.body instanceof FormData);

  const response = await fetch(input, {
    ...init,
    headers: isJson ? { 'Content-Type': 'application/json' } : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? 'La solicitud no pudo completarse.');
  }
  return payload as T;
}

export default function Page() {
  const [section, setSection] = useState<SectionId>('resumen');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  /** Matriz que se está modificando; `null` significa que se está creando una. */
  const [matrizEnEdicion, setMatrizEnEdicion] = useState<TemplateRecord | null>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [evaluationDocuments, setEvaluationDocuments] = useState<{ id: string; title: string }[]>([]);
  const [norms, setNorms] = useState<NormRecord[]>([]);
  const [motor, setMotor] = useState<{ ia_disponible: boolean; modelo: string } | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resumenCargando, setResumenCargando] = useState(true);

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const data = await request<{ documents: DocumentRecord[] }>('/api/documents');
      setDocuments(data.documents);
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  const loadEvaluations = useCallback(async () => {
    const data = await request<{
      documents: { id: string; title: string }[];
      templates: TemplateRecord[];
      motor: { ia_disponible: boolean; modelo: string };
    }>('/api/evaluations');
    setEvaluationDocuments(data.documents);
    setTemplates(data.templates);
    setMotor(data.motor);
  }, []);

  const loadResumen = useCallback(async () => {
    setResumenCargando(true);
    try {
      setResumen(await request<Resumen>('/api/summary'));
    } finally {
      setResumenCargando(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await request<{ norms: NormRecord[] }>('/api/catalog');
    setNorms(data.norms);
  }, []);

  useEffect(() => {
    void loadDocuments();
    void loadEvaluations();
    void loadCatalog();
    void loadResumen();
  }, [loadDocuments, loadEvaluations, loadCatalog, loadResumen]);

  /** Sube el archivo; el servidor lo almacena, extrae su texto y devuelve la ficha. */
  async function registerDocument(file: File, documentType: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('document_type', documentType);

    const { document } = await request<{ document: DocumentRecord }>('/api/documents', {
      method: 'POST',
      body: form,
    });

    await Promise.all([loadDocuments(), loadEvaluations(), loadResumen()]);
    setSection('documentos');
    // Abrir el detalle deja a la vista el texto que se acaba de extraer.
    setOpenDocumentId(document.id);
  }

  /** Devuelve el resumen de la ejecución para mostrarlo en la vista. */
  async function runEvaluation(documentId: string, templateId: number, engine: Motor) {
    const data = await request<{
      evaluation: { score: number | null; engine: string };
      resumen: {
        criterios: number;
        hallazgos: number;
        citas_descartadas: number;
        secciones_omitidas?: number;
        lineas_de_pie?: number;
      };
    }>('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, template_id: templateId, engine }),
    });

    await Promise.all([loadDocuments(), loadResumen()]);

    const { evaluation, resumen } = data;
    const partes = [
      `Puntaje ${evaluation.score ?? '—'}/100 sobre ${resumen.criterios} criterios.`,
      `${resumen.hallazgos} hallazgo(s) con evidencia verificada.`,
    ];
    if (resumen.secciones_omitidas || resumen.lineas_de_pie) {
      const fuera = [
        resumen.secciones_omitidas && `${resumen.secciones_omitidas} sección(es) de carátula`,
        resumen.lineas_de_pie && `${resumen.lineas_de_pie} renglón(es) de pie`,
      ].filter(Boolean);
      partes.push(`Fuera del análisis: ${fuera.join(' y ')}.`);
    }
    if (resumen.citas_descartadas > 0) {
      partes.push(
        `${resumen.citas_descartadas} hallazgo(s) se descartaron porque su cita no se encontró en el documento.`,
      );
    }
    return partes.join(' ');
  }

  /** Crea la matriz o guarda los cambios de la que se está modificando. */
  async function guardarMatriz(payload: {
    name: string;
    document_type: string;
    criteria: CriterionRecord[];
  }) {
    const ruta = matrizEnEdicion
      ? `/api/evaluations/templates/${matrizEnEdicion.id}`
      : '/api/evaluations/templates';

    await request(ruta, {
      method: matrizEnEdicion ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    await loadEvaluations();
  }

  /** Devuelve el motivo cuando la matriz no puede eliminarse; `null` si se eliminó. */
  async function eliminarMatriz(template: TemplateRecord): Promise<string | null> {
    const response = await fetch(`/api/evaluations/templates/${template.id}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return (payload as { error?: string }).error ?? 'No fue posible eliminar la matriz.';
    }

    await loadEvaluations();
    return null;
  }

  async function loadPriorityNorms() {
    const data = await request<{ norms: NormRecord[]; total: number }>('/api/catalog', {
      method: 'POST',
    });
    setNorms(data.norms);
    void loadResumen();
    return data.total;
  }

  const current = getSection(section);
  const pendingCount = documents.filter((document) => document.status !== 'compliant').length;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        active={section}
        onSelect={(next) => {
          setOpenDocumentId(null);
          setSection(next);
        }}
        pendingCount={pendingCount}
      />

      <main className="min-w-0 flex-1 px-8 py-7">
        <TopBar
          eyebrow={current.label}
          title={current.title}
          onUpload={() => setUploadOpen(true)}
        />

        <div className="mt-7">
          {section === 'resumen' && (
            <ResumenView
              resumen={resumen}
              loading={resumenCargando}
              onOpenCatalog={() => setSection('catalogo')}
              onOpenDocument={(documentId) => {
                setOpenDocumentId(documentId);
                setSection('documentos');
              }}
            />
          )}

          {section === 'documentos' &&
            (openDocumentId ? (
              <DocumentoDetalle
                documentId={openDocumentId}
                onBack={() => setOpenDocumentId(null)}
                onDeleted={() => {
                  setOpenDocumentId(null);
                  void Promise.all([loadDocuments(), loadEvaluations(), loadResumen()]);
                }}
                onChanged={() => void Promise.all([loadDocuments(), loadResumen()])}
              />
            ) : (
              <DocumentosView
                documents={documents}
                loading={documentsLoading}
                onRegister={() => setUploadOpen(true)}
                onOpen={setOpenDocumentId}
              />
            ))}

          {section === 'evaluaciones' && (
            <EvaluacionesView
              documents={evaluationDocuments}
              templates={templates}
              motor={motor}
              onRun={runEvaluation}
              onNewTemplate={() => {
                setMatrizEnEdicion(null);
                setMatrixOpen(true);
              }}
              onEditTemplate={(template) => {
                setMatrizEnEdicion(template);
                setMatrixOpen(true);
              }}
              onDeleteTemplate={eliminarMatriz}
            />
          )}

          {section === 'catalogo' && (
            <CatalogoView
              norms={norms}
              onRecargar={async () => {
                await loadCatalog();
                void loadResumen();
              }}
              onLoadPriority={loadPriorityNorms}
            />
          )}

          {(section === 'usuarios' || section === 'configuracion') && (
            <ModuloPendiente title={current.title} onBack={() => setSection('resumen')} />
          )}
        </div>
      </main>

      {uploadOpen && (
        <CargarDocumentoModal onClose={() => setUploadOpen(false)} onSubmit={registerDocument} />
      )}
      {matrixOpen && (
        <NuevaMatrizModal
          // La clave fuerza un modal nuevo al cambiar de matriz, para que el
          // formulario no conserve los valores de la anterior.
          key={matrizEnEdicion?.id ?? 'nueva'}
          matriz={matrizEnEdicion ?? undefined}
          onClose={() => setMatrixOpen(false)}
          onSubmit={guardarMatriz}
        />
      )}
    </div>
  );
}
