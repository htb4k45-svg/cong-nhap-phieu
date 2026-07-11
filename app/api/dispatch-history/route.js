import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// POST /api/dispatch-history  → lưu snapshot hàng loạt khi chốt chuyến
export async function POST(request) {
  try {
    const body = await request.json();
    // Nhận 1 đơn hoặc mảng đơn
    const items = Array.isArray(body) ? body : [body];
    if (!items.length) return NextResponse.json({ ok: true, inserted: 0 });

    const rows = items.map(p => ({
      row_key:      p.row_key,
      so_phieu:     p.so_phieu     || p.row_key,
      ma_lenh:      p.ma_lenh      || null,
      bo_phan:      p.bo_phan      || null,
      ngay_giao:    p.ngay_giao    || null,
      da_giao_at:   p.da_giao_at   || new Date().toISOString(),
      lai_xe:       p.lai_xe       || null,
      giao_nhan:    p.giao_nhan    || null,
      ghi_chu_giao: p.ghi_chu_giao || null,
      ma_kh:        p.ma_kh        || null,
      ten_kh:       p.ten_kh       || null,
      dia_chi_giao: p.dia_chi_giao || null,
      khu_vuc:      p.khu_vuc      || null,
      san_pham:     p.san_pham     || null,
      tong_thung:   p.tong_thung   ?? 0,
      tong_kg:      p.tong_kg      ?? 0,
      don_gap:      p.don_gap      || false,
      ngay_len_don: p.ngay_len_don || null,
      snapshot_data: p.snapshot_data || null,
    }));

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('dispatch_history')
      .insert(rows)
      .select('id, row_key');

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, inserted: data.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// GET /api/dispatch-history?from=YYYY-MM-DD&to=YYYY-MM-DD&lai_xe=...&bo_phan=...&q=...&page=1&limit=50
export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const from    = searchParams.get('from');
    const to      = searchParams.get('to');
    const laiXe   = searchParams.get('lai_xe');
    const boPhan  = searchParams.get('bo_phan');
    const q       = searchParams.get('q');        // search tên KH hoặc số phiếu
    const page    = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit   = Math.min(200, parseInt(searchParams.get('limit') || '50'));
    const offset  = (page - 1) * limit;

    let query = supabase
      .from('dispatch_history')
      .select('*', { count: 'exact' })
      .order('da_giao_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from)   query = query.gte('ngay_giao', from);
    if (to)     query = query.lte('ngay_giao', to);
    if (laiXe)  query = query.eq('lai_xe', laiXe);
    if (boPhan) query = query.eq('bo_phan', boPhan);
    if (q) {
      // Tìm theo tên KH hoặc số phiếu (case-insensitive)
      query = query.or(`ten_kh.ilike.%${q}%,row_key.ilike.%${q}%,so_phieu.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ data, total: count, page, limit });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
