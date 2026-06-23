import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/dispatch-status?date=YYYY-MM-DD
export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const from = searchParams.get('from') || date;
    const to   = searchParams.get('to')   || from;
    let query = supabase.from('dispatch_status').select('*');
    if (from && to && from !== to) {
      query = query.gte('ngay_giao', from).lte('ngay_giao', to);
    } else if (from) {
      query = query.eq('ngay_giao', from);
    }

    const { data, error } = await query;

    // Trả về map: row_key → status record (kể cả khi bảng chưa tồn tại)
    const statusMap = {};
    (data || []).forEach(s => { statusMap[s.row_key] = s; });

    return NextResponse.json({ statusMap, db_error: error?.message || null });
  } catch (err) {
    // Luôn trả về statusMap hợp lệ, không crash page
    return NextResponse.json({ statusMap: {}, db_error: err.message });
  }
}

// POST /api/dispatch-status  → upsert trạng thái
export async function POST(request) {
  try {
    const body = await request.json();
    const { row_key, bo_phan, ngay_giao, trang_thai, ghi_chu } = body;

    if (!row_key) return NextResponse.json({ error: 'Thiếu row_key' }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('dispatch_status')
      .upsert({
        row_key,
        bo_phan:   bo_phan   || null,
        ngay_giao: ngay_giao || null,
        trang_thai: trang_thai || 'cho_giao',
        ghi_chu:   ghi_chu   || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'row_key' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
