import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { fetchPhieuByDateRange } from '@/lib/sheets';

// GET /api/bao-cao?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to') || from;

    if (!from) return NextResponse.json({ error: 'Thiếu tham số from' }, { status: 400 });

    // ── 1. Lấy đơn từ Google Sheets ─────────────────────────────────────────
    const { phieu, errors } = await fetchPhieuByDateRange(from, to);

    // ── 2. Lấy dispatch_status từ Supabase ───────────────────────────────────
    const supabase = createAdminClient();
    const rowKeys  = phieu.map(p => p.row_key).filter(Boolean);

    let statusMap = {};
    if (rowKeys.length > 0) {
      // Batch nếu quá nhiều (Supabase .in() limit ~500)
      const batches = [];
      for (let i = 0; i < rowKeys.length; i += 400) {
        batches.push(rowKeys.slice(i, i + 400));
      }
      for (const batch of batches) {
        const { data } = await supabase
          .from('dispatch_status')
          .select('*')
          .in('row_key', batch);
        (data || []).forEach(s => { statusMap[s.row_key] = s; });
      }
    }

    // ── 3. Merge & enrich ────────────────────────────────────────────────────
    const today  = new Date().toISOString().slice(0, 10);

    const orders = phieu.map(p => {
      const s = statusMap[p.row_key] || {};
      const laiXe    = s.lai_xe_phan_cong  || p.lai_xe    || null;
      const giaoNhan = s.giao_nhan_phan_cong || p.giao_nhan || null;
      const trangThai = s.trang_thai || 'pending';
      const ngayGiao  = p.ngay_can_giao || null;

      // Trạng thái tồn đọng
      let ton_dong_ly_do = null;
      if (!laiXe)                                                ton_dong_ly_do = 'Chưa phân xe';
      else if (ngayGiao && ngayGiao < today && trangThai === 'pending') ton_dong_ly_do = 'Quá hạn giao';

      // Tổng thùng: lấy từ ghi_chu (parser ghi "Tổng: N") hoặc từ san_pham
      let tong_thung = 0;
      if (p.ghi_chu) {
        const m = p.ghi_chu.match(/Tổng:\s*(\d+)/);
        if (m) tong_thung = parseInt(m[1]);
      }
      if (!tong_thung && p.san_pham?.length) {
        tong_thung = p.san_pham.reduce((acc, sp) => acc + (sp.so_luong || 0), 0);
      }

      return {
        row_key:      p.row_key,
        so_phieu:     p.so_phieu,
        ma_lenh:      p.ma_lenh,
        bo_phan:      p.bo_phan,
        ten_kh:       p.ten_kh,
        dia_chi_giao: p.dia_chi_giao,
        ngay_nhap:    p.ngay_nhap,
        ngay_giao:    ngayGiao,
        ten_kho:      p.ten_kho,
        lai_xe:       laiXe,
        giao_nhan:    giaoNhan,
        trang_thai:   trangThai,
        ghi_chu:      s.ghi_chu || p.ghi_chu || null,
        tong_thung,
        ton_dong_ly_do,
      };
    });

    // ── 4. Summary cards ─────────────────────────────────────────────────────
    const summary = {
      tong_don:         orders.length,
      da_phan_xe:       orders.filter(o => o.lai_xe).length,
      chua_phan_xe:     orders.filter(o => !o.lai_xe).length,
      chua_co_ngay:     orders.filter(o => !o.ngay_giao).length,
      qua_han:          orders.filter(o => o.ngay_giao && o.ngay_giao < today && o.trang_thai === 'pending').length,
      tong_thung_tat_ca: orders.reduce((s, o) => s + o.tong_thung, 0),
    };

    // ── 5. Tổng hợp theo lái xe ──────────────────────────────────────────────
    const driverMap = {};
    for (const o of orders) {
      const key = o.lai_xe || '(Chưa phân xe)';
      if (!driverMap[key]) {
        driverMap[key] = {
          lai_xe: key,
          so_don: 0, tong_thung: 0,
          b2b: 0, gt: 0, mt: 0,
          qua_han: 0,
        };
      }
      const d = driverMap[key];
      d.so_don++;
      d.tong_thung += o.tong_thung;
      if (o.bo_phan === 'B2B') d.b2b++;
      else if (o.bo_phan === 'GT') d.gt++;
      else if (o.bo_phan === 'MT') d.mt++;
      if (o.ngay_giao && o.ngay_giao < today && o.trang_thai === 'pending') d.qua_han++;
    }

    const by_driver = Object.values(driverMap).sort((a, b) => {
      // Chưa phân xe xuống cuối
      if (a.lai_xe === '(Chưa phân xe)') return 1;
      if (b.lai_xe === '(Chưa phân xe)') return -1;
      return b.so_don - a.so_don;
    });

    // ── 6. Đơn tồn đọng ──────────────────────────────────────────────────────
    const ton_dong = orders.filter(o => o.ton_dong_ly_do);

    return NextResponse.json({
      from, to,
      summary,
      by_driver,
      ton_dong,
      orders,
      errors,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
