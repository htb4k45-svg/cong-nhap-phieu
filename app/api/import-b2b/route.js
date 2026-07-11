import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// POST /api/import-b2b
// Body: { phieu_list: [...], bo_phan: 'B2B' }
export async function POST(request) {
  try {
    const { phieu_list } = await request.json();
    if (!Array.isArray(phieu_list) || !phieu_list.length) {
      return NextResponse.json({ error: 'Không có dữ liệu' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const results = { success: 0, skipped: 0, errors: [] };

    for (const phieu of phieu_list) {
      try {
        // Upsert khách hàng
        if (phieu.ten_kh) {
          await supabase.from('khach_hang').upsert(
            { ma_kh: phieu.ten_kh.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 20),
              ten_kh: phieu.ten_kh.trim(),
              dia_chi: phieu.dia_chi_giao || null },
            { onConflict: 'ma_kh', ignoreDuplicates: true }
          );
        }

        // Insert phiếu (bỏ qua nếu số phiếu đã tồn tại)
        const { data: inserted, error: phieuErr } = await supabase
          .from('phieu')
          .insert({
            ngay_nhap:    phieu.ngay_nhap || new Date().toISOString().split('T')[0],
            so_phieu:     phieu.so_phieu,
            ma_lenh:      phieu.ma_lenh || null,
            ma_kh:        phieu.ma_kh || null,
            ten_kh:       phieu.ten_kh || '',
            dia_chi_giao: phieu.dia_chi_giao || null,
            bo_phan:      phieu.bo_phan || 'B2B',
            ma_kho:       phieu.ma_kho || null,
            ten_kho:      phieu.ten_kho || null,
            ngay_can_giao: phieu.ngay_can_giao || null,
            dac_diem:     phieu.dac_diem || 'xuat_moi',
            ghi_chu:      phieu.ghi_chu || null,
            trang_thai:   'confirmed',
          })
          .select()
          .single();

        if (phieuErr) {
          if (phieuErr.code === '23505') {
            results.skipped++;
            continue;
          }
          throw new Error(phieuErr.message);
        }

        // Insert người giao nhận
        const nguoiNhan = [];
        if (phieu.lai_xe) nguoiNhan.push({ phieu_id: inserted.id, ho_ten: phieu.lai_xe, so_dt: null, thu_tu: 1 });
        if (phieu.giao_nhan) nguoiNhan.push({
          phieu_id: inserted.id,
          ho_ten: phieu.giao_nhan,
          so_dt: phieu.sdt_nguoi_nhan || null,
          thu_tu: 2
        });
        if (nguoiNhan.length) await supabase.from('nguoi_nhan').insert(nguoiNhan);

        // Insert sản phẩm
        if (phieu.san_pham?.length) {
          const spRows = phieu.san_pham.map(s => ({
            phieu_id:           inserted.id,
            ma_sp:              s.ma_sp,
            ten_sp:             s.ten_sp,
            so_luong:           s.so_luong || 1,
            khoi_luong_quy_doi: 0,
            don_vi:             'thùng',
          }));
          await supabase.from('phieu_san_pham').insert(spRows);
        }

        results.success++;
      } catch (e) {
        results.errors.push({ so_phieu: phieu.so_phieu, error: e.message });
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
