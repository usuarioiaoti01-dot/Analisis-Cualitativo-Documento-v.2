'use client';

import { useCallback, useEffect, useState } from 'react';
import { CargarDocumentoModal } from '@/components/CargarDocumentoModal';
import { CatalogoView } from '@/components/CatalogoView';
import { DocumentosView } from '@/components/DocumentosView';
import { EvaluacionesView } from '@/components/EvaluacionesView';
import { ModuloPendiente } from '@/components/ModuloPendiente';
import { NuevaMatrizModal } from '@/components/NuevaMatrizModal';
import { ResumenView } from '@/components/ResumenView';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { getSection, type SectionId } from '@/lib/sections';
import type { CriterionRecord, DocumentRecord, NormRecord, TemplateRecord } from '@/lib/types';

/** Lanza un error legible cuando la ruta de API responde con un estado no exitoso. */
async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
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
  const [matrixOpen, setMatrixOpen] = useState(false);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [evaluationDocuments, setEvaluationDocuments] = useState<{ id: string; title: string }[]>([]);
  const [norms, setNorms] = useState<NormRecord[]>([]);

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
    }>('/api/evaluations');
    setEvaluationDocuments(data.documents);
    setTemplates(data.templates);
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

  async function registerDocument(title: string, documentType: string) {
    await request('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ title, document_type: documentType }),
    });
    await Promise.all([loadDocuments(), loadEvaluations()]);
    setSection('documentos');
  }

  async function runEvaluation(documentId: string, templateId: number) {
    await request('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, template_id: templateId }),
    });
    await loadDocuments();
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
      <Sidebar active={section} onSelect={setSection} pendingCount={pendingCount} />

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

          {section === 'documentos' && (
            <DocumentosView
              documents={documents}
              loading={documentsLoading}
              onRegister={() => setUploadOpen(true)}
            />
          )}

          {section === 'evaluaciones' && (
            <EvaluacionesView
              documents={evaluationDocuments}
              templates={templates}
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
