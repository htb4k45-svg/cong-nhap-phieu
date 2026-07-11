/**
 * Google Apps Script — Ghi ngược lái xe / phụ xe từ App vào Google Sheets
 *
 * CÁCH DEPLOY:
 *  1. Mở Google Sheets MT (hoặc tạo Apps Script riêng)
 *  2. Extensions → Apps Script → paste toàn bộ file này
 *  3. Deploy → New deployment → Web app
 *       Execute as: Me (tài khoản Google của bạn)
 *       Who has access: Anyone
 *  4. Copy URL → dán vào Vercel env var: APPS_SCRIPT_WRITE_URL
 *
 * REQUEST FORMAT (từ /api/dispatch-status):
 *  POST body JSON: {
 *    row_key:   string,   // = so_phieu
 *    so_phieu:  string,
 *    bo_phan:   string,   // "MT" | "B2B" | "GT"
 *    lai_xe:    string,
 *    giao_nhan: string,
 *    ngay_giao: string,   // YYYY-MM-DD
 *  }
 *
 * RESPONSE:
 *  { ok: true, updated: { sheet, tab, row, lai_xe_col, giao_nhan_col } }
 *  { ok: false, error: "..." }
 */

// ── Cấu hình Sheet IDs ────────────────────────────────────────────────────────
var SHEET_CONFIG = {
  MT:  { id: '1Qqbnewj_vb2k8mH3MghkTLzyoLUlsrm7BF1HEpW1nmQ' },
  GT:  { id: '1Qqbnewj_vb2k8mH3MghkTLzyoLUlsrm7BF1HEpW1nmQ' }, // GT cùng sheet với MT
  B2B: { id: '1B31os9te9uGe_-T8O2CswDeHyK1nap59v-djcw70IWw', gid: 0 }, // sheet "CADs B2B" — 1 tab sống, không tách theo tháng
};

// ── Entry point ───────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var data     = JSON.parse(e.postData.contents);
    var soPhieu  = (data.so_phieu  || data.row_key || '').trim();
    var boPhan   = (data.bo_phan   || 'B2B').trim().toUpperCase();
    var laiXe    = (data.lai_xe    || '').trim();
    var giaoNhan = (data.giao_nhan || '').trim();
    var ngayGiao = (data.ngay_giao || '').trim();

    if (!soPhieu) throw new Error('Thiếu so_phieu');

    var cfg = SHEET_CONFIG[boPhan] || SHEET_CONFIG['B2B'];
    var result = writeBack(cfg, soPhieu, laiXe, giaoNhan, ngayGiao);

    return jsonResponse({ ok: true, updated: result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Hàm ghi ngược ────────────────────────────────────────────────────────────
function writeBack(cfg, soPhieu, laiXe, giaoNhan, ngayGiao) {
  var ss = SpreadsheetApp.openById(cfg.id);

  // Sheet B2B (CADs) là 1 tab sống duy nhất theo gid cố định, không tách theo tháng.
  // Sheet MT/GT thì tách theo tab tháng → tìm theo tên tab.
  var sheet;
  if (cfg.gid !== undefined && cfg.gid !== null) {
    sheet = getSheetByGid(ss, cfg.gid);
    if (!sheet) throw new Error('Không tìm thấy tab gid=' + cfg.gid);
  } else {
    sheet = findSheet(ss, ngayGiao);
    if (!sheet) throw new Error('Không tìm thấy tab tháng: ' + ngayGiao);
  }

  // Lấy toàn bộ dữ liệu
  var data    = sheet.getDataRange().getValues();
  var numRows = data.length;

  // Sheet B2B (CADs) dùng "SO HD CN" làm khoá hàng (không có SO PHIEU/MA LENH).
  // Sheet MT/GT dùng SO PHIEU / MA LENH như cũ.
  var isB2BSchema = cfg.gid !== undefined && cfg.gid !== null;

  // Tìm hàng header
  var headerRow = -1;
  for (var i = 0; i < numRows; i++) {
    var rowNorm = data[i].map(function(c) { return norm(String(c)); });
    var isHeader = isB2BSchema
      ? rowNorm.some(function(h) { return h.indexOf('SO HD CN') >= 0; })
      : rowNorm.some(function(h) { return h.indexOf('SO PHIEU') >= 0 || h.indexOf('MA LENH') >= 0; });
    if (isHeader) { headerRow = i; break; }
  }
  if (headerRow < 0) throw new Error('Không tìm thấy header row');

  var headers = data[headerRow].map(function(c) { return norm(String(c)); });

  // Tìm column indices
  var soPhieuCol, maLenhCol;
  if (isB2BSchema) {
    soPhieuCol = findColIdx(headers, function(h) { return h.indexOf('SO HD CN') >= 0; });
    maLenhCol  = -1;
  } else {
    soPhieuCol = findColIdx(headers, function(h) { return h.indexOf('SO PHIEU') >= 0; });
    maLenhCol  = findColIdx(headers, function(h) { return h.indexOf('MA LENH') >= 0; });
  }
  var laiXeCol    = findColIdx(headers, function(h) { return h.indexOf('LAI XE') >= 0; });
  var giaoNhanCol = findLastColIdx(headers, function(h) { return h.indexOf('GIAO NHAN') >= 0 || h === 'PHU XE'; });

  if (laiXeCol < 0)    throw new Error('Không tìm thấy cột LÁI XE');
  if (giaoNhanCol < 0) throw new Error('Không tìm thấy cột GIAO NHẬN / PHỤ XE');

  // Tìm hàng chứa so_phieu
  var targetRow = -1;
  for (var r = headerRow + 1; r < numRows; r++) {
    var cellPhieu = String(data[r][soPhieuCol] || '').trim();
    var cellLenh  = maLenhCol >= 0 ? String(data[r][maLenhCol] || '').trim() : '';
    if (cellPhieu === soPhieu || cellLenh === soPhieu) {
      targetRow = r;
      break;
    }
  }
  if (targetRow < 0) throw new Error('Không tìm thấy so_phieu: ' + soPhieu);

  // Ghi vào cells (1-indexed trong Sheets API)
  var sheetRow = targetRow + 1; // 0-indexed → 1-indexed
  if (laiXe    !== '') sheet.getRange(sheetRow, laiXeCol    + 1).setValue(laiXe);
  if (giaoNhan !== '') sheet.getRange(sheetRow, giaoNhanCol + 1).setValue(giaoNhan);

  // Flush
  SpreadsheetApp.flush();

  return {
    sheet:        sheet.getName(),
    row:          sheetRow,
    lai_xe_col:   laiXeCol + 1,
    giao_nhan_col:giaoNhanCol + 1,
    lai_xe:       laiXe,
    giao_nhan:    giaoNhan,
  };
}

// ── Tìm sheet tab theo tháng ──────────────────────────────────────────────────
function findSheet(ss, ngayGiao) {
  var candidates = [];

  if (ngayGiao && /^\d{4}-\d{2}-\d{2}$/.test(ngayGiao)) {
    var d     = new Date(ngayGiao + 'T00:00:00');
    var month = d.getMonth() + 1;
    var y2    = String(d.getFullYear()).slice(-2);
    var m2    = String(month).padStart(2, '0');
    var m1    = String(month);
    candidates = [
      m2 + '.' + y2,
      m1 + '.' + y2,
      ' ' + m2 + '.' + y2,
      m2 + '.' + d.getFullYear(),
    ];
  }

  var sheets = ss.getSheets();

  // Thử tìm theo tháng trước
  for (var ci = 0; ci < candidates.length; ci++) {
    for (var si = 0; si < sheets.length; si++) {
      if (sheets[si].getName().trim() === candidates[ci].trim()) {
        return sheets[si];
      }
    }
  }

  // Fallback: tìm trong TẤT CẢ tab (quét toàn bộ)
  for (var si = 0; si < sheets.length; si++) {
    var s = sheets[si];
    // Bỏ qua tab tổng hợp hoặc tab không phải data
    var name = s.getName();
    if (name.toLowerCase().indexOf('tong') >= 0) continue;
    if (name.toLowerCase().indexOf('huong') >= 0) continue;
    return s; // Trả về tab đầu tiên tìm được
  }

  return null;
}

// ── Tìm tab theo gid cố định (dùng cho sheet kiểu mới: B2B, 1 tab sống) ────────
function getSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var si = 0; si < sheets.length; si++) {
    if (sheets[si].getSheetId() === gid) return sheets[si];
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function norm(s) {
  return s.normalize('NFD')
    .toUpperCase()
    .replace(/[̀-ͯ]/g, '')
    .replace(/Đ/g, 'D').replace(/đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColIdx(headers, fn) {
  for (var i = 0; i < headers.length; i++) {
    if (fn(headers[i])) return i;
  }
  return -1;
}

function findLastColIdx(headers, fn) {
  var last = -1;
  for (var i = 0; i < headers.length; i++) {
    if (fn(headers[i])) last = i;
  }
  return last;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Test chạy thử trong Apps Script Editor ────────────────────────────────────
function testWriteBack() {
  var result = writeBack(
    SHEET_CONFIG['B2B'],
    'V - WLHN 06/01',     // so_phieu để test — dùng giá trị "Số HĐ CN" thật có trong sheet
    'Nguyễn Văn A',       // lái xe
    'Trần Văn B',         // phụ xe
    '2026-06-24'          // ngày giao
  );
  Logger.log(JSON.stringify(result));
}
