import { NextResponse } from 'next/server';
import { fetchPhieuByDateRange } from '@/lib/sheets';

// GET /api/sheets-data?from=YYYY-MM-DD&to=YYYY-MM-DD
// Backward compat: ?date=YYYY-MM-DD
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const today = new Date().toISOString().split('T')[0];
    const from  = searchParams.get('from') || searchParams.get('date') || today;
    const to    = searchParams.get('to')   || from;

    const { phieu, errors, debug_csv } = await fetchPhieuByDateRange(from, to);

    return NextResponse.json({ phieu, errors, debug_csv, from, to });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}