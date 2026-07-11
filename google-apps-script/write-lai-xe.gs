/**
 * Apps Script: Nhận lệnh phân xe từ portal và ghi vào Google Sheet
 * Hỗ trợ cả 3 bộ phận: B2B, GT (đọc từ sheet B2B), MT
 *
 * CÁCH CÀI ĐẶT:
 * 1. Vào script.google.com → New project (standalone, KHÔNG cần mở từ sheet)
 * 2. Dán toàn bộ code này vào
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy URL → dán vào APPS_SCRIPT_WRITE_URL trong .env.local + Vercel
 *
 * LƯU Ý: Script này truy cập cả 2 spreadsheet bằng ID nên phải dùng
 * standalone project (không gắn vào 1 sheet cụ thể).
 */

// ── ID các spreadsheet ────────────────────────────────────────────────────────

const SPREADSHEETS = {
  // MT và một số GT (TTMT) → Sheet MT
  MT: '1AMA8KmPo5O6tJghfemqU4v4W2elcMQu_kLYLaTRdZ7Q',
  // B2B + GT (MB.../HN...) → Sheet B2B
  B2B: '1dmpIq6bUH-RX6IIU1a07SfFNnqxzNxbuKQmLRIwsOG0',
  GT:  '1dmpIq6bUH-RX6IIU1a07SfFNnqxzNxbuKQmLRIwsOG0',  // cùng sheet với B2B
};

// ── Tên cột lái xe trong từng sheet ──────────────────────────────────────────

const COL_LAI_XE = {
  MT:  { laiXe: 'LÁI XE', giaoNhan: 'GIAO NHẬN', soPhieu: 'MÃ LỆNH' },
  B2B: { laiXe: 'lái xe', giaoNhan: 'GIAO NHẬN', soPhieu: 'SỐ PHIẾU' },
  GT:  { laiXe: 'lái xe', giaoNhan: 'GIAO NHẬN', soPhieu: 'SỐ PHIẾU' },
};

// ── Tên sheet theo tháng ─────────────────────────────────────────────────────

function getSheetName(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}.${y}`;
}

// ── Tìm index cột theo tên header ────────────────────────────────────────────

function findColIndex(headerRow, colName) {
  const name = colName.toLowerCase().trim();
  for (let i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i]).toLowerCase().trim() === name) return i;
  }
  return -1;
}

// ── Tìm hàng header trong sheet ──────────────────────────────────────────────

function findHeaderRow(data, colNames) {
  for (let r = 0; r < Math.min(data.length, 10); r++) {
    const rowStr = data[r].map(c => String(c).toLowerCase()).join('|');
    if (colNames.some(c => rowStr.includes(c.toLowerCase()))) return r;
  }
  return -1;
}

// ── Ghi lái xe vào đúng dòng trong spreadsheet ───────────────────────────────

function writeLaiXeToSheet(spreadsheetId, colCfg, soPhieu, laiXe, giaoNhan, ngayGiao) {
  const ss = SpreadsheetApp.openById(spreadsheetId);

  // Ưu tiên sheet đúng tháng, fallback: tất cả sheet
  const preferredName = getSheetName(ngayGiao);
  let sheets = ss.getSheets();
  if (preferredName) {
    const preferred = ss.getSheetByName(preferredName);
    if (preferred) sheets = [preferred, ...sheets.filter(s => s.getName() !== preferredName)];
  }

  for (const sheet of sheets) {
    const data = sheet.getDataRange().getValues();
    const headerIdx = findHeaderRow(data, [colCfg.soPhieu, 'SỐ PHIẾU', 'MÃ LỆNH']);
    if (headerIdx === -1) continue;

    const header      = data[headerIdx];
    const soPhieuCol  = findColIndex(header, colCfg.soPhieu);
    const laiXeCol    = findColIndex(header, colCfg.laiXe);
    const giaoNhanCol = findColIndex(header, colCfg.giaoNhan);
    if (soPhieuCol === -1) continue;

    for (let r = headerIdx + 1; r < data.length; r++) {
      const cellVal = String(data[r][soPhieuCol]).trim();
      if (cellVal.toLowerCase() === soPhieu.trim().toLowerCase()) {
        if (laiXeCol    !== -1 && laiXe    !== undefined) sheet.getRange(r+1, laiXeCol+1).setValue(laiXe || '');
        if (giaoNhanCol !== -1 && giaoNhan !== undefined) sheet.getRange(r+1, giaoNhanCol+1).setValue(giaoNhan || '');
        return { success: true, sheet: sheet.getName(), row: r + 1 };
      }
    }
  }

  return { success: false, error: `Không tìm thấy phiếu "${soPhieu}" trong spreadsheet` };
}

// ── Web App entry point ───────────────────────────────────────────────────────

function doPost(e) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);

  try {
    const body = JSON.parse(e.postData.contents);
    const { row_key, so_phieu, bo_phan, lai_xe, giao_nhan, ngay_giao } = body;

    const identifier = so_phieu || row_key;
    if (!identifier) {
      out.setContent(JSON.stringify({ error: 'Thiếu so_phieu hoặc row_key' }));
      return out;
    }

    // Xác định spreadsheet theo bộ phận
    const bp            = (bo_phan || 'B2B').toUpperCase();
    const spreadsheetId = SPREADSHEETS[bp] || SPREADSHEETS.B2B;
    const colCfg        = COL_LAI_XE[bp]   || COL_LAI_XE.B2B;

    const result = writeLaiXeToSheet(spreadsheetId, colCfg, identifier, lai_xe, giao_nhan, ngay_giao);
    out.setContent(JSON.stringify(result));
  } catch (err) {
    out.setContent(JSON.stringify({ error: err.message }));
  }

  return out;
}

// ── Test thủ công trong Apps Script Editor ────────────────────────────────────

function testWriteB2B() {
  const result = writeLaiXeToSheet(
    SPREADSHEETS.B2B, COL_LAI_XE.B2B,
    'V-GPBANK 06/35', 'HUY', 'HOÀNG', '2026-06-02'
  );
  Logger.log(JSON.stringify(result));
}

function testWriteMT() {
  const result = writeLaiXeToSheet(
    SPREADSHEETS.MT, COL_LAI_XE.MT,
    'TTMT-001', 'BIÊN', 'LONG', '2026-06-02'
  );
  Logger.log(JSON.stringify(result));
}
