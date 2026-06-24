import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/kho  → Danh sách kho
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('kho')
      .select('*')
      .eq('active', true)
      .order('ma_kho', { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/kho  → Thêm kho mới
export async function POST(request) {
  try {
    const { ma_kho, ten_kho } = await request.json();
    if (!ma_kho || !ten_kho) {
      return NextResponse.json({ error: 'Cần mã kho và tên kho' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('kho')
      .insert({ ma_kho: ma_kho.trim(), ten_kho: ten_kho.trim() })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
