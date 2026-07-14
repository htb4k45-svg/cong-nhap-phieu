/**
 * POST /api/nhien-lieu/upload
 * Nhận JSON { thang, invoices, quotas, chiPhi }
 * Xóa data cũ của tháng → upsert mới vào Supabase
 */

import { createAdminClient } from '@/lib/supabase';
import { NextResponse }      from 'next/server';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
  }

  const { thang, invoices = [], quotas = [], chiPhi = [] } = body;
  if (!thang) return NextResponse.json({ error: 'Thiếu thang' }, { status: 400 });

  const db = createAdminClient();

  try {
    // ── 1. Xóa data cũ của tháng ──────────────────────────────────────────
    await db.from('nhien_lieu_gd').delete().eq('thang', thang);
    await db.from('nhien_lieu_chiphi').delete().eq('thang', thang);
    await db.from('xe_km_thang').delete().eq('thang', thang);

    // ── 2. Upsert xe_km_thang + cập nhật xe ──────────────────────────────
    if (quotas.length) {
      const kmRows = quotas.map(q => ({
        bien_so:       q.bien_so,
        thang,
        km_dau:        q.km_dau        ?? null,
        km_cuoi:       q.km_cuoi       ?? null,
        ton_dau_lit:   q.ton_dau_lit   ?? null,
        ton_cuoi_lit:  q.ton_cuoi_lit  ?? null,
      }));
      const { error: e1 } = await db.from('xe_km_thang').upsert(kmRows, {
        onConflict: 'bien_so,thang',
        ignoreDuplicates: false,
      });
      if (e1) console.error('[upload] xe_km_thang error:', e1.message);

      // Cập nhật dinh_muc_l_100km trong xe nếu có
      for (const q of quotas) {
        if (q.bien_so && q.dinh_muc_l_100km != null) {
          await db.from('xe')
            .update({ dinh_muc_l_100km: q.dinh_muc_l_100km })
            .eq('bien_so', q.bien_so);
        }
        // Thêm xe mới nếu chưa có
        if (q.bien_so) {
          await db.from('xe').upsert(
            { bien_so: q.bien_so, tai_trong: q.tai_trong ?? null, dinh_muc_l_100km: q.dinh_muc_l_100km ?? null },
            { onConflict: 'bien_so', ignoreDuplicates: false }
          );
        }
      }
    }

    // ── 3. Insert nhien_lieu_gd ────────────────────────────────────────────
    if (invoices.length) {
      const gdRows = invoices.map(inv => ({
        bien_so:          inv.bien_so          ?? null,
        bien_so_raw:      inv.bien_so_raw      ?? null,
        thang,
        ngay_gd:          inv.ngay_gd          ?? null,
        so_gd:            inv.so_gd            ?? null,
        tai_khoan:        inv.tai_khoan        ?? null,
        ten_tai_xe:       inv.ten_tai_xe       ?? null,
        don_vi_kd:        inv.don_vi_kd        ?? null,
        chxd:             inv.chxd             ?? null,
        don_vi:           inv.don_vi           ?? null,
        mat_hang:         inv.mat_hang         ?? null,
        so_luong_lit:     inv.so_luong         ?? null,
        tien_hang_co_ck:  inv.tien_hang        ?? null,
        tong_dt_co_ck:    inv.tong_dt          ?? null,
        ky_hieu_hd:       inv.ky_hieu_hd       ?? null,
        so_hd:            inv.so_hd            ?? null,
        ngay_hd:          inv.ngay_hd          ?? null,
        ten_dv_ban:       inv.ten_dv_ban       ?? null,
        mst_dv_ban:       inv.mst_dv_ban       ?? null,
        khu_vuc:          inv.khu_vuc          ?? null,
        trang_thai:       inv.trang_thai       ?? null,
        // PDF matching
        co_pdf:           inv.co_pdf           ?? false,
        pdf_dvbh:         inv.pdf_dvbh         ?? null,
        pdf_mst:          inv.pdf_mst          ?? null,
        lenh_canh_bao:    inv.lenh_canh_bao    ?? null,
      }));

      // Insert theo lô 500 rows
      for (let i = 0; i < gdRows.length; i += 500) {
        const batch = gdRows.slice(i, i + 500);
        const { error: e2 } = await db.from('nhien_lieu_gd').insert(batch);
        if (e2) console.error('[upload] nhien_lieu_gd error:', e2.message);
      }
    }

    // ── 4. Insert nhien_lieu_chiphi ────────────────────────────────────────
    if (chiPhi.length) {
      const cpRows = chiPhi.map(c => ({
        thang,
        bien_so:  c.bien_so  ?? null,
        loai_cp:  c.loai_cp  ?? null,
        so_tien:  c.so_tien  ?? null,
        ghi_chu:  c.ghi_chu  ?? null,
      }));
      const { error: e3 } = await db.from('nhien_lieu_chiphi').insert(cpRows);
      if (e3) console.error('[upload] nhien_lieu_chiphi error:', e3.message);
    }

    return NextResponse.json({
      ok: true,
      saved: { invoices: invoices.length, quotas: quotas.length, chiPhi: chiPhi.length }
    });

  } catch (err) {
    console.error('[upload] Lỗi:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
