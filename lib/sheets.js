// ── Cấu hình Google Sheets ───────────────────────────────────────────────────

export const SHEETS_CONFIG = {
  MT: {
    id: '1AMA8KmPo5O6tJghfemqU4v4W2elcMQu_kLYLaTRdZ7Q',
    bo_phan: 'MT',
  },
  B2B: {
    id: '1dmpIq6bUH-RX6IIU1a07SfFNnqxzNxbuKQmLRIwsOG0',
    bo_phan: 'B2B',
  },
};

// ── Tên sheet theo tháng ─────────────────────────────────────────────────────
// Thử nhiều pattern vì có sheet tên "06.26", "6.26", " 03.26" (có khoảng trắng)

function getPossibleSheetNames(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const year  = d.getFullYear();
  const y2 = String(year).slice(-2);
  const m2 = String(month).padStart(2, '0');
  const m1 = String(month);
  return [
    `${m2}.${y2}`,       // 06.26
    `${m1}.${y2}`,       // 6.26
    ` ${m2}.${y2}`,      // " 06.26" (có dấu cách đầu)
    `${m2}.${year}`,     // 06.2026
  ];
}

// ── CSV parser (hỗ trợ quoted fields + newline trong field) ──────────────────

export function parseCSV(text) {
  const rows = [];
  let row   = [];
  let field = '';
  let inQ   = false;

  for (let i = 0; i < text.length; i++) {
    const ch   = text[i];
    const next = text[i + 1];

    if (inQ) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            { inQ = false; }
      else                            { field += ch; }
    } else {
      if      (ch === '"')  { inQ = true; }
      else if (ch === ',')  { row.push(field.trim()); field = ''; }
      else if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else                  { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}

// ── Parse ngày từ chuỗi ──────────────────────────────────────────────────────

function parseDateStr(val) {
  if (!val) return null;
  const s = String(val).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// ── Normalize header ─────────────────────────────────────────────────────────

function norm(h) {
  return String(h || '').toUpperCase().replace(/\s+/g,' ').trim();
}

// ── Xác định bộ phận dựa trên mã lệnh ───────────────────────────────────────
// MB..., HN...  → GT
// TTMT...       → MT
// Còn lại       → giữ nguyên boPhan của sheet

function determineBoPhan(maLenh, defaultBoPhan) {
  if (!maLenh) return defaultBoPhan;
  const ml = maLenh.toUpperCase().trim();
  if (ml.startsWith('MB') || ml.startsWith('HN')) return 'GT';
  if (ml.startsWith('TTMT'))                       return 'MT';
  return defaultBoPhan;
}

// ── Parse rows → danh sách phiếu ─────────────────────────────────────────────

function parseRows(rows, boPhan) {
  // Tìm hàng header chứa 'SỐ PHIẾU'
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => norm(c).includes('SỐ PHIẾU'))) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map(norm);
  const idx = fn => headers.findIndex(fn);

  const soPhieuIdx   = idx(h => h.includes('SỐ PHIẾU'));
  const maLenhIdx    = idx(h => h.includes('MÃ LỆNH'));
  const ngayNhapIdx  = idx(h => h.includes('NGÀY') && (h.includes('ĐƯA') || h.includes('ĐƠN')));
  const khachIdx     = idx(h => h.includes('KHÁCH HÀNG') || (h.includes('KHÁCH') && !h.includes('MST')));
  const mstIdx       = idx(h => h.includes('MST'));
  const diaChiIdx    = idx(h => h.includes('ĐỊA CHỈ'));
  const sdtIdx       = idx(h => h.includes('SĐT'));
  const laiXeIdx     = idx(h => h.includes('LÁI XE') || h === 'LÁI XE' || h === 'LAI XE');
  const giaoNhanIdx  = idx(h => h.includes('GIAO NHẬN') || h === 'PHỤ XE' || h === 'PHU XE');
  const ngayDiIdx    = idx(h => h === 'NGÀY ĐI' || h === 'NGÀY GIAO' || (h.includes('NGÀY') && (h.includes('ĐI') || h.includes('GIAO')) && !h.includes('ĐƠN') && !h.includes('NHẬN')));
  const ngayYcIdx    = idx(h => h.includes('YÊU CẦU'));
  const khoIdx       = idx(h => h.includes('KHO'));
  const ghiChuIdx    = idx(h => h.includes('GHI CHÚ'));
  const tongThungIdx = idx(h => h.includes('TỔNG THÙNG') || (h.includes('TỔNG') && h.includes('THÙNG')));
  // B2B: cột sản phẩm giữa ĐỊA CHỈ và TỔNG TIỀN
  const tongTienIdx  = idx(h => h.includes('TỔNG TIỀN'));

  // B2B: cột ngày giao không có header, nằm ngay sau GIAO NHẬN
  const ngayGiaoAnonymousIdx = (ngayDiIdx === -1 && ngayYcIdx === -1 && giaoNhanIdx >= 0)
    ? giaoNhanIdx + 1
    : -1;

  const isMT = maLenhIdx >= 0 && boPhan === 'MT';

  const result = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const soPhieu = soPhieuIdx >= 0 ? row[soPhieuIdx] : '';
    const maLenh  = maLenhIdx  >= 0 ? row[maLenhIdx]  : '';
    if (!soPhieu && !maLenh) continue;

    const rowKey = maLenh || soPhieu; // dùng làm identifier

    const ngayNhap = parseDateStr(ngayNhapIdx >= 0 ? row[ngayNhapIdx] : null);
    const ngayCan  = parseDateStr(
      ngayDiIdx >= 0 && row[ngayDiIdx]              ? row[ngayDiIdx] :
      ngayYcIdx >= 0 && row[ngayYcIdx]              ? row[ngayYcIdx] :
      ngayGiaoAnonymousIdx >= 0 && row[ngayGiaoAnonymousIdx] ? row[ngayGiaoAnonymousIdx] :
      null
    );

    const khoVal      = khoIdx      >= 0 ? row[khoIdx]      || null : null;
    const ghiChuVal   = ghiChuIdx   >= 0 ? row[ghiChuIdx]   || null : null;
    const tongThungVal= tongThungIdx>= 0 ? row[tongThungIdx]|| null : null;
    let ghiChu = '';
    if (tongThungVal) ghiChu += `Tổng: ${tongThungVal}`;
    if (ghiChuVal)    ghiChu += (ghiChu ? ' | ' : '') + ghiChuVal;

    // B2B: lấy cột sản phẩm
    let sanPham = [];
    if (!isMT && diaChiIdx >= 0) {
      const spStart = diaChiIdx + 1;
      const spEnd   = tongTienIdx > 0 ? tongTienIdx : laiXeIdx > 0 ? laiXeIdx : headers.length;
      for (let j = spStart; j < spEnd; j++) {
        const qty = parseFloat(row[j]);
        if (!isNaN(qty) && qty > 0) {
          sanPham.push({ ma_sp: headers[j], ten_sp: headers[j], so_luong: qty });
        }
      }
    }

    // Đặc điểm (từ địa chỉ)
    const diaChiStr = String(diaChiIdx >= 0 ? row[diaChiIdx] || '' : '').toUpperCase();
    let dacDiem = 'xuat_moi';
    if (diaChiStr.includes('TRẢ HÀNG THIẾU') || diaChiStr.includes('HÀNG THIẾU')) dacDiem = 'xuat_thieu';
    else if (diaChiStr.includes('TRẢ HÀNG') || diaChiStr.includes('GIAO HÀNG'))   dacDiem = 'xuat_gui';

    result.push({
      row_key:       rowKey,
      bo_phan:       determineBoPhan(maLenh, boPhan),
      ma_lenh:       maLenh  || null,
      so_phieu:      soPhieu || rowKey,
      ngay_nhap:     ngayNhap,
      ma_kh:         mstIdx  >= 0 ? row[mstIdx]  || null : null,
      ten_kh:        khachIdx>= 0 ? row[khachIdx] || ''   : '',
      dia_chi_giao:  diaChiIdx >= 0 ? row[diaChiIdx] || '' : '',
      sdt:           sdtIdx   >= 0 ? row[sdtIdx]   || null : null,
      ngay_can_giao: ngayCan,
      ten_kho:       khoVal   ? String(khoVal).trim()   : null,
      lai_xe:        laiXeIdx   >= 0 ? row[laiXeIdx]   || null : null,
      giao_nhan:     giaoNhanIdx>= 0 ? row[giaoNhanIdx] || null : null,
      san_pham:      sanPham,
      dac_diem:      dacDiem,
      ghi_chu:       ghiChu || null,
    });
  }

  return result;
}

// ── Fetch 1 sheet từ Google Sheets ───────────────────────────────────────────

async function fetchSheet(sheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    // Nếu sheet không tồn tại, Google trả về HTML lỗi
    if (!text.includes('SỐ PHIẾU') && !text.includes('NGÀY')) return null;
    return text;
  } catch {
    return null;
  }
}

// ── Lấy danh sách các tháng trong khoảng ngày ───────────────────────────────

function getMonthsInRange(fromDate, toDate) {
  // Không dùng toISOString() để tránh lệch múi giờ UTC+7 → UTC
  const from = new Date(fromDate + 'T00:00:00');
  const to   = new Date(toDate   + 'T00:00:00');
  const months = [];
  let y = from.getFullYear(), m = from.getMonth();
  const endY = to.getFullYear(), endM = to.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}-01`);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return months;
}

// ── Main: fetch phiếu theo khoảng ngày ──────────────────────────────────────

export async function fetchPhieuByDateRange(fromDate, toDate) {
  const months   = getMonthsInRange(fromDate, toDate);
  const allPhieu = [];
  const errors   = [];
  const fetchedSheets = new Set(); // tránh fetch trùng cùng 1 tab

  for (const [key, cfg] of Object.entries(SHEETS_CONFIG)) {
    for (const monthDate of months) {
      const sheetNames = getPossibleSheetNames(monthDate);
      let csv = null;

      for (const name of sheetNames) {
        const cacheKey = `${cfg.id}::${name}`;
        if (fetchedSheets.has(cacheKey)) { csv = '__skip'; break; }
        csv = await fetchSheet(cfg.id, name);
        if (csv) { fetchedSheets.add(cacheKey); break; }
      }

      if (!csv || csv === '__skip') {
        if (!csv) errors.push(`Không tìm thấy sheet ${monthDate.slice(0,7)} cho ${key}`);
        continue;
      }

      const rows  = parseCSV(csv);
      const phieu = parseRows(rows, cfg.bo_phan);
      allPhieu.push(...phieu);
    }
  }

  // Dedup theo row_key (cùng phiếu có thể được thêm nhiều lần nếu range nhiều tháng)
  const seen   = new Set();
  const unique = allPhieu.filter(p => {
    if (seen.has(p.row_key)) return false;
    seen.add(p.row_key);
    return true;
  });

  // Lọc theo khoảng ngày
  // Dòng KHÔNG có ngày giao → luôn giữ lại (cần phân xe)
  // Dòng CÓ ngày giao     → chỉ lấy trong khoảng fromDate–toDate
  const filtered = unique.filter(p =>
    !p.ngay_can_giao || (p.ngay_can_giao >= fromDate && p.ngay_can_giao <= toDate)
  );

  return { phieu: filtered, all: unique, errors: [...new Set(errors)] };
}

// ── Backward compat: fetch theo 1 ngày ───────────────────────────────────────

export async function fetchPhieuByDate(dateStr) {
  return fetchPhieuByDateRange(dateStr, dateStr);
}

export async function fetchAllPhieu(dateStr) {
  const { all, errors } = await fetchPhieuByDate(dateStr);
  return { phieu: all, errors };
}
