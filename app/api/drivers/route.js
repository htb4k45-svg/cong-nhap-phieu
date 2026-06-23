import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/drivers → danh sách lái xe / phụ xe active
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('drivers')
      .select('id, ten, vai_tro, dien_thoai')
      .eq('active', true)
      .order('vai_tro')
      .order('ten');
    if (error) throw error;
    return NextResponse.json({ drivers: data || [] });
  } catch (err) {
    return NextResponse.json({ drivers: [], error: err.message }, { status: 500 });
  }
}
