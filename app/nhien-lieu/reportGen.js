import * as XLSX from 'xlsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtD(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtN(n, dec = 0) {
  if (n == null || isNaN(n)) return '';
  return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Số → chữ Tiếng Việt ──────────────────────────────────────────────────────
function numToVietWords(amount) {
  if (!amount || amount === 0) return 'Không đồng chẵn';
  amount = Math.round(amount);
  const u = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function readGroup(n) {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;
    let s = '';
    if (h > 0) s += u[h] + ' trăm';
    if (t === 0 && o > 0) {
      s += (h > 0 ? ' lẻ ' : '') + u[o];
    } else if (t === 1) {
      s += ' mười';
      if (o === 1) s += ' một';
      else if (o === 5) s += ' lăm';
      else if (o > 0) s += ' ' + u[o];
    } else if (t > 1) {
      s += ' ' + u[t] + ' mươi';
      if (o === 1) s += ' mốt';
      else if (o === 5) s += ' lăm';
      else if (o > 0) s += ' ' + u[o];
    }
    return s.trim();
  }

  const ty     = Math.floor(amount / 1_000_000_000);
  const trieu  = Math.floor((amount % 1_000_000_000) / 1_000_000);
  const nghin  = Math.floor((amount % 1_000_000) / 1_000);
  const rem    = amount % 1_000;

  const parts = [];
  if (ty    > 0) parts.push(readGroup(ty)    + ' tỷ');
  if (trieu > 0) parts.push(readGroup(trieu) + ' triệu');
  if (nghin > 0) parts.push(readGroup(nghin) + ' nghìn');
  if (rem   > 0) parts.push(readGroup(rem));

  const text = parts.join(', ') + ' đồng chẵn';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── Hàng tiêu đề chung ───────────────────────────────────────────────────────
function headerRows(title, bien_so, tai_trong, ten_tai_xe, monthNum, year) {
  return [
    ['CÔNG TY CP VĂN PHÒNG PHẨM HỒNG HÀ'],
    ['TT Thương mại và Dịch vụ'],
    [],
    [title + ` - THÁNG ${monthNum}/${year}`],
    [`Xe: ${bien_so}${tai_trong ? ` (${tai_trong})` : ''} - Lái xe: ${ten_tai_xe || ''}`],
    [],
  ];
}

function signatureRows(monthNum, year) {
  return [
    [],
    ['', '', '', `Hà Nội, ngày      tháng ${monthNum} năm ${year}`],
    [],
    ['Trưởng Đơn vị', '', '', 'Người lập'],
    [],
    [],
    [],
    ['Chu Quý Thật', '', '', 'Hoàng Kim Hằng'],
  ];
}

function downloadXlsx(wb, filename) {
  const out  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Sheet 1: Bảng tổng kết chi phí xe ────────────────────────────────────────
function sheetChiPhi(r, rows, monthNum, year, tenTaiXe) {
  const tong = r.tong_dt || 0;

  const data = [
    ...headerRows('BẢNG TỔNG KẾT CHI PHÍ XE', r.bien_so, r.tai_trong, tenTaiXe, monthNum, year),
    ['STT', 'DIỄN GIẢI', 'SỐ TIỀN', 'HOÁ ĐƠN', 'GHI CHÚ'],
    ['B', 'Chi phí chuyển hàng ra bến - nội bộ', '-', '', ''],
    ['1', 'Lệ phí cầu đường', '-', 'Vé thu lệ phí', ''],
    ['2', 'Phí vào bến', '-', '', ''],
    ['3', 'Phí bốc xếp hàng hóa', '-', '', ''],
    ['C', 'Chi phí chuyển hàng đến đại lý (Tỉnh)', '-', '', ''],
    ['1', 'Lệ phí cầu đường', '-', 'Vé thu lệ phí', ''],
    ['2', 'Chi phí khác', '-', '', ''],
    ['D', 'Rửa xe', '-', '', ''],
    ['', 'Tổng cộng (A+B+C+D):', tong, 'a', ''],
    ['', 'Thanh toán chuyển khoản (mua qua thẻ PV Oil):', tong, 'b', ''],
    ['', 'Còn phải thanh toán', '-', 'c=a-b', ''],
    [],
    [`Bằng chữ: ${numToVietWords(tong)}`],
    ...signatureRows(monthNum, year),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 6 }, { wch: 42 }, { wch: 16 }, { wch: 14 }, { wch: 20 }];
  // Format số tiền
  const totalRows = [16, 17]; // 0-indexed rows for Tổng cộng & Thanh toán (row 15, 16 in 1-indexed = data[15], data[16])
  for (const ri of totalRows) {
    const cell = ws[XLSX.utils.encode_cell({ r: ri, c: 2 })];
    if (cell) cell.z = '#,##0';
  }
  return ws;
}

// ── Sheet 2: Bảng kê hóa đơn ─────────────────────────────────────────────────
function sheetBangKe(r, rows, monthNum, year, tenTaiXe) {
  const dataRows = rows.map((d, i) => [
    i + 1,
    fmtD(d.ngay_hd || d.ngay_gd),
    d.so_hd || '',
    d.mat_hang || 'Dầu diesel',
    d.so_luong_lit || 0,
    d.tong_dt_co_ck || d.tien_hang_co_ck || 0,
    d.ky_hieu_hd ? 'Thẻ PV Oil' : 'TM',
  ]);

  const tongLit  = rows.reduce((s, d) => s + (d.so_luong_lit || 0), 0);
  const tongTien = r.tong_dt || rows.reduce((s, d) => s + (d.tong_dt_co_ck || d.tien_hang_co_ck || 0), 0);

  const data = [
    ...headerRows('BẢNG KÊ HÓA ĐƠN', r.bien_so, r.tai_trong, tenTaiXe, monthNum, year),
    ['STT', 'Ngày', 'Số Hóa đơn', 'Nội dung', 'Số lít dầu', 'Số tiền', 'Ghi chú'],
    ...dataRows,
    ['', 'Tổng cộng', '', '', tongLit, tongTien, ''],
    [],
    ['', '', '', '', '', 'Người lập', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 11 }, { wch: 14 }, { wch: 12 }];
  return ws;
}

// ── Sheet 3: Bảng tổng kết nguyên liệu ───────────────────────────────────────
function sheetNguyenLieu(r, rows, monthNum, year, tenTaiXe) {
  const chenh   = r.chenh_lech ?? null;
  const vuot    = chenh !== null ? +chenh.toFixed(2) : null;
  const kl      = r.vuot_dm
    ? `Kết luận: Xe bị vượt quá định mức +${chenh?.toFixed(2)} lít`
    : 'Kết luận: Xe không bị vượt quá định mức';

  const data = [
    ...headerRows('BẢNG TỔNG KẾT NGUYÊN LIỆU XE', r.bien_so, r.tai_trong, tenTaiXe, monthNum, year),
    ['STT', 'DIỄN GIẢI', 'SỐ LÍT NL', 'HOÁ ĐƠN', 'GHI CHÚ'],
    ['D', 'Số nguyên liệu sử dụng thực tế', r.lit_tieu_thu ?? 0, 'd=a+b-c', ''],
    ['E', 'Số nguyên liệu được phép sử dụng (theo ĐM)',
      r.dm_tong_lit ?? '', 'e', `ĐM=${r.dinh_muc || '?'} lít/100km`],
    ['F', 'Kết luận', vuot !== null ? vuot : '-', 'f=d-e', ''],
    ['', 'Số nguyên liệu vượt ĐM', vuot !== null ? vuot : '-', '', kl],
    ...signatureRows(monthNum, year),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 5 }, { wch: 42 }, { wch: 14 }, { wch: 12 }, { wch: 40 }];
  return ws;
}

// ── Export chính ──────────────────────────────────────────────────────────────
export function generateVehicleReport(summaryRow, detailRows, thang) {
  const r         = summaryRow;
  const rows      = detailRows || [];
  const tenTaiXe  = rows[0]?.ten_tai_xe || '';
  const [year, month] = thang.split('-');
  const monthNum  = parseInt(month, 10);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetChiPhi(r, rows, monthNum, year, tenTaiXe),      'Tong ket chi phi');
  XLSX.utils.book_append_sheet(wb, sheetBangKe(r, rows, monthNum, year, tenTaiXe),      'Bang ke hoa don');
  XLSX.utils.book_append_sheet(wb, sheetNguyenLieu(r, rows, monthNum, year, tenTaiXe),  'Tong ket NL');

  const bienSoFile = r.bien_so.replace(/[^A-Za-z0-9]/g, '_');
  downloadXlsx(wb, `bao-cao-xe_${bienSoFile}_T${month}-${year}.xlsx`);
}
