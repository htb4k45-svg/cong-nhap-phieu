import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/delivery-runs?date=2024-01-15&driver=QUANG
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date   = searchParams.get('date');
    const driver = searchParams.get('driver');
    const supabase = createAdminClient();
    let q = supabase.from('delivery_runs').select('*');
    if (date)   q = q.eq('ngay_chay', date);
    if (driver) q = q.eq('driver_name', driver);
    q = q.order('ngay_chay', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ runs: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/delivery-runs — upsert bản ghi chốt chuyến
// Body: { driver_name, ngay_chay, km_bat_dau, km_ket_thuc, so_don_giao, so_don_hoan, ghi_chu }
export async function POST(request) {
  try {
    const body = await request.json();
    const { driver_name, ngay_chay, km_bat_dau, km_ket_thuc, so_don_giao, so_don_hoan, ghi_chu } = body;
    if (!driver_name || !ngay_chay) {
      return NextResponse.json({ error: 'Thiếu driver_name hoặc ngay_chay' }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('delivery_runs')
      .upsert({
        driver_name,
        ngay_chay,
        km_bat_dau:   km_bat_dau  != null ? parseInt(km_bat_dau)  : null,
        km_ket_thuc:  km_ket_thuc != null ? parseInt(km_ket_thuc) : null,
        so_don_giao:  so_don_giao != null ? parseInt(so_don_giao) : 0,
        so_don_hoan:  so_don_hoan != null ? parseInt(so_don_hoan) : 0,
        ghi_chu:      ghi_chu || null,
      }, { onConflict: 'driver_name,ngay_chay' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ run: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
