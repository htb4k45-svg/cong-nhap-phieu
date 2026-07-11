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

    // ── Thông báo B2B Portal: các đơn B2B của xe này hôm nay đã được giao ────
    const b2bUrl    = process.env.B2B_PORTAL_URL;
    const b2bApiKey = process.env.B2B_API_KEY;
    const donGiao   = parseInt(so_don_giao) || 0;

    if (b2bUrl && b2bApiKey && donGiao > 0) {
      // Tìm tất cả phiếu B2B của xe này ngày này
      const { data: b2bPhieus } = await supabase
        .from('dispatch_status')
        .select('b2b_order_code')
        .eq('lai_xe_phan_cong', driver_name)
        .eq('ngay_giao', ngay_chay)
        .not('b2b_order_code', 'is', null);

      if (b2bPhieus && b2bPhieus.length > 0) {
        // Gọi webhook B2B cho từng đơn (fire-and-forget)
        const ngayGiaoStr = new Date(ngay_chay + 'T07:00:00')
          .toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });

        const webhookCalls = b2bPhieus
          .filter(p => p.b2b_order_code)
          .map(p =>
            fetch(`${b2bUrl}/b2b/api/webhook/delivery-complete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                api_key:    b2bApiKey,
                order_code: p.b2b_order_code,
                ngay_giao:  ngayGiaoStr,
                driver_name,
              }),
            }).catch(() => {}) // không throw nếu B2B server lỗi
          );

        // Await với timeout 5s để không vượt Vercel serverless limit
        await Promise.race([
          Promise.allSettled(webhookCalls),
          new Promise(r => setTimeout(r, 5000)),
        ]);
      }
    }

    return NextResponse.json({ run: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
