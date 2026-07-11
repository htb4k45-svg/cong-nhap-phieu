import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// GET /api/bao-cao/export?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to') || from;

    if (!from) return NextResponse.json({ error: 'Thiếu from' }, { status: 400 });

    // Gọi lại API bao-cao để lấy dữ liệu
    const baseUrl = request.nextUrl.origin;
    const res  = await fetch(`${baseUrl}/api/bao-cao?from=${from}&to=${to}`);
    const data = await res.json();

    if (data.error) return NextResponse.json({ error: data.error }, { status: 500 });

    const { summary, by_driver, ton_dong, orders } = data;
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Tổng hợp ────────────────────────────────────────────────────
    const tongHopRows = [
      ['BÁO CÁO ĐIỀU XE – HỒNG HÀ VĂN PHÒNG PHẨM'],
      [`Kỳ báo cáo: ${formatDate(from)}${from !== to ? ' → ' + formatDate(to) : ''}`],
      [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`],
      [],
      ['I. TỔNG QUAN'],
      ['Chỉ tiêu', 'Giá trị'],
      ['Tổng số đơn', summary.tong_don],
      ['Đã phân xe', summary.da_phan_xe],
      ['Chưa phân xe', summary.chua_phan_xe],
      ['Chưa có ngày giao', summary.chua_co_ngay],
      ['Quá hạn (chưa giao)', summary.qua_han],
      ['Tổng thùng hàng', summary.tong_thung_tat_ca],
      [],
      ['II. THEO LÁI XE'],
      ['Lái xe', 'Số đơn', 'Tổng thùng', 'B2B', 'GT', 'MT', 'Quá hạn'],
      ...by_driver.map(d => [
        d.lai_xe, d.so_don, d.tong_thung, d.b2b, d.gt, d.mt, d.qua_han,
      ]),
    ];
    const wsTongHop = XLSX.utils.aoa_to_sheet(tongHopRows);

    // Style cột B của bảng lái xe (số liệu)
    wsTongHop['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsTongHop, 'Tổng hợp');

    // ── Sheet 2: Chi tiết đơn ────────────────────────────────────────────────
    const chiTietHeader = [
      'STT', 'Bộ phận', 'Số phiếu', 'Mã lệnh', 'Khách hàng',
      'Địa chỉ', 'Kho', 'Ngày đơn', 'Ngày giao', 'Lái xe',
      'Phụ xe', 'Tổng thùng', 'Trạng thái', 'Ghi chú',
    ];
    const chiTietRows = orders.map((o, i) => [
      i + 1,
      o.bo_phan,
      o.so_phieu,
      o.ma_lenh || '',
      o.ten_kh,
      o.dia_chi_giao,
      o.ten_kho || '',
      o.ngay_nhap ? formatDate(o.ngay_nhap) : '',
      o.ngay_giao ? formatDate(o.ngay_giao) : '',
      o.lai_xe || '',
      o.giao_nhan || '',
      o.tong_thung,
      mapTrangThai(o.trang_thai),
      o.ghi_chu || '',
    ]);
    const wsChiTiet = XLSX.utils.aoa_to_sheet([chiTietHeader, ...chiTietRows]);
    wsChiTiet['!cols'] = [
      { wch: 5 }, { wch: 8 }, { wch: 20 }, { wch: 18 }, { wch: 32 },
      { wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsChiTiet, 'Chi tiết đơn');

    // ── Sheet 3: Tồn đọng ────────────────────────────────────────────────────
    const tonDongHeader = [
      'STT', 'Lý do', 'Bộ phận', 'Số phiếu', 'Khách hàng',
      'Địa chỉ', 'Ngày giao (dự kiến)', 'Lái xe hiện tại', 'Ghi chú',
    ];
    const tonDongRows = ton_dong.map((o, i) => [
      i + 1,
      o.ton_dong_ly_do,
      o.bo_phan,
      o.so_phieu,
      o.ten_kh,
      o.dia_chi_giao,
      o.ngay_giao ? formatDate(o.ngay_giao) : '(Chưa có)',
      o.lai_xe || '(Chưa phân)',
      o.ghi_chu || '',
    ]);
    const wsTonDong = XLSX.utils.aoa_to_sheet([tonDongHeader, ...tonDongRows]);
    wsTonDong['!cols'] = [
      { wch: 5 }, { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 32 },
      { wch: 40 }, { wch: 20 }, { wch: 16 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsTonDong, 'Tồn đọng');

    // ── Xuất file ────────────────────────────────────────────────────────────
    const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `BaoCao_DieuXe_${from}${from !== to ? '_den_' + to : ''}.xlsx`;

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function mapTrangThai(tt) {
  const map = {
    pending:   'Chờ giao',
    in_transit:'Đang giao',
    done:      'Hoàn thành',
    failed:    'Giao thất bại',
    cancelled: 'Hủy',
  };
  return map[tt] || tt || 'Chờ giao';
}
