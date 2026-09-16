import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ErrorDeContraste, ETAPAS_POR_OMISION, ejecutarContraste } from '@/lib/contraste';

export const dynamic = 'force-dynamic';

/**
 * POST /api/documents/[id]/contraste — ejecuta las etapas 5 y 6.
 *
 * Cuerpo opcional: `{ etapas: ['normativa', 'similitud'] }`. Por omisión corre
 * ambas. La evaluación las corre por su cuenta al terminar; esta ruta sirve
 * para repetirlas sin volver a evaluar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let etapas: string[] = [...ETAPAS_POR_OMISION];
  try {
    const body = await request.json();
    if (Array.isArray(body?.etapas) && body.etapas.length > 0) etapas = body.etapas;
  } catch {
    // Sin cuerpo: se corren ambas etapas.
  }

  try {
    return NextResponse.json(ejecutarContraste(getDb(), id, etapas), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorDeContraste) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
