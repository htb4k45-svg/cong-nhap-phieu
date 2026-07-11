import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/khach-hang  → Lấy toàn bộ danh sách
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('khach_hang')
      .select('*')
      .order('ma_kh', { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/khach-hang  → Upsert nhiều khách hàng (import từ Excel)
export async function POST(request) {
  try {
    const { khach_hang } = await request.json();
    if (!Array.isArray(khach_hang) || !khach_hang.length) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('khach_hang')
      .upsert(khach_hang, { onConflict: 'ma_kh' });

    if (error) throw new Error(error.message);

    // Trả về toàn bộ danh sách sau khi cập nhật
    const { data } = await supabase.from('khach_hang').select('*').order('ma_kh');
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
