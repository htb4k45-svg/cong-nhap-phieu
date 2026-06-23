/**
 * ============================================================
 * SYNC GOOGLE SHEETS → CỔNG NHẬP PHIẾU (HH VAN HANH)
 * ============================================================
 *
 * CÀI ĐẶT:
 * 1. Mở Google Sheet (B2B hoặc Thị Trường)
 * 2. Extensions → Apps Script → dán code này vào
 * 3. Điền VERCEL_URL bên dưới
 * 4. Chạy thử hàm `syncAll` một lần → cấp quyền
 * 5. Triggers → Add Trigger → syncAll → Time-driven → Every 15 minutes
 *
 * ============================================================
 */

// ── CẤU HÌNH — CHỈ CẦN SỬA PHẦN NÀY ────────────────────────
const VERCEL_URL = 'https://YOUR_VERCEL_DOMAIN.vercel.app'; // ← điền domain Vercel của bạn
// ─────────────────────────────────────────────────────────────


// ── Helper: parse ngày ────────────────────────────────────────

function parseDateValue(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  // dd/mm/yyyy
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`;
  // dd/mm
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) return `${new Date().getFullYear()}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  return null;
}

function normHeader(h) {
  return String(h || '').trim().toUpperCase().replace(/\s+/g,' ');
}

// ── Detect format (MT có MÃ LỆNH, B2B không có) ──────────────

function detectFormat(headers) {
  return headers.some(h => normHeader(h).includes('MÃ LỆNH')) ? 'MT' : 'B2B';
}

// ── Parse 1 sheet sang danh sách phiếu ───────────────────────

function parseSheet(sheet) {
  const data = sheet.getDataRange().getValues();

  // Tìm hàng header chứa 'SỐ PHIẾU'
  let headerIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i].some(c => normHeader(c).includes('SỐ PHIẾU'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = data[headerIdx].map(normHeader);
  const format  = detectFormat(headers);

  const idx = (fn) => headers.findIndex(fn);

  if (format === 'MT') {
    // ── MT / Thị Trường ──────────────────────────────────────
    const soPhieuIdx   = idx(h => h.includes('SỐ PHIẾU'));
    const maLenhIdx    = idx(h => h.includes('MÃ LỆNH'));
    const ngayDonIdx   = idx(h => h.includes('NGÀY') && (h.includes('ĐƯA') || h.includes('ĐƠN')));
    const khachIdx     = idx(h => h.includes('KHÁCH'));
    const mstIdx       = idx(h => h.includes('MST'));
    const diaChiIdx    = idx(h => h.includes('ĐỊA CHỈ'));
    const sdtIdx       = idx(h => h.includes('SĐT'));
    const laiXeIdx     = idx(h => h.includes('LÁI XE'));
    const giaoNhanIdx  = idx(h => h.includes('GIAO NHẬN'));
    const ngayDiIdx    = idx(h => (h.includes('NGÀY') && h.includes('ĐI')) || h === 'NGÀY ĐI');
    const ngayYcIdx    = idx(h => h.includes('YÊU CẦU'));
    const khoIdx       = idx(h => h.includes('KHO'));
    const ghiChuIdx    = idx(h => h.includes('GHI CHÚ'));
    const tongThungIdx = idx(h => h.includes('TỔNG THÙNG') || (h.includes('TỔNG') && h.includes('THÙNG')));

    const result = [];
    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      const soPhieu = row[soPhieuIdx];
      const maLenh  = maLenhIdx >= 0 ? row[maLenhIdx] : null;
      if (!soPhieu && !maLenh) continue;
      if (String(soPhieu||'').trim()==='' && String(maLenh||'').trim()==='') continue;

      const ngayNhap = parseDateValue(ngayDonIdx >= 0 ? row[ngayDonIdx] : null);
      const ngayCan  = parseDateValue(
        ngayDiIdx >= 0 && row[ngayDiIdx] ? row[ngayDiIdx] :
        ngayYcIdx >= 0 ? row[ngayYcIdx] : null
      );

      const tongThungVal = tongThungIdx >= 0 ? row[tongThungIdx] : null;
      const ghiChuVal    = ghiChuIdx >= 0 ? row[ghiChuIdx] : null;
      let ghiChu = '';
      if (tongThungVal) ghiChu += 'Tổng thùng: ' + tongThungVal;
      if (ghiChuVal)    ghiChu += (ghiChu ? ' | ' : '') + String(ghiChuVal).trim();

      const khoVal = khoIdx >= 0 && row[khoIdx] ? String(row[khoIdx]).trim() : null;

      result.push({
        bo_phan:       'MT',
        ma_lenh:       maLenh ? String(maLenh).trim() : null,
        so_phieu:      soPhieu ? String(soPhieu).trim() : String(maLenh).trim(),
        ngay_nhap:     ngayNhap,
        ma_kh:         mstIdx >= 0 && row[mstIdx] ? String(row[mstIdx]).trim() : null,
        ten_kh:        khachIdx >= 0 && row[khachIdx] ? String(row[khachIdx]).trim() : '',
        dia_chi_giao:  diaChiIdx >= 0 && row[diaChiIdx] ? String(row[diaChiIdx]).trim() : '',
        sdt_nguoi_nhan:sdtIdx >= 0 && row[sdtIdx] ? String(row[sdtIdx]).trim() : null,
        ngay_can_giao: ngayCan,
        ma_kho:        khoVal,
        ten_kho:       khoVal,
        lai_xe:        laiXeIdx >= 0 && row[laiXeIdx] ? String(row[laiXeIdx]).trim() : null,
        giao_nhan:     giaoNhanIdx >= 0 && row[giaoNhanIdx] ? String(row[giaoNhanIdx]).trim() : null,
        san_pham:      [],
        dac_diem:      'xuat_moi',
        ghi_chu:       ghiChu || null,
      });
    }
    return result;

  } else {
    // ── B2B ──────────────────────────────────────────────────
    const soPhieuIdx  = idx(h => h.includes('SỐ PHIẾU'));
    const ngayDonIdx  = idx(h => h.includes('NGÀY') && h.includes('ĐƠN'));
    const khachIdx    = idx(h => h.includes('KHÁCH'));
    const diaChiIdx   = idx(h => h.includes('ĐỊA CHỈ'));
    const ngayGiaoIdx = idx(h => h.includes('NGÀY GIAO') || h === 'NGÀY GIAO');
    const laiXeIdx    = idx(h => h.includes('LÁI XE'));
    const giaoNhanIdx = idx(h => h.includes('GIAO NHẬN'));
    const tongTienIdx = idx(h => h.includes('TỔNG TIỀN'));
    const khoIdx      = idx(h => h === 'KHO');

    const spStart   = diaChiIdx + 1;
    const spEnd     = tongTienIdx > 0 ? tongTienIdx : laiXeIdx > 0 ? laiXeIdx : headers.length;
    const spHeaders = headers.slice(spStart, spEnd);

    const result = [];
    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i];
      const soPhieu = row[soPhieuIdx];
      if (!soPhieu || String(soPhieu).trim() === '') continue;

      const ngayNhap = parseDateValue(ngayDonIdx >= 0 ? row[ngayDonIdx] : null);
      const ngayCan  = ngayGiaoIdx >= 0 ? parseDateValue(row[ngayGiaoIdx]) : null;

      const sanPham = [];
      for (let j = 0; j < spHeaders.length; j++) {
        const qty = row[spStart + j];
        if (qty && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0) {
          sanPham.push({ ma_sp: spHeaders[j], ten_sp: spHeaders[j], so_luong: parseFloat(qty) });
        }
      }

      const diaChiStr = String(row[diaChiIdx] || '').toUpperCase();
      let dacDiem = 'xuat_moi';
      if (diaChiStr.includes('TRẢ HÀNG THIẾU') || diaChiStr.includes('HÀNG THIẾU')) dacDiem = 'xuat_thieu';
      else if (diaChiStr.includes('TRẢ HÀNG') || diaChiStr.includes('GIAO HÀNG')) dacDiem = 'xuat_gui';

      result.push({
        bo_phan:      'B2B',
        so_phieu:     String(soPhieu).trim(),
        ngay_nhap:    ngayNhap,
        ten_kh:       row[khachIdx] ? String(row[khachIdx]).trim() : '',
        dia_chi_giao: row[diaChiIdx] ? String(row[diaChiIdx]).trim() : '',
        ngay_can_giao: ngayCan,
        ma_kho:       khoIdx >= 0 && row[khoIdx] ? String(row[khoIdx]).trim() : null,
        ten_kho:      khoIdx >= 0 && row[khoIdx] ? String(row[khoIdx]).trim() : null,
        lai_xe:       laiXeIdx >= 0 && row[laiXeIdx] ? String(row[laiXeIdx]).trim() : null,
        giao_nhan:    giaoNhanIdx >= 0 && row[giaoNhanIdx] ? String(row[giaoNhanIdx]).trim() : null,
        san_pham:     sanPham,
        dac_diem:     dacDiem,
      });
    }
    return result;
  }
}

// ── Sync 1 spreadsheet ────────────────────────────────────────

function syncAll() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheets  = ss.getSheets();
  let total = 0, success = 0, skipped = 0, errors = 0;

  sheets.forEach(sheet => {
    const phieuList = parseSheet(sheet);
    if (!phieuList.length) return;
    total += phieuList.length;

    try {
      const response = UrlFetchApp.fetch(`${VERCEL_URL}/api/import-b2b`, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ phieu_list: phieuList }),
        muteHttpExceptions: true,
      });

      const result = JSON.parse(response.getContentText());
      if (result.error) {
        Logger.log(`Sheet "${sheet.getName()}" lỗi: ${result.error}`);
        errors += phieuList.length;
      } else {
        success += result.success || 0;
        skipped += result.skipped || 0;
        errors  += (result.errors || []).length;
        Logger.log(`Sheet "${sheet.getName()}": +${result.success} mới, ${result.skipped} trùng`);
      }
    } catch (e) {
      Logger.log(`Sheet "${sheet.getName()}" exception: ${e.message}`);
      errors += phieuList.length;
    }
  });

  Logger.log(`\n=== KẾT QUẢ SYNC ===\nTổng: ${total} | Mới: ${success} | Trùng: ${skipped} | Lỗi: ${errors}`);

  // Thông báo nếu chạy thủ công
  try {
    SpreadsheetApp.getUi().alert(`✅ Sync xong!\n\nMới thêm: ${success}\nBỏ qua (trùng): ${skipped}\nLỗi: ${errors}`);
  } catch(e) { /* chạy từ trigger, không cần UI */ }
}

// ── Menu tùy chỉnh (xuất hiện khi mở sheet) ──────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚚 Hồng Hà Sync')
    .addItem('Sync ngay lên hệ thống', 'syncAll')
    .addToUi();
}
