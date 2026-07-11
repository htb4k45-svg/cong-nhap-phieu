import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/drivers → danh sách lái xe / phụ xe (all, kể cả inactive)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all') === '1'; // ?all=1 → lấy cả inactive
  try {
    const supabase = createAdminClient();

    // Thử full columns trước (sau khi migration chạy xong)
    let q = supabase
      .from('drivers')
      .select('id, ten, vai_tro, dien_thoai, bien_so, suc_tai_thung, suc_tai_kg, active')
      .order('vai_tro')
      .order('ten');
    if (!all) q = q.eq('active', true);

    let { data, error } = await q;

    // Fallback nếu migration chưa chạy
    if (error) {
      let q2 = supabase.from('drivers').select('id, ten, vai_tro, dien_thoai, active').order('vai_tro').order('ten');
      if (!all) q2 = q2.eq('active', true);
      const fallback = await q2;
      data  = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    return NextResponse.json({ drivers: data || [] });
  } catch (err) {
    return NextResponse.json({ drivers: [], error: err.message }, { status: 500 });
  }
}

// POST /api/drivers → tạo lái xe mới
export async function POST(request) {
  try {
    const body = await request.json();
    const { ten, vai_tro, dien_thoai, bien_so, suc_tai_thung, suc_tai_kg } = body;
    if (!ten || !vai_tro) return NextResponse.json({ error: 'Thiếu tên hoặc vai trò' }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        ten: ten.trim(),
        vai_tro,
        dien_thoai: dien_thoai || null,
        bien_so:    bien_so    || null,
        suc_tai_thung: parseInt(suc_tai_thung) || 0,
        suc_tai_kg:    parseInt(suc_tai_kg)    || 0,
        active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ driver: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
