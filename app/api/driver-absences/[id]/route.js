import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// DELETE /api/driver-absences/[id] → xoá 1 lịch nghỉ (hết nghỉ sớm hoặc khai báo nhầm)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('driver_absences')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
