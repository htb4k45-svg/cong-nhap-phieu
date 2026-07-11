import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/nhien-lieu/hoa-don?thang=YYYY-MM
// Trả về tất cả hóa đơn trong tháng từ nhien_lieu_gd
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const thang = searchParams.get('thang');
    if (!thang) return NextResponse.json({ error: 'Thiếu tham số thang' }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('nhien_lieu_gd')
      .select('id, bien_so, ten_tai_xe, mst_dv_ban, ten_dv_ban, ky_hieu_hd, so_hd, ngay_hd, so_luong_lit, tong_dt_co_ck, pdf_file, pdf_verified_at')
      .eq('thang', thang)
      .order('ngay_hd', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ thang, records: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/nhien-lieu/hoa-don
 * Body: {
 *   invoices: [{ ky_hieu_hd, so_hd, pdf_file }],
 *   save?: boolean   // true → cập nhật DB, false → chỉ đối chiếu
 * }
 * Response: { results: [{ ky_hieu_hd, so_hd, pdf_file, matched, record? }] }
 */
export async function POST(request) {
  try {
    const { invoices = [], save = false } = await request.json();
    if (!invoices.length) {
      return NextResponse.json({ error: 'Danh sách hóa đơn rỗng' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const results  = [];

    for (const inv of invoices) {
      const { ky_hieu_hd, so_hd, pdf_file } = inv;

      // Tìm bản ghi trong nhien_lieu_gd
      let q = supabase
        .from('nhien_lieu_gd')
        .select('id, bien_so, ngay_gd, ten_tai_xe, so_luong_lit, thang')
        .limit(1);

      if (ky_hieu_hd) q = q.eq('ky_hieu_hd', ky_hieu_hd);
      if (so_hd)      q = q.eq('so_hd', so_hd);

      const { data, error } = await q.maybeSingle();
      if (error) throw error;

      const matched = !!data;

      // Nếu save=true và có bản ghi khớp → cập nhật pdf_file + pdf_verified_at
      if (save && matched && pdf_file) {
        await supabase
          .from('nhien_lieu_gd')
          .update({ pdf_file, pdf_verified_at: new Date().toISOString() })
          .eq('id', data.id);
      }

      results.push({
        ky_hieu_hd: ky_hieu_hd || null,
        so_hd:      so_hd      || null,
        pdf_file:   pdf_file   || null,
        matched,
        record: matched ? {
          id:          data.id,
          bien_so:     data.bien_so,
          ngay_gd:     data.ngay_gd,
          ten_tai_xe:  data.ten_tai_xe,
          so_luong_lit: data.so_luong_lit,
          thang:       data.thang,
        } : null,
      });
    }

    const summary = {
      total:     results.length,
      matched:   results.filter(r => r.matched).length,
      unmatched: results.filter(r => !r.matched).length,
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
