import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/driver-absences            → tất cả lịch nghỉ (kèm tên xe)
// GET /api/driver-absences?date=2026-06-26 → chỉ các lịch nghỉ có hiệu lực đúng ngày đó
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const supabase = createAdminClient();

    let q = supabase
      .from('driver_absences')
      .select('id, driver_id, ngay_tu, ngay_den, ly_do, created_at, drivers(ten)')
      .order('ngay_tu', { ascending: false });

    if (date) {
      q = q.lte('ngay_tu', date).gte('ngay_den', date);
    }

    const { data, error } = await q;
    if (error) throw error;

    const absences = (data || []).map(a => ({
      id: a.id,
      driver_id: a.driver_id,
      driver_name: a.drivers?.ten || '',
      ngay_tu: a.ngay_tu,
      ngay_den: a.ngay_den,
      ly_do: a.ly_do,
      created_at: a.created_at,
    }));

    return NextResponse.json({ absences });
  } catch (err) {
    return NextResponse.json({ absences: [], error: err.message }, { status: 500 });
  }
}

// POST /api/driver-absences → khai báo nghỉ
// Body: { driver_id, ngay_tu, ngay_den, ly_do }
export async function POST(request) {
  try {
    const body = await request.json();
    const { driver_id, ngay_tu, ngay_den, ly_do } = body;
    if (!driver_id || !ngay_tu || !ngay_den) {
      return NextResponse.json({ error: 'Thiếu driver_id, ngay_tu hoặc ngay_den' }, { status: 400 });
    }
    if (ngay_den < ngay_tu) {
      return NextResponse.json({ error: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('driver_absences')
      .insert({
        driver_id,
        ngay_tu,
        ngay_den,
        ly_do: ly_do || null,
      })
      .select('id, driver_id, ngay_tu, ngay_den, ly_do, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ absence: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
