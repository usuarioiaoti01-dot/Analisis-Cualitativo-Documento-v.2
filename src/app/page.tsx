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
import type { CriterionRecord, DocumentRecord, NormRecord, TemplateRecord } from '@/lib/types';

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

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [evaluationDocuments, setEvaluationDocuments] = useState<{ id: string; title: string }[]>([]);
  const [norms, setNorms] = useState<NormRecord[]>([]);
  const [motor, setMotor] = useState<{ ia_disponible: boolean; modelo: string } | null>(null);

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

  const loadCatalog = useCallback(async () => {
    const data = await request<{ norms: NormRecord[] }>('/api/catalog');
    setNorms(data.norms);
  }, []);

  useEffect(() => {
    void loadDocuments();
    void loadEvaluations();
    void loadCatalog();
  }, [loadDocuments, loadEvaluations, loadCatalog]);

  /** Sube el archivo; el servidor lo almacena, extrae su texto y devuelve la ficha. */
  async function registerDocument(file: File, documentType: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('document_type', documentType);

    const { document } = await request<{ document: DocumentRecord }>('/api/documents', {
      method: 'POST',
      body: form,
    });

    await Promise.all([loadDocuments(), loadEvaluations()]);
    setSection('documentos');
    // Abrir el detalle deja a la vista el texto que se acaba de extraer.
    setOpenDocumentId(document.id);
  }

  /** Devuelve el resumen de la ejecución para mostrarlo en la vista. */
  async function runEvaluation(documentId: string, templateId: number, engine: Motor) {
    const data = await request<{
      evaluation: { score: number | null; engine: string };
      resumen: { criterios: number; hallazgos: number; citas_descartadas: number };
    }>('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, template_id: templateId, engine }),
    });

    await loadDocuments();

    const { evaluation, resumen } = data;
    const partes = [
      `Puntaje ${evaluation.score ?? '—'}/100 sobre ${resumen.criterios} criterios.`,
      `${resumen.hallazgos} hallazgo(s) con evidencia verificada.`,
    ];
    if (resumen.citas_descartadas > 0) {
      partes.push(
        `${resumen.citas_descartadas} hallazgo(s) se descartaron porque su cita no se encontró en el documento.`,
      );
    }
    return partes.join(' ');
  }

  async function createTemplate(payload: {
    name: string;
    document_type: string;
    criteria: CriterionRecord[];
  }) {
    await request('/api/evaluations/templates', { method: 'POST', body: JSON.stringify(payload) });
    await loadEvaluations();
  }

  async function loadPriorityNorms() {
    const data = await request<{ norms: NormRecord[]; total: number }>('/api/catalog', { method: 'POST' });
    setNorms(data.norms);
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
              onOpenCatalog={() => setSection('catalogo')}
              onOpenEvaluations={() => setSection('evaluaciones')}
            />
          )}

          {section === 'documentos' &&
            (openDocumentId ? (
              <DocumentoDetalle
                documentId={openDocumentId}
                onBack={() => setOpenDocumentId(null)}
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
              onNewTemplate={() => setMatrixOpen(true)}
            />
          )}

          {section === 'catalogo' && <CatalogoView norms={norms} onLoadPriority={loadPriorityNorms} />}

          {(section === 'usuarios' || section === 'configuracion') && (
            <ModuloPendiente title={current.title} onBack={() => setSection('resumen')} />
          )}
        </div>
      </main>

      {uploadOpen && (
        <CargarDocumentoModal onClose={() => setUploadOpen(false)} onSubmit={registerDocument} />
      )}
      {matrixOpen && <NuevaMatrizModal onClose={() => setMatrixOpen(false)} onSubmit={createTemplate} />}
    </div>
  );
}
