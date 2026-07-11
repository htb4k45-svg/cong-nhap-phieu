import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/nhien-lieu/bao-cao?thang=YYYY-MM[&bien_so=...]
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const thang   = searchParams.get('thang');
    const bienSo  = searchParams.get('bien_so') || null;

    if (!thang) return NextResponse.json({ error: 'Thiếu tham số thang' }, { status: 400 });

    const supabase = createAdminClient();

    // ── 1. Danh sách xe + định mức ──────────────────────────────────────────
    const { data: xeList } = await supabase
      .from('xe')
      .select('bien_so, tai_trong, dinh_muc_l_100km')
      .order('bien_so');

    const xeMap = {};
    (xeList || []).forEach(x => { xeMap[x.bien_so] = x; });

    // ── 2. Km theo tháng ────────────────────────────────────────────────────
    const { data: kmList } = await supabase
      .from('xe_km_thang')
      .select('bien_so, km_dau, km_cuoi, ton_dau_lit, ton_cuoi_lit')
      .eq('thang', thang);

    const kmMap = {};
    (kmList || []).forEach(k => { kmMap[k.bien_so] = k; });

    // ── 3. Tổng hợp giao dịch theo biển số ─────────────────────────────────
    let gdQuery = supabase
      .from('nhien_lieu_gd')
      .select('bien_so, so_luong_lit, tien_hang_co_ck, tong_dt_co_ck, mat_hang, ky_hieu_hd')
      .eq('thang', thang);
    if (bienSo) gdQuery = gdQuery.eq('bien_so', bienSo);

    const { data: gdRows, error: gdErr } = await gdQuery;
    if (gdErr) throw gdErr;

    // Aggregate per bien_so
    const gdMap = {};
    for (const r of (gdRows || [])) {
      if (!gdMap[r.bien_so]) {
        gdMap[r.bien_so] = { lit_do: 0, tien_hang: 0, tong_dt: 0, pvoil_dt: 0, cash_dt: 0, mat_hang_set: new Set() };
      }
      const tien = r.tong_dt_co_ck || 0;
      gdMap[r.bien_so].lit_do    += r.so_luong_lit || 0;
      gdMap[r.bien_so].tien_hang += r.tien_hang_co_ck || 0;
      gdMap[r.bien_so].tong_dt   += tien;
      // Phân loại PVOil (có ky_hieu_hd) vs Tiền mặt
      if (r.ky_hieu_hd) gdMap[r.bien_so].pvoil_dt += tien;
      else               gdMap[r.bien_so].cash_dt  += tien;
      if (r.mat_hang) gdMap[r.bien_so].mat_hang_set.add(r.mat_hang.split(' ')[0]);
    }

    // ── 4. Giao dịch chi tiết (nếu request 1 xe) ────────────────────────────
    let detail = [];
    if (bienSo) {
      const { data: detailRows } = await supabase
        .from('nhien_lieu_gd')
        .select('*')
        .eq('thang', thang)
        .eq('bien_so', bienSo)
        .order('ngay_gd');
      detail = detailRows || [];
    }

    // ── 5. Build report ──────────────────────────────────────────────────────
    // Lấy tất cả biển số có dữ liệu tháng này
    const allPlates = new Set([
      ...Object.keys(gdMap),
      ...(kmList || []).map(k => k.bien_so),
    ]);

    const rows = [...allPlates].sort().map(bs => {
      const xe  = xeMap[bs] || { bien_so: bs };
      const km  = kmMap[bs] || {};
      const gd  = gdMap[bs] || { lit_do: 0, tien_hang: 0, tong_dt: 0, mat_hang_set: new Set() };

      const km_thuc      = (km.km_cuoi || 0) - (km.km_dau || 0);
      const lit_do       = gd.lit_do;
      const ton_dau      = km.ton_dau_lit || 0;
      const ton_cuoi     = km.ton_cuoi_lit || 0;
      const lit_tieu_thu = ton_dau + lit_do - ton_cuoi;
      const dm           = xe.dinh_muc_l_100km || null;
      const tieu_hao_thuc = km_thuc > 0 ? (lit_tieu_thu / km_thuc * 100) : null;
      const dm_tong_lit  = dm && km_thuc > 0 ? (dm * km_thuc / 100) : null;
      const chenh_lech   = tieu_hao_thuc !== null && dm ? tieu_hao_thuc - dm : null;
      const vuot_dm      = chenh_lech !== null && chenh_lech > 0;

      return {
        bien_so:       bs,
        tai_trong:     xe.tai_trong || '—',
        dinh_muc:      dm,
        km_dau:        km.km_dau || null,
        km_cuoi:       km.km_cuoi || null,
        km_thuc,
        ton_dau,
        ton_cuoi,
        lit_do:        +lit_do.toFixed(2),
        lit_tieu_thu:  +lit_tieu_thu.toFixed(2),
        dm_tong_lit:   dm_tong_lit !== null ? +dm_tong_lit.toFixed(2) : null,
        tieu_hao_thuc: tieu_hao_thuc !== null ? +tieu_hao_thuc.toFixed(2) : null,
        chenh_lech:    chenh_lech !== null ? +chenh_lech.toFixed(2) : null,
        vuot_dm,
        tien_hang:     +gd.tien_hang.toFixed(0),
        tong_dt:       +gd.tong_dt.toFixed(0),
        pvoil_dt:      +gd.pvoil_dt.toFixed(0),
        cash_dt:       +gd.cash_dt.toFixed(0),
        mat_hang:      [...gd.mat_hang_set].join(', ') || '—',
      };
    });

    const summary = {
      tong_xe:      rows.length,
      xe_vuot_dm:   rows.filter(r => r.vuot_dm).length,
      tong_lit_do:  +rows.reduce((s, r) => s + r.lit_do, 0).toFixed(2),
      tong_km:      rows.reduce((s, r) => s + r.km_thuc, 0),
      tong_tien:    rows.reduce((s, r) => s + r.tong_dt, 0),
    };

    return NextResponse.json({ thang, summary, rows, detail });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
