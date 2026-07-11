import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/xe-km?thang=YYYY-MM
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const thang = searchParams.get('thang');
    const supabase = createAdminClient();

    let q = supabase
      .from('xe_km_thang')
      .select('bien_so, thang, km_dau, km_cuoi, ton_dau_lit, ton_cuoi_lit, updated_at')
      .order('bien_so');
    if (thang) q = q.eq('thang', thang);

    const { data, error } = await q;
    if (error) throw error;

    // Kèm định mức
    const { data: xeList } = await supabase
      .from('xe')
      .select('bien_so, tai_trong, dinh_muc_l_100km');
    const xeMap = {};
    (xeList || []).forEach(x => { xeMap[x.bien_so] = x; });

    const rows = (data || []).map(r => ({
      ...r,
      tai_trong:       xeMap[r.bien_so]?.tai_trong || null,
      dinh_muc_l_100km: xeMap[r.bien_so]?.dinh_muc_l_100km || null,
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/xe-km
// Body: { thang: 'YYYY-MM', records: [{ bien_so, km_dau, km_cuoi, ton_dau_lit, ton_cuoi_lit, dinh_muc_l_100km }] }
export async function POST(request) {
  try {
    const { thang, records } = await request.json();
    if (!thang || !records?.length) {
      return NextResponse.json({ error: 'Thiếu thang hoặc records' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Upsert xe_km_thang
    const kmRows = records.map(r => ({
      bien_so:      r.bien_so,
      thang,
      km_dau:       r.km_dau       ?? null,
      km_cuoi:      r.km_cuoi      ?? null,
      ton_dau_lit:  r.ton_dau_lit  ?? null,
      ton_cuoi_lit: r.ton_cuoi_lit ?? null,
      updated_at:   new Date().toISOString(),
    }));
    const { error: kmErr } = await supabase
      .from('xe_km_thang')
      .upsert(kmRows, { onConflict: 'bien_so,thang' });
    if (kmErr) throw kmErr;

    // Cập nhật định mức vào bảng xe (nếu có)
    const xeUpdates = records.filter(r => r.dinh_muc_l_100km != null);
    for (const r of xeUpdates) {
      await supabase
        .from('xe')
        .upsert({ bien_so: r.bien_so, dinh_muc_l_100km: r.dinh_muc_l_100km, tai_trong: r.tai_trong || null },
                 { onConflict: 'bien_so' });
    }

    return NextResponse.json({ ok: true, upserted: kmRows.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
