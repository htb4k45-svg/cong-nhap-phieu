import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// POST /api/nhien-lieu/import
// Body: { thang: 'YYYY-MM', records: [...], replace: true }
export async function POST(request) {
  try {
    const { thang, records, replace = true } = await request.json();
    if (!thang || !records?.length) {
      return NextResponse.json({ error: 'Thiếu thang hoặc records' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Xóa dữ liệu cũ của tháng này nếu replace=true
    if (replace) {
      const { error: delErr } = await supabase
        .from('nhien_lieu_gd')
        .delete()
        .eq('thang', thang);
      if (delErr) throw delErr;
    }

    // Insert batch (chunk 100 rows)
    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK).map(r => ({ ...r, thang, import_at: new Date().toISOString() }));
      const { error } = await supabase.from('nhien_lieu_gd').insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    // Upsert xe mới chưa có trong bảng xe
    const uniquePlates = [...new Set(records.map(r => r.bien_so).filter(Boolean))];
    if (uniquePlates.length) {
      const xeRows = uniquePlates.map(bs => ({ bien_so: bs }));
      await supabase.from('xe').upsert(xeRows, { onConflict: 'bien_so', ignoreDuplicates: true });
    }

    return NextResponse.json({ ok: true, inserted, thang });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
