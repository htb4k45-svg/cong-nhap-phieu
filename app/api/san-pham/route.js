import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/san-pham  → Danh sách sản phẩm nặng
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('san_pham')
      .select('*')
      .eq('active', true)
      .order('ten_sp', { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/san-pham  → Thêm sản phẩm mới
export async function POST(request) {
  try {
    const body = await request.json();
    const { ma_sp, ten_sp, khoi_luong_quy_doi, don_vi } = body;

    if (!ma_sp || !ten_sp || !khoi_luong_quy_doi) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('san_pham')
      .insert({
        ma_sp: ma_sp.trim(),
        ten_sp: ten_sp.trim(),
        khoi_luong_quy_doi: parseFloat(khoi_luong_quy_doi),
        don_vi: don_vi || 'thùng',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
