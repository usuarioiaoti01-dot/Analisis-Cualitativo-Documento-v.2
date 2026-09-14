import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll } from '@/lib/sqlite';
import { loadPriorityNorms } from '@/lib/seed';
import type { NormRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SELECT_NORMS =
  'SELECT id, code, title, issuer, subject, status, created_at FROM norms ORDER BY id';

/** GET /api/catalog — normas registradas para sustentar las evaluaciones. */
export function GET() {
  const db = getDb();
  const norms = queryAll<NormRecord>(db, SELECT_NORMS);

  return NextResponse.json({ norms });
}

/** POST /api/catalog — incorpora las referencias prioritarias del inventario interno. */
export function POST() {
  const db = getDb();
  const total = loadPriorityNorms(db);
  const norms = queryAll<NormRecord>(db, SELECT_NORMS);

  return NextResponse.json({ norms, total });
}
