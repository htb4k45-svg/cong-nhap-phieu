import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/phuong-xa?list=1           → danh sách phường/xã (cho grouping dropdown)
// GET /api/phuong-xa?list=1&tinh=01   → lọc theo tỉnh
// GET /api/phuong-xa?q=địa chỉ        → tìm phường/xã match địa chỉ

export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const q    = searchParams.get('q')    || '';
    const list = searchParams.get('list') || '';
    const tinh = searchParams.get('tinh') || '';

    // ── Trả danh sách phường/xã (để build matcher trên client) ────────────
    if (list === '1') {
      let query = supabase
        .from('phuong_xa')
        .select('ma_xa, ten_xa, ten_xa_ngan, loai_xa, ma_tinh, ten_tinh')
        .order('ma_tinh')
        .order('ten_xa');

      if (tinh) query = query.eq('ma_tinh', tinh);

      const { data, error } = await query;
      if (error) throw error;

      return NextResponse.json({ wards: data || [] });
    }

    // ── Tìm phường/xã từ chuỗi địa chỉ ───────────────────────────────────
    if (!q.trim()) return NextResponse.json({ match: null, results: [] });

    // Tìm bằng ILIKE (đơn giản, không cần full-text search)
    const { data, error } = await supabase
      .from('phuong_xa')
      .select('ma_xa, ten_xa, ten_xa_ngan, ma_tinh, ten_tinh')
      .or(`ten_xa.ilike.%${q}%,ten_xa_ngan.ilike.%${q}%`)
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ match: (data || [])[0] || null, results: data || [] });
  } catch (err) {
    return NextResponse.json({ match: null, results: [], error: err.message });
  }
}
