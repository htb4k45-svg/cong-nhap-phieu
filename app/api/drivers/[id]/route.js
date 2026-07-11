import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// PATCH /api/drivers/[id] → cập nhật thông tin lái xe
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const allowed = ['ten', 'vai_tro', 'dien_thoai', 'bien_so', 'suc_tai_thung', 'suc_tai_kg', 'active'];
    const updates = {};
    for (const k of allowed) {
      if (k in body) {
        if (k === 'suc_tai_thung' || k === 'suc_tai_kg') {
          updates[k] = parseInt(body[k]) || 0;
        } else if (k === 'ten') {
          updates[k] = String(body[k]).trim();
        } else {
          updates[k] = body[k] === '' ? null : body[k];
        }
      }
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Không có gì cập nhật' }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ driver: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/drivers/[id] → vô hiệu hoá (active = false)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('drivers')
      .update({ active: false })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
