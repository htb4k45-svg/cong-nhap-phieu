import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/dispatch-status?date=YYYY-MM-DD
export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const from = searchParams.get('from') || date;
    const to   = searchParams.get('to')   || from;
    let query = supabase.from('dispatch_status').select('*');
    if (from && to && from !== to) {
      query = query.gte('ngay_giao', from).lte('ngay_giao', to);
    } else if (from) {
      query = query.eq('ngay_giao', from);
    }

    const { data, error } = await query;

    // Trả về map: row_key → status record (kể cả khi bảng chưa tồn tại)
    const statusMap = {};
    (data || []).forEach(s => { statusMap[s.row_key] = s; });

    return NextResponse.json({ statusMap, db_error: error?.message || null });
  } catch (err) {
    // Luôn trả về statusMap hợp lệ, không crash page
    return NextResponse.json({ statusMap: {}, db_error: err.message });
  }
}

// POST /api/dispatch-status  → upsert trạng thái + phân công lái xe
export async function POST(request) {
  try {
    const body = await request.json();
    const { row_key, bo_phan, ngay_giao, trang_thai, ghi_chu,
            lai_xe_phan_cong, giao_nhan_phan_cong, ghi_chu_giao } = body;

    if (!row_key) return NextResponse.json({ error: 'Thiếu row_key' }, { status: 400 });

    const supabase = createAdminClient();

    // Build upsert payload — chỉ ghi đè field được gửi lên
    const payload = {
      row_key,
      bo_phan:   bo_phan   || null,
      ngay_giao: ngay_giao || null,
      updated_at: new Date().toISOString(),
    };
    if (trang_thai)            payload.trang_thai            = trang_thai;
    if (ghi_chu !== undefined) payload.ghi_chu               = ghi_chu || null;
    // Dùng ?? (không dùng ||) để chuỗi rỗng '' được lưu như sentinel "đã hủy rõ ràng"
    if (lai_xe_phan_cong    !== undefined) payload.lai_xe_phan_cong    = lai_xe_phan_cong    ?? null;
    if (giao_nhan_phan_cong !== undefined) payload.giao_nhan_phan_cong = giao_nhan_phan_cong ?? null;
    if (ghi_chu_giao          !== undefined) payload.ghi_chu_giao          = ghi_chu_giao          || null;

    const { data, error } = await supabase
      .from('dispatch_status')
      .upsert(payload, { onConflict: 'row_key' })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // ── Ghi ngược lại Google Sheet (nếu có phân công lái xe mới) ─────────────
    const scriptUrl = process.env.APPS_SCRIPT_WRITE_URL;
    const hasAssignment = lai_xe_phan_cong !== undefined || giao_nhan_phan_cong !== undefined;
    let sheetWriteback = null;
    if (scriptUrl && hasAssignment) {
      // Await với timeout 5s — Vercel serverless tắt ngay khi return nên không dùng fire-and-forget
      try {
        const res = await Promise.race([
          fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              row_key,
              so_phieu:   row_key,
              bo_phan:    bo_phan || 'B2B',
              lai_xe:     lai_xe_phan_cong,
              giao_nhan:  giao_nhan_phan_cong,
              ngay_giao:  ngay_giao || null,
            }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 5s')), 5000)),
        ]);
        // Trước đây chỉ catch lỗi network — Apps Script trả HTTP 200 kèm {ok:false, error}
        // khi không tìm thấy cột/hàng thì bị bỏ qua hoàn toàn, ghi ngược coi như thất bại âm thầm.
        const json = await res.json().catch(() => null);
        if (!json || json.ok === false) {
          const errMsg = json?.error || `HTTP ${res.status}`;
          console.warn('Apps Script writeback trả lỗi:', errMsg);
          sheetWriteback = { ok: false, error: errMsg };
        } else {
          sheetWriteback = { ok: true };
        }
      } catch (e) {
        console.warn('Apps Script write failed:', e.message);
        sheetWriteback = { ok: false, error: e.message };
      }
    }

    return NextResponse.json({ data, sheet_writeback: sheetWriteback });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
