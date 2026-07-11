import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

/**
 * POST /api/b2b-to-dispatch
 *
 * Nhận đơn hàng B2B Portal đã được duyệt (DANG_GIAO) và tạo phiếu
 * trong dispatch_status để điều xe có thể phân công ngay.
 *
 * Env vars:
 *   DISPATCH_API_KEY   — phải khớp với B2B_API_KEY trên server B2B
 *   B2B_PORTAL_URL     — VD: http://157.245.58.180
 *   B2B_API_KEY        — key để gọi ngược lại B2B webhook (set-phieu-code)
 *
 * Body JSON (từ B2B portal):
 *   api_key, order_code, ma_kh, ten_kh, dia_chi_giao,
 *   ngay_giao_yc, ghi_chu, tong_tien,
 *   items: [{ ma_hang, ten_hang, dvt, so_luong, gia_ban }]
 */
export async function POST(request) {
  try {
    const body = await request.json();

    // ── Xác thực API key ──────────────────────────────────────────────────────
    const expectedKey = process.env.DISPATCH_API_KEY || process.env.B2B_API_KEY || 'hh-dispatch-b2b-key-2026';
    if (body.api_key !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_code, ma_kh, ten_kh, dia_chi_giao, ngay_giao_yc, ghi_chu, tong_tien, items } = body;

    if (!order_code || !ten_kh) {
      return NextResponse.json({ error: 'Thiếu order_code hoặc ten_kh' }, { status: 400 });
    }

    // ── Kiểm tra đơn đã tồn tại chưa ─────────────────────────────────────────
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from('dispatch_status')
      .select('row_key')
      .eq('b2b_order_code', order_code)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, row_key: existing.row_key, already_exists: true });
    }

    // ── Chuẩn bị dữ liệu phiếu ────────────────────────────────────────────────
    const ngayGiao = ngay_giao_yc || new Date().toISOString().slice(0, 10);
    const rowKey   = order_code; // dùng order_code làm row_key để link dễ

    // Tính tổng thùng (ước tính từ items)
    const tongThung = (items || []).reduce((s, it) => s + (parseFloat(it.so_luong) || 0), 0);

    // Chuyển items → san_pham format của dispatch
    const sanPham = (items || []).map(it => ({
      ma_sp:          it.ma_hang,
      ten_sp:         it.ten_hang,
      don_vi:         it.dvt || 'cái',
      so_luong:       it.so_luong,
      so_luong_thung: it.so_luong, // coi sl = thùng cho đơn B2B
      gia_ban:        it.gia_ban,
    }));

    // ── Upsert vào dispatch_status ─────────────────────────────────────────────
    const { data, error } = await supabase
      .from('dispatch_status')
      .upsert({
        row_key:        rowKey,
        so_phieu:       order_code,
        bo_phan:        'B2B',
        ten_kh:         ten_kh,
        ma_kh:          ma_kh || null,
        dia_chi_giao:   dia_chi_giao || '',
        ngay_giao:      ngayGiao,
        tong_thung:     Math.round(tongThung),
        san_pham:       sanPham,
        ghi_chu:        ghi_chu || '',
        tong_tien_b2b:  tong_tien || 0,
        b2b_order_code: order_code,
        trang_thai_giao: 'chua_giao',
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'row_key' })
      .select()
      .single();

    if (error) throw error;

    // ── Gọi ngược B2B để lưu mã phiếu ────────────────────────────────────────
    const b2bUrl    = process.env.B2B_PORTAL_URL;
    const b2bApiKey = process.env.B2B_API_KEY || expectedKey;
    if (b2bUrl) {
      // fire-and-forget — không block response
      fetch(`${b2bUrl}/b2b/api/webhook/set-phieu-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: b2bApiKey, order_code, phieu_code: rowKey }),
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, row_key: rowKey, phieu: data });

  } catch (err) {
    console.error('b2b-to-dispatch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
