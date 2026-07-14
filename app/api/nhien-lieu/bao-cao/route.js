/**
 * GET /api/nhien-lieu/bao-cao?thang=YYYY-MM
 * Trả về invoices + quotas + chiPhi cho tháng
 */

import { createAdminClient } from '@/lib/supabase';
import { NextResponse }      from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const thang = searchParams.get('thang');
  if (!thang) return NextResponse.json({ error: 'Thiếu thang' }, { status: 400 });

  const db = createAdminClient();

  const [gdRes, kmRes, cpRes, xeRes] = await Promise.all([
    db.from('nhien_lieu_gd').select('*').eq('thang', thang).order('bien_so').order('ngay_gd'),
    db.from('xe_km_thang').select('*').eq('thang', thang),
    db.from('nhien_lieu_chiphi').select('*').eq('thang', thang),
    db.from('xe').select('bien_so,dinh_muc_l_100km,tai_trong'),
  ]);

  const xeMap = (xeRes.data || []).reduce((acc, x) => { acc[x.bien_so] = x; return acc; }, {});

  const quotas = (kmRes.data || []).map(km => ({
    ...km,
    dinh_muc_l_100km: xeMap[km.bien_so]?.dinh_muc_l_100km ?? null,
    tai_trong:        xeMap[km.bien_so]?.tai_trong         ?? null,
  }));

  return NextResponse.json({
    invoices: gdRes.data || [],
    quotas,
    chiPhi:   cpRes.data || [],
  });
}
