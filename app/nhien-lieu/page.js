'use client';
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────
function normPlate(raw) {
  if (!raw) return null;
  const c = String(raw).trim().replace(/[-. ]/g, '');
  if (c.length === 8) return `${c.slice(0,3)}-${c.slice(3,6)}.${c.slice(6,8)}`;
  return String(raw).trim();
}

function fmtNum(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function fmtDate(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtDateTime(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function excelDateToJS(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d;
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ── PVOIL Excel parser ────────────────────────────────────────────────────────
// Cấu trúc: header row 6 (0-indexed), sub-header row 7, data từ row 8
// Columns: [0]STT [1]Ngày GD [2]Số GD [3]Tài khoản [4]Tên tài xế [5]Biển KS
//          [6]ĐV KD [7]CHXD [8]ĐV [9]Mặt hàng [10]Số lượng
//          [11]Giá CK → [12]Tiền hàng [13]Thuế [14]Tổng DT (chua CK)
//          [15]Giá có CK → [16]Tiền hàng [17]Thuế [18]Tổng DT (co CK)
//          [19]Tên gọi tắt [20]Mẫu HĐ [21]Ký hiệu HĐ [22]Số HĐ [23]Ngày HĐ
//          [24]Tên ĐV bán [25]MST [26]Khu vực [27]Trạng thái
function parsePVOIL(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  // Tìm dòng header (có 'STT')
  let hRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c || '').toUpperCase().trim() === 'STT')) { hRow = i; break; }
  }
  if (hRow === -1) throw new Error('Không tìm thấy dòng header (STT)');

  const dataStart = hRow + 2; // bỏ qua sub-header row
  const records = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const stt = row[0];
    if (stt == null || String(stt).trim() === '') continue;
    if (isNaN(Number(stt))) continue; // dòng tổng cộng v.v.

    const rawPlate = row[5];
    const bien_so_raw = rawPlate ? String(rawPlate).trim() : null;
    const bien_so = normPlate(bien_so_raw);

    const ngayRaw = excelDateToJS(row[1]);
    const ngayHDRaw = excelDateToJS(row[23]);

    records.push({
      bien_so,
      bien_so_raw,
      ngay_gd:          ngayRaw ? ngayRaw.toISOString() : null,
      so_gd:            row[2] != null ? String(row[2]) : null,
      tai_khoan:        row[3] != null ? String(row[3]) : null,
      ten_tai_xe:       row[4] != null ? String(row[4]).trim() : null,
      don_vi_kd:        row[6] != null ? String(row[6]).trim() : null,
      chxd:             row[7] != null ? String(row[7]).trim() : null,
      don_vi:           row[8] != null ? String(row[8]).trim() : null,
      mat_hang:         row[9] != null ? String(row[9]).trim() : null,
      so_luong_lit:     Number(row[10]) || 0,
      gia_chua_ck:      Number(row[11]) || null,
      tien_hang_chua_ck: Number(row[12]) || null,
      thue_gtgt_chua_ck: Number(row[13]) || null,
      tong_dt_chua_ck:  Number(row[14]) || null,
      gia_co_ck:        Number(row[15]) || null,
      tien_hang_co_ck:  Number(row[16]) || null,
      thue_gtgt_co_ck:  Number(row[17]) || null,
      tong_dt_co_ck:    Number(row[18]) || null,
      ten_goi_tat:      row[19] != null ? String(row[19]).trim() : null,
      mau_so_hd:        row[20] != null ? String(row[20]).trim() : null,
      ky_hieu_hd:       row[21] != null ? String(row[21]).trim() : null,
      so_hd:            row[22] != null ? String(row[22]) : null,
      ngay_hd:          ngayHDRaw ? ngayHDRaw.toISOString().split('T')[0] : null,
      ten_dv_ban:       row[24] != null ? String(row[24]).trim() : null,
      mst_dv_ban:       row[25] != null ? String(row[25]).trim() : null,
      khu_vuc:          row[26] != null ? String(row[26]).trim() : null,
      trang_thai:       row[27] != null ? String(row[27]).trim() : null,
    });
  }
  return records;
}

// ── Km định mức parser ────────────────────────────────────────────────────────
// Columns: [0]Biển số [1]Tài xế [2]Tải trọng [3]Km đầu [4]Km cuối
//          [5]ĐM khoán [6]Tồn đầu kỳ [7]Tồn cuối kỳ
function parseKmDinhMuc(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  let hRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c || '').toUpperCase().includes('BIỂN SỐ')
                       || String(c || '').toUpperCase().includes('BIEN SO'))) {
      hRow = i; break;
    }
  }
  if (hRow === -1) throw new Error('Không tìm thấy dòng header (Biển số)');

  const records = [];
  for (let i = hRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawPlate = row[0];
    if (!rawPlate || String(rawPlate).trim() === '') continue;
    const bsStr = String(rawPlate).trim();
    // Bỏ qua dòng ghi chú
    if (bsStr.startsWith('Lưu') || bsStr.length < 4) continue;

    records.push({
      bien_so:          normPlate(bsStr),
      tai_trong:        row[2] != null ? String(row[2]).trim() : null,
      km_dau:           row[3] != null ? parseInt(row[3]) || null : null,
      km_cuoi:          row[4] != null ? parseInt(row[4]) || null : null,
      dinh_muc_l_100km: row[5] != null ? parseFloat(row[5]) || null : null,
      ton_dau_lit:      row[6] != null ? parseFloat(row[6]) || null : null,
      ton_cuoi_lit:     row[7] != null ? parseFloat(row[7]) || null : null,
    });
  }
  return records;
}

// ── UI Style helpers ──────────────────────────────────────────────────────────
const card = { background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 16 };
const btn = (color = '#2563eb') => ({
  padding: '8px 18px', background: color, color: 'white', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
});
const input = {
  border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13,
};

// ════════════════════════════════════════════════════════════════════════════
export default function NhienLieuPage() {
  const [tab, setTab] = useState('bao-cao'); // 'import-pvoil' | 'import-km' | 'bao-cao'

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>⛽ Quản lý nhiên liệu</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Import PVOIL & định mức km, báo cáo tiêu thụ và cảnh báo vượt định mức
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
          {[
            { id: 'bao-cao',      label: '📊 Báo cáo tháng' },
            { id: 'import-pvoil', label: '📥 Import PVOIL' },
            { id: 'import-km',    label: '🛣 Import Km định mức' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
                color: tab === t.id ? '#2563eb' : '#64748b',
                background: 'transparent', marginBottom: -2,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'bao-cao'      && <TabBaoCao />}
        {tab === 'import-pvoil' && <TabImportPVOIL />}
        {tab === 'import-km'    && <TabImportKm />}
      </div>
    </div>
  );
}

// ── Xuất CSV helper ──────────────────────────────────────────────────────────
function toCSV(rows2d, filename) {
  const csv = rows2d.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const DETAIL_HEADERS = [
  ['Biển số',               false],
  ['Ngày giao dịch',        false],
  ['Tên tài xế',            false],
  ['Đơn vị kinh doanh',     false],
  ['Mặt hàng',              false],
  ['Đơn vị',                false],
  ['Số lít thực tế',        true],
  ['Đơn giá chưa CK',       true],
  ['Thành tiền chưa CK',    true],
  ['Đơn giá có CK',         true],
  ['Thành tiền có CK',      true],
  ['Ký hiệu HĐ',            false],
  ['Số hóa đơn',            false],
  ['Ngày hóa đơn',          false],
  ['Tên đơn vị bán',        false],
  ['Mã số thuế ĐV bán',     false],
];

function detailRow(d, bien_so) {
  return [
    bien_so || d.bien_so || '',
    fmtDateTime(d.ngay_gd), d.ten_tai_xe || '', d.don_vi_kd || '',
    d.mat_hang || '', d.don_vi || '',
    d.so_luong_lit ?? '',
    d.gia_chua_ck ?? '', d.tien_hang_chua_ck ?? '',
    d.gia_co_ck ?? '', d.tien_hang_co_ck ?? '',
    d.ky_hieu_hd || '', d.so_hd || '', fmtDate(d.ngay_hd),
    d.ten_dv_ban || '', d.mst_dv_ban || '',
  ];
}

// ══════════════════════════════════════════════════════════
// Tab 1: BÁO CÁO
// ══════════════════════════════════════════════════════════
function TabBaoCao() {
  const [thang, setThang]       = useState(thisMonth());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  // expanded: biển số đang xổ chi tiết (inline)
  const [expanded, setExpanded] = useState(null);
  // detailCache: { [bien_so]: { rows, loading } }
  const [cache, setCache]       = useState({});
  // checked: Set of bien_so được tick chọn
  const [checked, setChecked]   = useState(new Set());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setExpanded(null); setCache({}); setChecked(new Set());
    try {
      const res  = await fetch(`/api/nhien-lieu/bao-cao?thang=${thang}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [thang]);

  useEffect(() => { load(); }, [load]);

  // Mở/đóng chi tiết inline cho 1 xe
  const toggleExpand = async (bien_so) => {
    if (expanded === bien_so) { setExpanded(null); return; }
    setExpanded(bien_so);
    if (cache[bien_so]) return; // đã cache
    setCache(c => ({ ...c, [bien_so]: { rows: null, loading: true } }));
    try {
      const res  = await fetch(`/api/nhien-lieu/bao-cao?thang=${thang}&bien_so=${encodeURIComponent(bien_so)}`);
      const json = await res.json();
      setCache(c => ({ ...c, [bien_so]: { rows: json.detail || [], loading: false } }));
    } catch {
      setCache(c => ({ ...c, [bien_so]: { rows: [], loading: false } }));
    }
  };

  // Checkbox toggle
  const toggleCheck = (e, bien_so) => {
    e.stopPropagation();
    setChecked(prev => {
      const next = new Set(prev);
      next.has(bien_so) ? next.delete(bien_so) : next.add(bien_so);
      return next;
    });
  };

  const toggleAll = (e) => {
    if (!data?.rows) return;
    if (checked.size === data.rows.length) setChecked(new Set());
    else setChecked(new Set(data.rows.map(r => r.bien_so)));
  };

  // Xuất CSV tổng hợp (các xe đã check, hoặc tất cả)
  const exportSummary = (subset) => {
    const rows = subset ? data.rows.filter(r => checked.has(r.bien_so)) : data.rows;
    if (!rows?.length) return;
    const headers = ['Biển số','Tải trọng','ĐM (l/100km)','Km đầu','Km cuối','Km thực','Tồn đầu (l)','Lít đổ','Tồn cuối (l)','Lít tiêu thụ','ĐM tổng lít','TH thực (l/100km)','Chênh lệch','Tiền hàng','Tổng DT','Trạng thái'];
    const data2d = rows.map(r => [
      r.bien_so, r.tai_trong, r.dinh_muc ?? '', r.km_dau ?? '', r.km_cuoi ?? '', r.km_thuc,
      r.ton_dau, r.lit_do, r.ton_cuoi, r.lit_tieu_thu, r.dm_tong_lit ?? '',
      r.tieu_hao_thuc ?? '', r.chenh_lech ?? '', r.tien_hang, r.tong_dt,
      r.vuot_dm ? 'VƯỢT ĐM' : '',
    ]);
    toCSV([headers, ...data2d], `tong-hop-nhien-lieu_${thang}.csv`);
  };

  // Xuất CSV chi tiết giao dịch cho các xe đã check
  const exportCheckedDetail = async () => {
    if (!checked.size) return;
    setExporting(true);
    const plates = [...checked];
    // Fetch detail cho xe chưa có trong cache
    const toFetch = plates.filter(bs => !cache[bs]);
    await Promise.all(toFetch.map(async bs => {
      const res  = await fetch(`/api/nhien-lieu/bao-cao?thang=${thang}&bien_so=${encodeURIComponent(bs)}`);
      const json = await res.json();
      setCache(c => ({ ...c, [bs]: { rows: json.detail || [], loading: false } }));
      return { bs, rows: json.detail || [] };
    }));
    // Lấy từ cache (sau khi fetch xong)
    const allRows = [];
    for (const bs of plates) {
      const rows = cache[bs]?.rows || [];
      for (const d of rows) allRows.push(detailRow(d, bs));
    }
    toCSV([DETAIL_HEADERS.map(([h]) => h), ...allRows], `chi-tiet-nhien-lieu_${thang}.csv`);
    setExporting(false);
  };

  const nChecked = checked.size;
  const allChecked = data?.rows?.length > 0 && checked.size === data.rows.length;

  return (
    <div>
      {/* Bộ lọc */}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Tháng</label>
          <input type="month" value={thang} onChange={e => setThang(e.target.value)} style={input} />
        </div>
        <button onClick={load} style={btn()}>Tải báo cáo</button>
        <button onClick={() => exportSummary(false)} disabled={!data?.rows?.length}
          style={{ ...btn('#475569'), opacity: data?.rows?.length ? 1 : 0.4 }}>
          ⬇ Xuất tổng hợp (tất cả)
        </button>
        {nChecked > 0 && (
          <>
            <button onClick={() => exportSummary(true)}
              style={btn('#7c3aed')}>
              ⬇ Tổng hợp ({nChecked} xe)
            </button>
            <button onClick={exportCheckedDetail} disabled={exporting}
              style={{ ...btn('#059669'), opacity: exporting ? 0.6 : 1 }}>
              {exporting ? 'Đang xuất...' : `⬇ Chi tiết GD (${nChecked} xe)`}
            </button>
            <button onClick={() => setChecked(new Set())}
              style={{ ...btn('#94a3b8') }}>
              Bỏ chọn
            </button>
          </>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Đang tải...</div>}
      {error   && <div style={{ padding: 16, color: '#dc2626', background: '#fef2f2', borderRadius: 8, marginBottom: 12 }}>Lỗi: {error}</div>}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Tổng xe',       val: data.summary.tong_xe,                color: '#2563eb' },
              { label: 'Xe vượt ĐM',    val: data.summary.xe_vuot_dm,             color: '#dc2626' },
              { label: 'Tổng lít đổ',   val: fmtNum(data.summary.tong_lit_do, 1), color: '#7c3aed' },
              { label: 'Tổng km',       val: fmtNum(data.summary.tong_km),         color: '#059669' },
              { label: 'Tổng tiền (đ)', val: fmtNum(data.summary.tong_tien),       color: '#d97706' },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center', marginBottom: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Bảng tổng hợp */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#64748b', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span>☑ Tick chọn xe → xuất CSV. Bấm vào hàng để xem chi tiết giao dịch ngay bên dưới.</span>
              {nChecked > 0 && <span style={{ color: '#7c3aed', fontWeight: 600 }}>Đã chọn {nChecked} xe</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 10px', width: 36 }}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                    </th>
                    {[
                      'Biển số','Tải trọng','ĐM (l/100km)','Km đầu','Km cuối','Km thực',
                      'Tồn đầu (l)','Lít đổ','Tồn cuối (l)','Lít tiêu thụ',
                      'ĐM tổng lít','TH thực (l/100km)','Chênh lệch',
                      'Tiền hàng','Tổng DT','',
                    ].map((h, i) => (
                      <th key={i} style={{ padding: '8px 6px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.rows || []).map(r => {
                    const isExp  = expanded === r.bien_so;
                    const isCk   = checked.has(r.bien_so);
                    const det    = cache[r.bien_so];
                    return (
                      <>
                        <tr key={r.bien_so}
                          onClick={() => toggleExpand(r.bien_so)}
                          style={{
                            borderBottom: isExp ? 'none' : '1px solid #f1f5f9',
                            cursor: 'pointer',
                            background: isExp ? '#dbeafe' : isCk ? '#f5f3ff' : r.vuot_dm ? '#fff7f7' : 'white',
                          }}>
                          <td style={{ padding: '7px 10px' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isCk} onChange={e => toggleCheck(e, r.bien_so)} style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '7px 6px', fontWeight: 700, color: isExp ? '#1d4ed8' : '#2563eb' }}>{r.bien_so}</td>
                          <td style={{ padding: '7px 6px', color: '#64748b' }}>{r.tai_trong}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right' }}>{r.dinh_muc ?? '—'}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right' }}>{fmtNum(r.km_dau)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right' }}>{fmtNum(r.km_cuoi)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.km_thuc)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748b' }}>{fmtNum(r.ton_dau, 1)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{fmtNum(r.lit_do, 1)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748b' }}>{fmtNum(r.ton_cuoi, 1)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(r.lit_tieu_thu, 1)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', color: '#64748b' }}>{r.dm_tong_lit != null ? fmtNum(r.dm_tong_lit, 1) : '—'}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: r.vuot_dm ? '#dc2626' : (r.tieu_hao_thuc != null ? '#059669' : '#94a3b8') }}>
                            {r.tieu_hao_thuc != null ? fmtNum(r.tieu_hao_thuc, 1) : '—'}
                          </td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600, color: r.vuot_dm ? '#dc2626' : (r.chenh_lech != null && r.chenh_lech < 0 ? '#059669' : '#94a3b8') }}>
                            {r.chenh_lech != null ? (r.chenh_lech > 0 ? `+${fmtNum(r.chenh_lech, 1)}` : fmtNum(r.chenh_lech, 1)) : '—'}
                          </td>
                          <td style={{ padding: '7px 6px', textAlign: 'right' }}>{fmtNum(r.tien_hang)}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.tong_dt)}</td>
                          <td style={{ padding: '7px 6px', whiteSpace: 'nowrap' }}>
                            {r.vuot_dm && <span style={{ padding: '2px 5px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 10, fontWeight: 700, marginRight: 4 }}>VƯỢT ĐM</span>}
                            <span style={{ color: isExp ? '#1d4ed8' : '#94a3b8', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
                          </td>
                        </tr>

                        {/* ── Inline detail row ── */}
                        {isExp && (
                          <tr key={r.bien_so + '_det'}>
                            <td colSpan={17} style={{ padding: 0, background: '#f0f7ff', borderBottom: '2px solid #2563eb' }}>
                              <InlineDetail summaryRow={r} det={det} thang={thang} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Inline detail bên trong table ────────────────────────────────────────────
function InlineDetail({ summaryRow: r, det, thang }) {
  const rows = det?.rows || [];
  const isLoading = det?.loading !== false;

  const exportThis = () => {
    if (!rows.length) return;
    toCSV([DETAIL_HEADERS.map(([h]) => h), ...rows.map(d => detailRow(d, r.bien_so))],
          `chi-tiet-xe_${r.bien_so}_${thang}.csv`);
  };

  return (
    <div>
      {/* Mini header */}
      <div style={{ padding: '8px 16px', background: '#1e40af', color: 'white', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🚗 {r.bien_so}</span>
        <span style={{ fontSize: 12, opacity: .8 }}>{r.tai_trong}</span>
        <span style={{ fontSize: 12 }}>Km: <b>{fmtNum(r.km_dau)} → {fmtNum(r.km_cuoi)}</b> ({fmtNum(r.km_thuc)} km)</span>
        <span style={{ fontSize: 12 }}>Lít đổ: <b>{fmtNum(r.lit_do, 1)}</b> | Tiêu thụ: <b>{fmtNum(r.lit_tieu_thu, 1)} l</b></span>
        {r.tieu_hao_thuc != null && (
          <span style={{ fontSize: 12 }}>
            TH thực: <b style={{ color: r.vuot_dm ? '#fca5a5' : '#86efac' }}>{fmtNum(r.tieu_hao_thuc, 1)} l/100km</b>
            {r.dinh_muc && <span style={{ opacity: .7 }}> / ĐM {r.dinh_muc}</span>}
            {r.vuot_dm && <span style={{ marginLeft: 6, padding: '1px 7px', background: '#dc2626', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>VƯỢT ĐM +{fmtNum(r.chenh_lech, 1)}</span>}
          </span>
        )}
        <button onClick={exportThis} disabled={!rows.length || isLoading}
          style={{ marginLeft: 'auto', padding: '4px 12px', background: '#059669', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, opacity: rows.length ? 1 : 0.5 }}>
          ⬇ Xuất CSV xe này
        </button>
      </div>

      {isLoading && <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Đang tải giao dịch...</div>}

      {!isLoading && (
        <div style={{ overflowX: 'auto', maxHeight: 340 }}>
          {!rows.length
            ? <div style={{ padding: 20, color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>Không có giao dịch</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#eff6ff', borderBottom: '2px solid #bfdbfe' }}>
                    {DETAIL_HEADERS.slice(1).map(([h, right], i) => (
                      <th key={i} style={{ padding: '6px 8px', textAlign: right ? 'right' : 'left', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #dbeafe', background: i % 2 === 0 ? 'white' : '#f0f7ff' }}>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{fmtDateTime(d.ngay_gd)}</td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{d.ten_tai_xe || '—'}</td>
                      <td style={{ padding: '4px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.don_vi_kd || '—'}</td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{d.mat_hang || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{d.don_vi || '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmtNum(d.so_luong_lit, 1)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#64748b' }}>{fmtNum(d.gia_chua_ck)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtNum(d.tien_hang_chua_ck)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#64748b' }}>{fmtNum(d.gia_co_ck)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(d.tien_hang_co_ck)}</td>
                      <td style={{ padding: '4px 8px' }}>{d.ky_hieu_hd || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{d.so_hd || '—'}</td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{fmtDate(d.ngay_hd)}</td>
                      <td style={{ padding: '4px 8px', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.ten_dv_ban || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{d.mst_dv_ban || '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#dbeafe', borderTop: '2px solid #93c5fd', fontWeight: 700, fontSize: 11 }}>
                    <td colSpan={4} style={{ padding: '5px 8px', color: '#1e40af' }}>TỔNG ({rows.length} GD)</td>
                    <td style={{ padding: '5px 8px' }}></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: '#7c3aed' }}>{fmtNum(rows.reduce((s,d) => s+(d.so_luong_lit||0),0),1)}</td>
                    <td style={{ padding: '5px 8px' }}></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(rows.reduce((s,d) => s+(d.tien_hang_chua_ck||0),0))}</td>
                    <td style={{ padding: '5px 8px' }}></td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(rows.reduce((s,d) => s+(d.tien_hang_co_ck||0),0))}</td>
                    <td colSpan={5} style={{ padding: '5px 8px' }}></td>
                  </tr>
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Tab 2: IMPORT PVOIL
// ══════════════════════════════════════════════════════════
function TabImportPVOIL() {
  const [thang, setThang]       = useState(thisMonth());
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState(null);

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
        const records = parsePVOIL(wb);
        setPreview(records);
        setMsg({ type: 'info', text: `Đọc được ${records.length} giao dịch. Nhấn "Import" để lưu.` });
      } catch (err) {
        setMsg({ type: 'error', text: 'Lỗi đọc file: ' + err.message });
        setPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const doImport = async () => {
    if (!preview?.length) return;
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/nhien-lieu/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, records: preview, replace: true }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMsg({ type: 'ok', text: `✅ Import thành công ${json.inserted} giao dịch vào tháng ${thang}.` });
      setPreview(null);
    } catch (err) {
      setMsg({ type: 'error', text: 'Lỗi: ' + err.message });
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#1e293b' }}>Import bảng kê PVOIL</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Upload file Excel từ PVOIL (BẢNG KÊ CHI TIẾT MUA HÀNG THEO KHÁCH). Hệ thống sẽ xóa dữ liệu cũ của tháng đã chọn rồi import mới.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Tháng</label>
            <input type="month" value={thang} onChange={e => setThang(e.target.value)} style={input} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>File PVOIL (.xls/.xlsx)</label>
            <input type="file" accept=".xls,.xlsx" onChange={onFile} style={{ fontSize: 13 }} />
          </div>
          {preview?.length > 0 && (
            <button onClick={doImport} disabled={loading} style={btn('#059669')}>
              {loading ? 'Đang import...' : `⬆ Import ${preview.length} dòng`}
            </button>
          )}
        </div>
        {msg && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13,
            background: msg.type === 'ok' ? '#f0fdf4' : msg.type === 'error' ? '#fef2f2' : '#eff6ff',
            color:      msg.type === 'ok' ? '#166534' : msg.type === 'error' ? '#dc2626' : '#1d4ed8' }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Preview table */}
      {preview?.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>
            Xem trước {preview.length} giao dịch (tháng {thang})
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 400 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  {['Biển số (chuẩn)','Biển số (gốc)','Ngày GD','Tên tài xế','Mặt hàng','Số lít','Tiền hàng (CK)','Ký hiệu HĐ','Số HĐ'].map((h,i) => (
                    <th key={i} style={{ padding: '7px 8px', borderBottom: '1px solid #e2e8f0', textAlign: i >= 5 ? 'right' : 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, color: '#2563eb' }}>{r.bien_so}</td>
                    <td style={{ padding: '5px 8px', color: '#94a3b8' }}>{r.bien_so_raw}</td>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{r.ngay_gd ? fmtDateTime(new Date(r.ngay_gd)) : '—'}</td>
                    <td style={{ padding: '5px 8px' }}>{r.ten_tai_xe || '—'}</td>
                    <td style={{ padding: '5px 8px' }}>{r.mat_hang || '—'}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(r.so_luong_lit, 1)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(r.tien_hang_co_ck)}</td>
                    <td style={{ padding: '5px 8px' }}>{r.ky_hieu_hd || '—'}</td>
                    <td style={{ padding: '5px 8px' }}>{r.so_hd || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 100 && (
              <div style={{ padding: '8px 16px', color: '#64748b', fontSize: 12 }}>
                ... và {preview.length - 100} dòng nữa
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Tab 3: IMPORT KM ĐỊNH MỨC
// ══════════════════════════════════════════════════════════
function TabImportKm() {
  const [thang, setThang]     = useState(thisMonth());
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    fetch(`/api/xe-km?thang=${thang}`)
      .then(r => r.json())
      .then(j => setExisting(j.rows || []));
  }, [thang]);

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
        const records = parseKmDinhMuc(wb);
        setPreview(records);
        setMsg({ type: 'info', text: `Đọc được ${records.length} xe. Nhấn "Import" để lưu.` });
      } catch (err) {
        setMsg({ type: 'error', text: 'Lỗi đọc file: ' + err.message });
        setPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const doImport = async () => {
    if (!preview?.length) return;
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/xe-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, records: preview }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setMsg({ type: 'ok', text: `✅ Cập nhật thành công ${json.upserted} xe vào tháng ${thang}.` });
      setPreview(null);
      // Reload existing
      const r2 = await fetch(`/api/xe-km?thang=${thang}`);
      const j2 = await r2.json();
      setExisting(j2.rows || []);
    } catch (err) {
      setMsg({ type: 'error', text: 'Lỗi: ' + err.message });
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#1e293b' }}>Import Km & Định mức theo tháng</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Upload file Excel định mức km (MAU_Km_dinh_muc_xe.xlsx). Dữ liệu sẽ được upsert theo biển số + tháng.
          Định mức khoán (l/100km) cũng được cập nhật vào bảng xe.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Tháng</label>
            <input type="month" value={thang} onChange={e => setThang(e.target.value)} style={input} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>File Km định mức (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ fontSize: 13 }} />
          </div>
          {preview?.length > 0 && (
            <button onClick={doImport} disabled={loading} style={btn('#059669')}>
              {loading ? 'Đang lưu...' : `⬆ Import ${preview.length} xe`}
            </button>
          )}
        </div>
        {msg && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13,
            background: msg.type === 'ok' ? '#f0fdf4' : msg.type === 'error' ? '#fef2f2' : '#eff6ff',
            color:      msg.type === 'ok' ? '#166534' : msg.type === 'error' ? '#dc2626' : '#1d4ed8' }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Preview */}
      {preview?.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>
            Xem trước từ file (tháng {thang})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Biển số','Tải trọng','Km đầu','Km cuối','Km thực','ĐM (l/100km)','Tồn đầu (l)','Tồn cuối (l)'].map((h,i) => (
                  <th key={i} style={{ padding: '7px 10px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600, color: '#2563eb' }}>{r.bien_so}</td>
                  <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.tai_trong || '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(r.km_dau)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(r.km_cuoi)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtNum((r.km_cuoi||0)-(r.km_dau||0))}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: '#7c3aed' }}>{r.dinh_muc_l_100km ?? '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.ton_dau_lit ?? '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.ton_cuoi_lit ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dữ liệu hiện có trong DB */}
      {existing?.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>
            Dữ liệu hiện có tháng {thang} ({existing.length} xe)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Biển số','Tải trọng','Km đầu','Km cuối','Km thực','ĐM (l/100km)','Tồn đầu (l)','Tồn cuối (l)'].map((h,i) => (
                  <th key={i} style={{ padding: '7px 10px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {existing.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600, color: '#2563eb' }}>{r.bien_so}</td>
                  <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.tai_trong || '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(r.km_dau)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(r.km_cuoi)}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtNum((r.km_cuoi||0)-(r.km_dau||0))}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: '#7c3aed' }}>{r.dinh_muc_l_100km ?? '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.ton_dau_lit ?? '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.ton_cuoi_lit ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
