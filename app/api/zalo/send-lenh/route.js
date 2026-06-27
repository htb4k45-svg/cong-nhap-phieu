import { NextResponse } from 'next/server';

/**
 * POST /api/zalo/send-lenh
 *
 * Gửi lệnh điều xe dạng text message tới nhóm Zalo qua Zalo OA API.
 *
 * Env vars cần cấu hình trên Vercel:
 *   ZALO_OA_ACCESS_TOKEN  — OA Access Token (lấy từ https://developers.zalo.me)
 *   ZALO_GROUP_ID         — ID nhóm Zalo (lấy từ OA Management → nhóm chat)
 *
 * Body JSON:
 *   driverName  string
 *   bienSo      string
 *   giaoNhan    string
 *   date        string   "YYYY-MM-DD"
 *   orders      Array<{ so_phieu, ten_kh, dia_chi_giao, tong_thung, san_pham }>
 */
export async function POST(request) {
  try {
    const { driverName, bienSo, giaoNhan, date, orders } = await request.json();

    const accessToken = process.env.ZALO_OA_ACCESS_TOKEN;
    const groupId     = process.env.ZALO_GROUP_ID;

    if (!accessToken) {
      return NextResponse.json({ error: 'Chưa cấu hình ZALO_OA_ACCESS_TOKEN trên Vercel' }, { status: 500 });
    }
    if (!groupId) {
      return NextResponse.json({ error: 'Chưa cấu hình ZALO_GROUP_ID trên Vercel' }, { status: 500 });
    }
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'Không có đơn nào để gửi' }, { status: 400 });
    }

    // ── Format ngày ──────────────────────────────────────────────────
    const d = new Date(date + 'T00:00:00');
    const dateVN = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    // ── Format danh sách đơn ─────────────────────────────────────────
    const orderLines = orders.map((p, i) => {
      const hangHoa = p.san_pham && p.san_pham.length > 0
        ? p.san_pham.map(s => `${s.ma_sp || s.ten_sp || '?'}×${s.so_luong_thung || s.so_luong || 0}`).join(', ')
        : (p.ghi_chu ? p.ghi_chu.slice(0, 40) : 'Chưa có thông tin');
      const thung = p.tong_thung > 0 ? ` (${p.tong_thung} thùng)` : '';
      return `${i+1}. [${p.so_phieu || '—'}] ${p.ten_kh}\n   📍 ${p.dia_chi_giao || 'Chưa có địa chỉ'}\n   📦 ${hangHoa}${thung}`;
    }).join('\n\n');

    const totalThung = orders.reduce((s, p) => s + (p.tong_thung || 0), 0);

    // ── Nội dung tin nhắn ────────────────────────────────────────────
    const text = [
      `📋 LỆNH ĐIỀU XE — ${dateVN}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🚗 Lái xe: ${driverName}${bienSo ? ` (${bienSo})` : ''}`,
      giaoNhan && giaoNhan !== '—' ? `👤 Phụ xe: ${giaoNhan}` : null,
      ``,
      orderLines,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ Tổng: ${orders.length} điểm giao${totalThung > 0 ? ` | ${totalThung} thùng` : ''}`,
    ].filter(l => l !== null).join('\n');

    // ── Gửi tới nhóm Zalo ────────────────────────────────────────────
    const res = await fetch('https://openapi.zalo.me/v2.0/oa/message', {
      method: 'POST',
      headers: {
        'access_token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { group_id: groupId },
        message:   { text },
      }),
    });

    const data = await res.json();

    // Zalo trả về error=0 là thành công
    if (data.error !== 0) {
      console.error('Zalo API error:', data);
      return NextResponse.json({
        error: `Zalo lỗi (${data.error}): ${data.message || 'Không rõ'}`,
        zalo_response: data,
      }, { status: 502 });
    }

    return NextResponse.json({ success: true, message_id: data.data?.message_id });
  } catch (err) {
    console.error('send-lenh error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
