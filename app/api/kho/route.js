import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/kho — danh sách kho active, Hà Nội trước (local first)
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('kho')
      .select('ma_kho, ten_kho, tinh_thanh, dia_chi, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);

    // Local first: Hà Nội luôn đứng đầu, sau đó sort theo tỉnh/thành
    const hanoi  = (data || []).filter(k => k.tinh_thanh === 'Hà Nội');
    const others = (data || []).filter(k => k.tinh_thanh !== 'Hà Nội')
                               .sort((a, b) => a.tinh_thanh.localeCompare(b.tinh_thanh, 'vi'));

    return NextResponse.json({ kho: [...hanoi, ...others] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/kho — thêm kho mới
export async function POST(request) {
  try {
    const { ma_kho, ten_kho, tinh_thanh, dia_chi, sort_order } = await request.json();
    if (!ma_kho || !ten_kho) {
      return NextResponse.json({ error: 'Cần mã kho và tên kho' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('kho')
      .insert({
        ma_kho:     ma_kho.trim(),
        ten_kho:    ten_kho.trim(),
        tinh_thanh: tinh_thanh?.trim() || 'Hà Nội',
        dia_chi:    dia_chi?.trim()    || null,
        sort_order: sort_order         || 99,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ kho: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/kho — cập nhật kho (ten_kho, dia_chi, active, sort_order)
export async function PATCH(request) {
  try {
    const { ma_kho, ...fields } = await request.json();
    if (!ma_kho) return NextResponse.json({ error: 'Thiếu ma_kho' }, { status: 400 });

    const allowed = ['ten_kho', 'tinh_thanh', 'dia_chi', 'active', 'sort_order'];
    const payload = Object.fromEntries(
      Object.entries(fields).filter(([k]) => allowed.includes(k))
    );

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('kho')
      .update(payload)
      .eq('ma_kho', ma_kho)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ kho: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
