// ── Cấu hình Google Sheets ───────────────────────────────────────────────────

export const SHEETS_CONFIG = {
  MT: {
    id: '1Qqbnewj_vb2k8mH3MghkTLzyoLUlsrm7BF1HEpW1nmQ',
    bo_phan: 'MT',
    don_vi_sp: 'thung',   // đơn vị trong sheet đã là thùng
    kho_default: null,
  },
  B2B: {
    id: '1cpSsk_kUbJ3Yy_g-UVNyvWrv0sHtdKRdxunpPwNstV4',
    bo_phan: 'B2B',
    don_vi_sp: 'ream',    // đơn vị trong sheet là Ream → ÷5 → ceil → thùng
    kho_default: 'ZKhoB2B',
  },
};

// ── Tên tab theo tháng ───────────────────────────────────────────────────────
// Thử nhiều pattern: "06.26", "6.26", " 06.26"

function getPossibleSheetNames(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const y2 = String(d.getFullYear()).slice(-2);
  const m2 = String(month).padStart(2, '0');
  const m1 = String(month);
  return [
    `${m2}.${y2}`,       // 06.26
    `${m1}.${y2}`,       // 6.26
    ` ${m2}.${y2}`,      // " 06.26" (có dấu cách)
    `${m2}.${d.getFullYear()}`, // 06.2026
  ];
}

// ── CSV parser ────────────────────────────────────────────────────────────────

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQ) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if      (ch === '"')  { inQ = true; }
      else if (ch === ',')  { row.push(field.trim()); field = ''; }
      else if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}

// ── Parse ngày ────────────────────────────────────────────────────────────────

function parseDateStr(val) {
  if (!val) return null;
  const s = String(val).trim();
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const p1 = parseInt(m[1]), p2 = parseInt(m[2]);
    // Google Sheets gviz xuất M/D/YYYY (US locale)
    // Phân biệt: nếu p1 > 12 → chắc chắn là DD/MM/YYYY
    //            nếu p2 > 12 → chắc chắn là M/D/YYYY
    //            ambiguous (cả hai ≤ 12) → mặc định M/D/YYYY (gviz default)
    if (p1 > 12) {
      // DD/MM/YYYY
      return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
    // M/D/YYYY (Google gviz default)
    return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  return null;
}

// ── Normalize header ─────────────────────────────────────────────────────────

function norm(h) {
  return String(h || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/Đ/g, 'D').replace(/đ/g, 'D')
    .replace(/\s+/g, ' ').trim();
}

// ── Parse LOẠI XUẤT → dac_diem ──────────────────────────────────────────────

function parseDacDiem(val) {
  if (!val) return 'xuat_moi';
  const v = norm(String(val));
  if (v.includes('BU') || v.includes('THIEU')) return 'xuat_thieu';
  if (v.includes('TRA') || v.includes('GUI'))  return 'xuat_gui';
  return 'xuat_moi';
}

// ── Xác định bo_phan từ mã lệnh ─────────────────────────────────────────────

function determineBoPhan(maLenh, defaultBoPhan) {
  if (!maLenh) return defaultBoPhan;
  const ml = norm(maLenh);
  if (ml.startsWith('MB') || ml.startsWith('HN')) return 'GT';
  if (ml.startsWith('TTMT'))                       return 'MT';
  return defaultBoPhan;
}

// ── Parse rows → phiếu ───────────────────────────────────────────────────────

function parseRows(rows, cfg) {
  const { bo_phan, don_vi_sp, kho_default } = cfg;
  const isB2B = bo_phan === 'B2B';

  // Tìm hàng header
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => {
      const n = norm(c);
      return n.includes('SO PHIEU') || n.includes('MA LENH');
    })) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map(norm);

  const findIdx     = (fn) => headers.findIndex(fn);
  const findLastIdx = (fn) => headers.reduce((acc, h, i) => fn(h) ? i : acc, -1);

  // ── Columns ──────────────────────────────────────────────────────────────
  const soPhieuIdx     = findIdx(h => h.includes('SO PHIEU'));
  const maLenhIdx      = findIdx(h => h.includes('MA LENH'));
  const ngayLenDonIdx  = findIdx(h => h.includes('LEN DON') || h.includes('DUA DON'));
  const ngayCanGiaoIdx = findIdx(h => h.includes('CAN GIAO') || h.includes('YEU CAU'));
  // NGÀY GIAO = app ghi lại sau khi hoàn thiện, không dùng để lọc điều xe
  const ngayGiaoIdx    = findLastIdx(h => h === 'NGAY GIAO');
  const khachIdx       = findIdx(h => h.includes('KHACH HANG') || h === 'KHACH');
  const khoIdx         = findIdx(h => h === 'KHO');
  const mstIdx         = findIdx(h => h === 'MST');
  const diaChiIdx      = findIdx(h => h.includes('DIA CHI'));
  const sdtIdx         = findIdx(h => h.includes('SDT'));
  const a3Idx          = findIdx(h => h.includes('A3'));
  const a4Idx          = findIdx(h => h.includes('A4'));
  const voIdx          = findIdx(h => (h === 'VO' || h.includes('NHOM VO') || h.includes('NHOVB')) && !h.includes('KHO'));
  // Giấy vệ sinh: "NHÓM GIẤY VS", "NHÓM GIẤY VỆ SINH", "GIẤY VỆ SINH"
  const gvsIdx         = findIdx(h => h.includes('GIAY') || h === 'GVS' || h.includes('VS'));
  // LOẠI XUẤT: lấy cột CUỐI (MT có 2 cột trùng tên)
  const loaiXuatIdx    = findLastIdx(h => h.includes('LOAI XUAT'));
  const ghiChuIdx      = findIdx(h => h.includes('GHI CHU'));
  const laiXeIdx       = findIdx(h => h.includes('LAI XE'));
  const giaoNhanIdx    = findIdx(h => h.includes('GIAO NHAN') || h === 'PHU XE');

  const result = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const soPhieu = soPhieuIdx >= 0 ? row[soPhieuIdx] : '';
    const maLenh  = maLenhIdx  >= 0 ? row[maLenhIdx]  : '';
    if (!soPhieu && !maLenh) continue;
    const rowKey = soPhieu || maLenh;

    // ── Ngày ───────────────────────────────────────────────────────────────
    const ngayLenDon     = parseDateStr(ngayLenDonIdx  >= 0 ? row[ngayLenDonIdx]  : null);
    const ngayCanGiao    = parseDateStr(ngayCanGiaoIdx >= 0 ? row[ngayCanGiaoIdx] : null);
    const ngayGiaoThucTe = parseDateStr(ngayGiaoIdx   >= 0 ? row[ngayGiaoIdx]    : null);

    // ── Đơn gấp: chênh lệch < 1 ngày ──────────────────────────────────────
    let donGap = false;
    if (ngayLenDon && ngayCanGiao) {
      const diffMs = new Date(ngayCanGiao + 'T00:00:00') - new Date(ngayLenDon + 'T00:00:00');
      donGap = diffMs < 24 * 60 * 60 * 1000; // < 1 ngày
    }

    // ── Sản phẩm ───────────────────────────────────────────────────────────
    const rawA3  = a3Idx  >= 0 ? parseFloat(row[a3Idx]  || 0) || 0 : 0;
    const rawA4  = a4Idx  >= 0 ? parseFloat(row[a4Idx]  || 0) || 0 : 0;
    const rawVo  = voIdx  >= 0 ? parseFloat(row[voIdx]  || 0) || 0 : 0;
    const rawGvs = gvsIdx >= 0 ? parseFloat(row[gvsIdx] || 0) || 0 : 0;

    // Quy đổi sang thùng
    let thungA3, thungA4, thungVo, thungGvs;
    if (isB2B) {
      // B2B: đầu vào là Ream → ÷5 → làm tròn lên → thùng
      thungA3  = rawA3  > 0 ? Math.ceil(rawA3  / 5) : 0;
      thungA4  = rawA4  > 0 ? Math.ceil(rawA4  / 5) : 0;
      thungVo  = rawVo  > 0 ? Math.ceil(rawVo  / 5) : 0;
      thungGvs = rawGvs > 0 ? Math.ceil(rawGvs / 5) : 0;
    } else {
      // MT/GT: đầu vào đã là thùng (sheet tự quy đổi)
      thungA3  = rawA3;
      thungA4  = rawA4;
      thungVo  = rawVo;
      thungGvs = rawGvs;
    }

    const tongThung = thungA3 + thungA4 + thungVo + thungGvs;

    // Build san_pham array
    const sanPham = [];
    if (rawA3  > 0) sanPham.push({ ma_sp:'A3',  ten_sp:'Sản phẩm A3',  so_luong: rawA3,  so_luong_thung: thungA3  });
    if (rawA4  > 0) sanPham.push({ ma_sp:'A4',  ten_sp:'Sản phẩm A4',  so_luong: rawA4,  so_luong_thung: thungA4  });
    if (rawVo  > 0) sanPham.push({ ma_sp:'VO',  ten_sp:'Nhóm Vở',      so_luong: rawVo,  so_luong_thung: thungVo  });
    if (rawGvs > 0) sanPham.push({ ma_sp:'GVS', ten_sp:'Giấy vệ sinh', so_luong: rawGvs, so_luong_thung: thungGvs });

    // ── Kho ────────────────────────────────────────────────────────────────
    const khoVal = khoIdx >= 0 ? (row[khoIdx] || '').trim() : '';
    const kho    = khoVal || kho_default || null;

    // ── LOẠI XUẤT ──────────────────────────────────────────────────────────
    const loaiXuatVal = loaiXuatIdx >= 0 ? (row[loaiXuatIdx] || '').trim() : '';
    const dacDiem     = parseDacDiem(loaiXuatVal);

    result.push({
      row_key:          rowKey,
      bo_phan:          determineBoPhan(maLenh, bo_phan),
      ma_lenh:          maLenh  || null,
      so_phieu:         soPhieu || rowKey,
      ngay_nhap:        ngayLenDon,    // backward compat alias
      ngay_len_don:     ngayLenDon,
      ngay_can_giao:    ngayCanGiao,
      ngay_giao_thuc:   ngayGiaoThucTe,
      don_gap:          donGap,
      ma_kh:            mstIdx    >= 0 ? (row[mstIdx]    || '').trim() || null : null,
      ten_kh:           khachIdx  >= 0 ? (row[khachIdx]  || '').trim() : '',
      dia_chi_giao:     diaChiIdx >= 0 ? (row[diaChiIdx] || '').trim() : '',
      sdt_nguoi_nhan:   sdtIdx    >= 0 ? (row[sdtIdx]    || '').trim() || null : null,
      ten_kho:          kho,
      lai_xe:           laiXeIdx   >= 0 ? (row[laiXeIdx]   || '').trim() || null : null,
      giao_nhan:        giaoNhanIdx>= 0 ? (row[giaoNhanIdx]|| '').trim() || null : null,
      san_pham:         sanPham,
      tong_thung:       tongThung,
      don_vi_sp:        isB2B ? 'ream' : 'thung',
      dac_diem:         dacDiem,
      ghi_chu:          ghiChuIdx >= 0 ? (row[ghiChuIdx] || '').trim() || null : null,
    });
  }

  return result;
}

// ── Fetch 1 tab từ Google Sheets ─────────────────────────────────────────────

async function fetchSheet(sheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    // Sheet không tồn tại → Google trả về HTML
    if (text.trim().startsWith('<!')) return null;
    // Sheet trống hoặc không đúng format → bỏ qua (normalize trước khi so sánh)
    const firstLineNorm = norm(text.split('\n')[0] || '');
    if (!firstLineNorm.includes('PHIEU') && !firstLineNorm.includes('LENH') && !firstLineNorm.includes('KHACH')) return null;
    return text;
  } catch {
    return null;
  }
}

// ── Danh sách tháng trong khoảng ngày ────────────────────────────────────────

function getMonthsInRange(fromDate, toDate) {
  const from = new Date(fromDate + 'T00:00:00');
  const to   = new Date(toDate   + 'T00:00:00');
  const months = [];
  let y = from.getFullYear(), m = from.getMonth();
  while (y < to.getFullYear() || (y === to.getFullYear() && m <= to.getMonth())) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}-01`);
    m++; if (m > 11) { m = 0; y++; }
  }
  return months;
}

// ── Main: fetch phiếu theo khoảng ngày ──────────────────────────────────────

export async function fetchPhieuByDateRange(fromDate, toDate) {
  const months    = getMonthsInRange(fromDate, toDate);
  const allPhieu  = [];
  const errors    = [];
  const fetched   = new Set();

  let debugCsv = null; // first successful CSV (2 rows only, for debugging)

  for (const [key, cfg] of Object.entries(SHEETS_CONFIG)) {
    for (const monthDate of months) {
      const sheetNames = getPossibleSheetNames(monthDate);
      let csv = null;

      for (const name of sheetNames) {
        const cacheKey = `${cfg.id}::${name}`;
        if (fetched.has(cacheKey)) { csv = '__skip'; break; }
        csv = await fetchSheet(cfg.id, name);
        if (csv) { fetched.add(cacheKey); break; }
      }

      if (!csv || csv === '__skip') {
        if (!csv) errors.push(`Không tìm thấy sheet ${monthDate.slice(0,7)} cho ${key}`);
        continue;
      }

      // Lưu 3 dòng đầu để debug
      if (!debugCsv) debugCsv = csv.split('\n').slice(0, 3).join('\n');

      const rows  = parseCSV(csv);
      const phieu = parseRows(rows, cfg);
      allPhieu.push(...phieu);
    }
  }

  // Dedup theo row_key
  const seen   = new Set();
  const unique = allPhieu.filter(p => {
    if (seen.has(p.row_key)) return false;
    seen.add(p.row_key);
    return true;
  });

  // Sort theo ngay_len_don desc (mới nhập lên đầu), null xuống cuối
  unique.sort((a, b) => {
    if (!a.ngay_len_don && !b.ngay_len_don) return 0;
    if (!a.ngay_len_don) return 1;
    if (!b.ngay_len_don) return -1;
    return b.ngay_len_don.localeCompare(a.ngay_len_don);
  });

  return { phieu: unique, errors: [...new Set(errors)], debug_csv: debugCsv };
}

// ── Backward compat ───────────────────────────────────────────────────────────

export async function fetchPhieuByDate(dateStr) {
  return fetchPhieuByDateRange(dateStr, dateStr);
}

export async function fetchAllPhieu(dateStr) {
  const { all, errors } = await fetchPhieuByDate(dateStr);
  return { phieu: all, errors };
}