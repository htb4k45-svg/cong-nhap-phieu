import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// PATCH /api/phieu/[id]  → Cập nhật trạng thái giao, lái xe, giao nhận
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // Chỉ cho phép update các field điều xe
    const allowed = ['trang_thai_giao', 'ghi_chu'];
    const updates = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Cập nhật người nhận nếu có
    if (body.nguoi_nhan && Array.isArray(body.nguoi_nhan)) {
      // Xoá cũ rồi insert lại
      await supabase.from('nguoi_nhan').delete().eq('phieu_id', id);
      if (body.nguoi_nhan.length > 0) {
        await supabase.from('nguoi_nhan').insert(
          body.nguoi_nhan.map((n, i) => ({
            phieu_id: id,
            ho_ten: n.ho_ten,
            so_dt: n.so_dt || null,
            thu_tu: i + 1,
          }))
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('phieu')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ data });
    }

    return NextResponse.json({ data: { id } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/phieu/[id]  → Chi tiết 1 phiếu
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('phieu')
      .select('*, nguoi_nhan(*), phieu_san_pham(*)')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
