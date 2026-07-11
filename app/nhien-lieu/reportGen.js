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

// ── Chuẩn hóa biển số để tra cpMap ───────────────────────────────────────────
function normPlate(s) {
  return (s || '').toUpperCase().replace(/[-.\s]/g, '');
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
function sheetChiPhi(r, rows, monthNum, year, tenTaiXe, cp) {
  // cp = { cp_nb_caudong, cp_nb_ben, cp_nb_bocxep, cp_tinh_caudong, cp_tinh_ben, cp_tinh_bocxep, cp_ruaxe }
  const c = cp || {};
  const pvoil_dt = r.pvoil_dt || 0;
  const cash_dt  = r.cash_dt  || r.tong_dt || 0;   // fallback nếu API cũ
  const a1 = pvoil_dt;
  const a2 = cash_dt;
  const a  = a1 + a2;   // Tổng nhiên liệu

  const nb_caudong = c.cp_nb_caudong || 0;
  const nb_ben     = c.cp_nb_ben     || 0;
  const nb_bocxep  = c.cp_nb_bocxep  || 0;
  const tinh_caudong = c.cp_tinh_caudong || 0;
  const tinh_ben     = c.cp_tinh_ben     || 0;
  const tinh_bocxep  = c.cp_tinh_bocxep  || 0;
  const ruaxe        = c.cp_ruaxe        || 0;

  const b_total = nb_caudong + nb_ben + nb_bocxep;
  const c_total = tinh_caudong + tinh_ben + tinh_bocxep;
  const d_total = ruaxe;
  const tong_cong = a + b_total + c_total + d_total;
  const con_lai   = tong_cong - a1;  // tiền mặt cần hoàn cho lái xe

  const fmt = (n) => n > 0 ? n : '-';

  const data = [
    ...headerRows('BẢNG TỔNG KẾT CHI PHÍ XE', r.bien_so, r.tai_trong, tenTaiXe, monthNum, year),
    ['STT', 'DIỄN GIẢI', 'SỐ TIỀN', 'HOÁ ĐƠN', 'GHI CHÚ'],
    ['A', 'Chi phí nhiên liệu', '', '', ''],
    ['A1', 'Mua qua thẻ PV Oil (chuyển khoản)', fmt(a1), '', ''],
    ['A2', 'Mua bằng tiền mặt (lái xe tự ứng)', fmt(a2), '', ''],
    ['B', 'Chi phí chuyển hàng ra bến - nội bộ', '', '', ''],
    ['1', 'Lệ phí cầu đường', fmt(nb_caudong), 'Vé thu lệ phí', ''],
    ['2', 'Phí vào bến', fmt(nb_ben), '', ''],
    ['3', 'Phí bốc xếp hàng hóa', fmt(nb_bocxep), '', ''],
    ['C', 'Chi phí chuyển hàng đến đại lý (Tỉnh)', '', '', ''],
    ['1', 'Lệ phí cầu đường', fmt(tinh_caudong), 'Vé thu lệ phí', ''],
    ['2', 'Chi phí khác', fmt(tinh_ben), '', ''],
    ['3', 'Phí bốc xếp', fmt(tinh_bocxep), '', ''],
    ['D', 'Rửa xe', fmt(ruaxe), '', ''],
    ['', 'Tổng cộng (A+B+C+D):', tong_cong, 'a', ''],
    ['', 'Thanh toán chuyển khoản (mua qua thẻ PV Oil):', a1, 'b', ''],
    ['', 'Còn phải thanh toán tiền mặt', con_lai > 0 ? con_lai : '-', 'c=a-b', ''],
    [],
    [`Bằng chữ: ${numToVietWords(tong_cong)}`],
    ...signatureRows(monthNum, year),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 6 }, { wch: 44 }, { wch: 16 }, { wch: 14 }, { wch: 20 }];
  // Format số tiền ở các dòng tổng
  const totalDataRows = [20, 21]; // 0-indexed: Tổng cộng, Thanh toán CK
  for (const ri of totalDataRows) {
    const cell = ws[XLSX.utils.encode_cell({ r: ri, c: 2 })];
    if (cell && typeof cell.v === 'number') cell.z = '#,##0';
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

// ── Export per-vehicle ────────────────────────────────────────────────────────
// cpMap: { [normPlate]: { cp_nb_caudong, ... } }
export function generateVehicleReport(summaryRow, detailRows, thang, cpMap) {
  const r         = summaryRow;
  const rows      = detailRows || [];
  const tenTaiXe  = rows[0]?.ten_tai_xe || '';
  const [year, month] = thang.split('-');
  const monthNum  = parseInt(month, 10);
  const cp        = (cpMap || {})[normPlate(r.bien_so)] || null;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetChiPhi(r, rows, monthNum, year, tenTaiXe, cp),      'Tong ket chi phi');
  XLSX.utils.book_append_sheet(wb, sheetBangKe(r, rows, monthNum, year, tenTaiXe),          'Bang ke hoa don');
  XLSX.utils.book_append_sheet(wb, sheetNguyenLieu(r, rows, monthNum, year, tenTaiXe),      'Tong ket NL');

  const bienSoFile = r.bien_so.replace(/[^A-Za-z0-9]/g, '_');
  downloadXlsx(wb, `bao-cao-xe_${bienSoFile}_T${month}-${year}.xlsx`);
}

// ── Export fleet-wide báo cáo đoàn xe ────────────────────────────────────────
export function generateFleetReport(allRows, thang, cpMap) {
  const [year, month] = thang.split('-');
  const monthNum = parseInt(month, 10);
  const cp = cpMap || {};

  const headers = [
    'STT', 'Biển số xe', 'Tải trọng', 'Km đầu', 'Km cuối', 'Km thực tế',
    'ĐM (L/100km)', 'NL ĐM (Lít)', 'NL tiêu thụ (Lít)', 'Dầu vượt ĐM (Lít)',
    'XD Thẻ PVOil (CK)', 'XD Tiền mặt',
    'CP nội bộ', 'CP tỉnh', 'Rửa xe',
    'TỔNG CHI PHÍ', 'CÒN PHẢI TRẢ TM',
  ];

  const dataRows = allRows.map((r, i) => {
    const c = cp[normPlate(r.bien_so)] || {};
    const a1 = r.pvoil_dt || 0;
    const a2 = r.cash_dt  || (r.tong_dt - (r.pvoil_dt || 0)) || 0;
    const nb   = (c.cp_nb_caudong || 0) + (c.cp_nb_ben || 0) + (c.cp_nb_bocxep || 0);
    const tinh = (c.cp_tinh_caudong || 0) + (c.cp_tinh_ben || 0) + (c.cp_tinh_bocxep || 0);
    const rua  = c.cp_ruaxe || 0;
    const tong = a1 + a2 + nb + tinh + rua;
    const con  = tong - a1;
    return [
      i + 1, r.bien_so, r.tai_trong || '',
      r.km_dau || 0, r.km_cuoi || 0, r.km_thuc,
      r.dinh_muc || '', r.dm_tong_lit || 0, r.lit_tieu_thu || 0,
      r.chenh_lech > 0 ? +(r.chenh_lech * (r.km_thuc / 100) || 0).toFixed(2) : 0,
      a1, a2, nb, tinh, rua, tong, con,
    ];
  });

  // Dòng tổng
  const totals = ['', 'TỔNG CỘNG', '', '', '', 0, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const sumCols = [5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  for (const ci of sumCols) {
    totals[ci] = dataRows.reduce((s, row) => s + (Number(row[ci]) || 0), 0);
  }

  const title = `BÁO CÁO TỔNG HỢP CHI PHÍ VẬN HÀNH ĐOÀN XE - THÁNG ${monthNum}/${year}`;
  const data = [
    ['CÔNG TY CP VĂN PHÒNG PHẨM HỒNG HÀ'],
    ['TT Thương mại và Dịch vụ'],
    [],
    [title],
    [],
    headers,
    ...dataRows,
    totals,
    [],
    ['', '', '', '', `Hà Nội, ngày      tháng ${monthNum} năm ${year}`],
    [],
    ['Trưởng Đơn vị', '', '', '', 'Người lập'],
    [],
    [],
    [],
    ['Chu Quý Thật', '', '', '', 'Hoàng Kim Hằng'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bao cao doan xe');
  downloadXlsx(wb, `BC_Doan_Xe_T${month}-${year}.xlsx`);
}
