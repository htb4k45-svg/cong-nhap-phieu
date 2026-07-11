'use client';
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { generateVehicleReport, generateFleetReport } from './reportGen';

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
  const [tab, setTab] = useState('bao-cao');
  const [pdfMap, setPdfMap] = useState({});  // ky_hieu_hd|so_hd → { url, name }
  const [cpMap,  setCpMap]  = useState({});  // normPlate → { cp_nb_caudong, ... }

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
            { id: 'hoa-don-pdf',  label: '📄 Hóa đơn PDF' },
            { id: 'chi-phi',      label: '💰 Chi phí phát sinh' },
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

        {/* Dùng CSS hide/show để giữ state khi đổi tab */}
        <div style={{ display: tab === 'bao-cao'      ? 'block' : 'none' }}><TabBaoCao pdfMap={pdfMap} setPdfMap={setPdfMap} cpMap={cpMap} /></div>
        <div style={{ display: tab === 'import-pvoil' ? 'block' : 'none' }}><TabImportPVOIL /></div>
        <div style={{ display: tab === 'import-km'    ? 'block' : 'none' }}><TabImportKm /></div>
        <div style={{ display: tab === 'hoa-don-pdf'  ? 'block' : 'none' }}><TabHoaDonPDF pdfMap={pdfMap} setPdfMap={setPdfMap} /></div>
        <div style={{ display: tab === 'chi-phi'      ? 'block' : 'none' }}><TabChiPhi cpMap={cpMap} setCpMap={setCpMap} /></div>
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
function TabBaoCao({ pdfMap = {}, setPdfMap, cpMap = {} }) {
  const [thang, setThang]       = useState(thisMonth());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [cache, setCache]       = useState({});
  const [checked, setChecked]   = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [zipStatus, setZipStatus] = useState(''); // '' | 'loading' | 'done'

  // Upload ZIP hóa đơn PDF trực tiếp từ tab Báo cáo
  const handleZip = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.JSZip) { alert('Thư viện chưa sẵn sàng, thử lại sau vài giây'); return; }
    setZipStatus('loading');
    try {
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const pdfFiles = [], xmlMap = {};
      const scan = async (z) => {
        const subs = [];
        z.forEach((path, entry) => {
          if (entry.dir) return;
          const name = path.split('/').pop(), lower = name.toLowerCase();
          if (lower.endsWith('.pdf')) pdfFiles.push({ name, entry });
          else if (lower.endsWith('.xml')) xmlMap[lower.replace(/\.xml$/, '')] = entry;
          else if (lower.endsWith('.zip')) subs.push(entry);
        });
        for (const s of subs) await scan(await window.JSZip.loadAsync(await s.async('arraybuffer')));
      };
      await scan(zip);
      const newMap = {};
      for (const { name, entry } of pdfFiles) {
        const f = extractInvoiceFields('', name);
        let ky_hieu_hd = f.ky_hieu_hd, so_hd = f.so_hd;
        const xmlEntry = xmlMap[name.toLowerCase().replace(/\.pdf$/, '')];
        if (xmlEntry) {
          const doc = new DOMParser().parseFromString(await xmlEntry.async('string'), 'text/xml');
          ky_hieu_hd = doc.getElementsByTagName('KHHDon')[0]?.textContent?.trim() || ky_hieu_hd;
        }
        const key = (ky_hieu_hd || '') + '|' + normSoHD(so_hd);
        const blob = new Blob([await entry.async('arraybuffer')], { type: 'application/pdf' });
        newMap[key] = { url: URL.createObjectURL(blob), name, ky_hieu_hd, so_hd };
      }
      setPdfMap(newMap);
      setZipStatus('done:' + Object.keys(newMap).length);
    } catch (err) {
      setZipStatus('');
      alert('Lỗi xử lý ZIP: ' + err.message);
    }
    e.target.value = '';
  };

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
        {/* ZIP upload HĐ PDF — dùng ngay trong tab Báo cáo */}
        <label style={{ ...btn(zipStatus.startsWith('done') ? '#16a34a' : '#0891b2'), display:'inline-block', cursor:'pointer', whiteSpace:'nowrap' }}>
          {zipStatus === 'loading'
            ? '⏳ Đang xử lý...'
            : zipStatus.startsWith('done')
              ? `✅ ${zipStatus.split(':')[1]} PDF • Đổi ZIP`
              : '📦 Upload ZIP hóa đơn PDF'}
          <input type="file" accept=".zip" onChange={handleZip}
            disabled={zipStatus === 'loading'} style={{ display:'none' }} />
        </label>
        <button onClick={() => exportSummary(false)} disabled={!data?.rows?.length}
          style={{ ...btn('#475569'), opacity: data?.rows?.length ? 1 : 0.4 }}>
          ⬇ Xuất tổng hợp (tất cả)
        </button>
        <button onClick={() => data?.rows?.length && generateFleetReport(data.rows, thang, cpMap)}
          disabled={!data?.rows?.length}
          style={{ ...btn('#0891b2'), opacity: data?.rows?.length ? 1 : 0.4 }}>
          🚛 BC Đoàn Xe (.xlsx)
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
                              <InlineDetail summaryRow={r} det={det} thang={thang} pdfMap={pdfMap} cpMap={cpMap} />
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
function InlineDetail({ summaryRow: r, det, thang, pdfMap = {}, cpMap = {} }) {
  const rows = det?.rows || [];
  const isLoading = det?.loading !== false;

  const exportThis = () => {
    if (!rows.length) return;
    toCSV([DETAIL_HEADERS.map(([h]) => h), ...rows.map(d => detailRow(d, r.bien_so))],
          `chi-tiet-xe_${r.bien_so}_${thang}.csv`);
  };

  // Gộp PDF các HĐ của xe này → trả về blob URL
  const mergePDFs = async () => {
    const keys = rows
      .map(d => (d.ky_hieu_hd || '') + '|' + normSoHD(d.so_hd))
      .filter(k => pdfMap[k]);
    if (!keys.length) { alert('Không có hóa đơn PDF nào cho xe này'); return null; }
    if (!window.PDFLib) { alert('PDF-lib chưa sẵn sàng'); return null; }
    const { PDFDocument } = window.PDFLib;
    const merged = await PDFDocument.create();
    for (const k of keys) {
      const e = pdfMap[k];
      if (!e?.url) continue;
      const buf = await fetch(e.url).then(r => r.arrayBuffer());
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const bytes = await merged.save();
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  };

  const printVehiclePDFs = async () => {
    try {
      const url = await mergePDFs();
      if (!url) return;
      const win = window.open(url, '_blank');
      if (win) win.addEventListener('load', () => { win.focus(); win.print(); });
    } catch (err) { alert('Lỗi in PDF: ' + err.message); }
  };

  const downloadVehiclePDFs = async () => {
    try {
      const url = await mergePDFs();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `HoaDon_${r.bien_so.replace(/[^A-Za-z0-9]/g,'_')}_${thang}.pdf`;
      a.click();
    } catch (err) { alert('Lỗi tải PDF: ' + err.message); }
  };

  // Đếm số HĐ có PDF cho xe này (chỉ tính khi rows đã load)
  const pdfCount = rows.filter(d => pdfMap[(d.ky_hieu_hd || '') + '|' + normSoHD(d.so_hd)]).length;

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!isLoading && pdfCount > 0 && (
            <>
              <button onClick={printVehiclePDFs}
                style={{ padding: '4px 12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                🖨️ In {pdfCount} HĐ PDF
              </button>
              <button onClick={downloadVehiclePDFs}
                style={{ padding: '4px 12px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                ⬇ Tải PDF gộp
              </button>
            </>
          )}
          {!isLoading && rows.length > 0 && (
            <button onClick={() => generateVehicleReport(r, rows, thang, cpMap)}
              style={{ padding: '4px 12px', background: '#d97706', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              📊 Xuất báo cáo Excel
            </button>
          )}
          <button onClick={exportThis} disabled={!rows.length || isLoading}
            style={{ padding: '4px 12px', background: '#059669', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, opacity: rows.length ? 1 : 0.5 }}>
            ⬇ Xuất CSV xe này
          </button>
        </div>
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
                    <th style={{ padding: '6px 8px', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>PDF</th>
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
                      <td style={{ padding: '4px 8px' }}>
                        {(() => {
                          const k = (d.ky_hieu_hd || '') + '|' + normSoHD(d.so_hd);
                          const e = pdfMap[k];
                          return e ? (
                            <div style={{ display:'flex', gap:3 }}>
                              <button onClick={() => window.open(e.url, '_blank')}
                                style={{ padding:'2px 7px', background:'#2563eb', color:'white', border:'none', borderRadius:4, cursor:'pointer', fontSize:10, fontWeight:600 }}>
                                🔍
                              </button>
                              <button onClick={async () => {
                                if (!window.PDFLib) return;
                                const { PDFDocument } = window.PDFLib;
                                const buf = await fetch(e.url).then(r => r.arrayBuffer());
                                const doc = await PDFDocument.load(buf);
                                const m = await PDFDocument.create();
                                const pages = await m.copyPages(doc, doc.getPageIndices());
                                pages.forEach(p => m.addPage(p));
                                const bytes = await m.save();
                                const url = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
                                const w = window.open(url, '_blank');
                                if (w) w.addEventListener('load', () => { w.focus(); w.print(); });
                              }}
                                style={{ padding:'2px 7px', background:'#7c3aed', color:'white', border:'none', borderRadius:4, cursor:'pointer', fontSize:10, fontWeight:600 }}>
                                🖨️
                              </button>
                            </div>
                          ) : null;
                        })()}
                      </td>
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
                    <td colSpan={6} style={{ padding: '5px 8px' }}></td>
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

function extractInvoiceFields(text, filename) {
  let ky_hieu_hd = null;
  let so_hd      = null;
  let mst_file   = null;

  // 1. Parse từ tên file (ưu tiên, ổn định hơn)
  if (filename) {
    const stem  = filename.replace(/\.pdf$/i, '').split(/[/\\]/).pop();
    const parts = stem.split('_');
    if (parts.length >= 4) {
      mst_file   = parts[0];
      ky_hieu_hd = parts[2];
      so_hd      = parts[3];
    } else if (parts.length === 3) {
      mst_file   = parts[0];
      ky_hieu_hd = parts[1];
      so_hd      = parts[2];
    }
  }

  // 2. Fallback: parse từ nội dung PDF text
  if (!ky_hieu_hd && text) {
    const t   = text.replace(/\s+/g, ' ');
    const mKy = t.match(/[Kk][yý]\s*hi[eệ]u\s*(?:\([^)]*\))?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-]{1,20})/u);
    const mSo = t.match(/\bS[oố]\b\s*(?:h[oó]a?\s*[dđ][oơ]n\s*)?(?:\([^)]*\))?\s*[:\-]?\s*(\d{4,12})/iu);
    let kh = mKy ? mKy[1].trim() : null;
    if (kh && /^\d/.test(kh)) kh = kh.replace(/^\d+/, ''); // bỏ mẫu số prefix
    if (!ky_hieu_hd) ky_hieu_hd = kh;
    if (!so_hd)      so_hd      = mSo ? mSo[1].trim() : null;
  }

  return { ky_hieu_hd, so_hd, mst_file };
}

// Chuẩn hoá số HĐ: bỏ leading zeros để so sánh ("00452244" → "452244")
function normSoHD(s) {
  if (!s) return '';
  const n = parseInt(s, 10);
  return isNaN(n) ? s : String(n);
}

// ── CDN constants ─────────────────────────────────────────────────────────────
const CDN = {
  JSZIP:  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  PDFLIB: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
};

// ── TabHoaDonPDF ──────────────────────────────────────────────────────────────
function TabHoaDonPDF({ pdfMap, setPdfMap }) {
  const [thang,     setThang]    = useState(thisMonth());
  const [dbRecs,    setDbRecs]   = useState(null);
  const [phase,     setPhase]    = useState('idle');
  const [progress,  setProgress] = useState('');
  const [saved,     setSaved]    = useState(false);
  const [filter,    setFilter]   = useState('all');
  const [dbLoading, setDbLoading]= useState(false);
  const [libsReady, setLibsReady]= useState(false);

  // Load CDN libs một lần (JSZip + PDFLib, không cần PDF.js)
  useEffect(() => {
    const load = (src) => new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    load(CDN.JSZIP)
      .then(() => load(CDN.PDFLIB))
      .then(() => setLibsReady(true))
      .catch(err => console.error('CDN load error:', err));
  }, []);

  // Tải danh sách HĐ từ DB
  const loadDB = async (t) => {
    setDbLoading(true); setDbRecs(null); setSaved(false);
    try {
      const res = await fetch('/api/nhien-lieu/hoa-don?thang=' + t);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 150));
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDbRecs(json.records || []);
    } catch (err) {
      setDbRecs([]);
      alert('Lỗi tải dữ liệu: ' + err.message);
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => { loadDB(thang); }, [thang]);

  // Giải nén ZIP + trích xuất PDF (dùng XML để lấy ký hiệu/số HĐ)
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!libsReady) { alert('Thư viện chưa sẵn sàng, thử lại sau vài giây'); return; }
    setPhase('extracting'); setProgress('Đang giải nén ZIP...');
    try {
      const buf = await file.arrayBuffer();
      const zip = await window.JSZip.loadAsync(buf);

      // Thu thập PDF + XML từ ZIP (kể cả ZIP lồng nhau)
      const pdfFiles = [];
      const xmlMap   = {};  // stem (lowercase) → JSZip entry

      const processZip = async (z) => {
        const subs = [];
        z.forEach((path, entry) => {
          if (entry.dir) return;
          const name  = path.split('/').pop();
          const lower = name.toLowerCase();
          if (lower.endsWith('.pdf')) {
            pdfFiles.push({ name, entry });
          } else if (lower.endsWith('.xml')) {
            xmlMap[lower.replace(/\.xml$/, '')] = entry;
          } else if (lower.endsWith('.zip')) {
            subs.push(entry);
          }
        });
        for (const sub of subs) {
          const inner = await window.JSZip.loadAsync(await sub.async('arraybuffer'));
          await processZip(inner);
        }
      };
      await processZip(zip);

      if (pdfFiles.length === 0) { setPhase('idle'); alert('Không tìm thấy file PDF trong ZIP'); return; }

      setProgress('Xử lý ' + pdfFiles.length + ' file PDF...');
      const newMap = {};

      for (let i = 0; i < pdfFiles.length; i++) {
        const { name, entry } = pdfFiles[i];
        setProgress('Xử lý ' + (i + 1) + '/' + pdfFiles.length + ': ' + name);
        try {
          let ky_hieu_hd = null, so_hd = null;

          // Tên file chứa số HĐ đầy đủ (kể cả số 0 đầu, vd: 00452248)
          const f = extractInvoiceFields('', name);

          // Ưu tiên đọc ký hiệu HĐ từ XML (đáng tin hơn tên file)
          // Số HĐ lấy từ tên file để giữ nguyên số 0 đầu
          const stem = name.toLowerCase().replace(/\.pdf$/, '');
          const xmlEntry = xmlMap[stem];
          if (xmlEntry) {
            try {
              const xmlText = await xmlEntry.async('string');
              const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
              // getElementsByTagName hoạt động đúng với XML có namespace (querySelector không)
              ky_hieu_hd = doc.getElementsByTagName('KHHDon')[0]?.textContent?.trim() || f.ky_hieu_hd;
              so_hd      = f.so_hd || doc.getElementsByTagName('SHDon')[0]?.textContent?.trim() || null;
              console.log('[HĐ]', name, '→ KyHieu:', ky_hieu_hd, 'SoHD:', so_hd);
            } catch (xmlErr) {
              console.warn('XML parse error:', name, xmlErr);
              ky_hieu_hd = f.ky_hieu_hd;
              so_hd      = f.so_hd;
            }
          } else {
            // Không có XML → dùng tên file
            ky_hieu_hd = f.ky_hieu_hd;
            so_hd      = f.so_hd;
          }

          const data = await entry.async('arraybuffer');
          const blob = new Blob([data], { type: 'application/pdf' });
          const key  = (ky_hieu_hd || '') + '|' + normSoHD(so_hd);
          newMap[key] = { url: URL.createObjectURL(blob), name, ky_hieu_hd, so_hd };
        } catch (err) {
          console.warn('Skip PDF:', name, err.message);
        }
      }

      setPdfMap(newMap);
      setPhase('done');
      setProgress('Xong! ' + Object.keys(newMap).length + ' PDF đã xử lý.');
    } catch (err) {
      setPhase('idle');
      alert('Lỗi xử lý ZIP: ' + err.message);
    }
  };

  // Mở PDF trong tab mới
  const openPDF = (key) => {
    const e = pdfMap[key];
    if (e && e.url) window.open(e.url, '_blank');
  };

  // In một hoặc nhiều PDF
  const printSelected = async (keys) => {
    if (!window.PDFLib) { alert('PDF-lib chưa sẵn sàng'); return; }
    const { PDFDocument } = window.PDFLib;
    try {
      const merged = await PDFDocument.create();
      for (const k of keys) {
        const e = pdfMap[k];
        if (!e || !e.url) continue;
        const resp = await fetch(e.url);
        const buf  = await resp.arrayBuffer();
        const doc  = await PDFDocument.load(buf);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const bytes = await merged.save();
      const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const win   = window.open(url, '_blank');
      if (win) win.addEventListener('load', () => { win.focus(); win.print(); });
    } catch (err) {
      alert('Lỗi in: ' + err.message);
    }
  };

  // Lưu vào DB
  const handleSave = async () => {
    const matched = (dbRecs || []).filter(r => pdfMap[(r.ky_hieu_hd || '') + '|' + normSoHD(r.so_hd)]);
    if (!matched.length) return;
    try {
      const res  = await fetch('/api/nhien-lieu/hoa-don', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          save: true,
          invoices: matched.map(r => ({
            ky_hieu_hd: r.ky_hieu_hd,
            so_hd:      r.so_hd,
            pdf_file:   pdfMap[(r.ky_hieu_hd || '') + '|' + normSoHD(r.so_hd)].name,
          })),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSaved(true);
    } catch (err) {
      alert('Lỗi lưu: ' + err.message);
    }
  };

  // Danh sách hiển thị theo filter
  const matchedKeys = new Set(
    (dbRecs || [])
      .filter(r => pdfMap[(r.ky_hieu_hd || '') + '|' + normSoHD(r.so_hd)])
      .map(r => r.id)
  );
  const displayed = (dbRecs || []).filter(r => {
    if (filter === 'co')   return matchedKeys.has(r.id);
    if (filter === 'chua') return !matchedKeys.has(r.id);
    return true;
  });

  const allMatchedKeys = displayed
    .filter(r => pdfMap[(r.ky_hieu_hd || '') + '|' + normSoHD(r.so_hd)])
    .map(r => (r.ky_hieu_hd || '') + '|' + normSoHD(r.so_hd));

  return (
    <div>
      {/* Thanh điều khiển */}
      <div style={{ ...card, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Tháng</div>
          <input type="month" value={thang} onChange={e => setThang(e.target.value)}
            style={{ ...input, fontSize:14 }} />
        </div>
        <div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Upload ZIP hóa đơn PDF</div>
          <label style={{ ...btn('#2563eb'), display:'inline-block', cursor:'pointer',
            opacity: libsReady ? 1 : 0.5 }}>
            📦 Chọn file ZIP
            <input type="file" accept=".zip" onChange={handleFile}
              disabled={!libsReady} style={{ display:'none' }} />
          </label>
        </div>
        {phase === 'extracting' && (
          <div style={{ fontSize:13, color:'#2563eb' }}>⏳ {progress}</div>
        )}
        {phase === 'done' && (
          <div style={{ fontSize:13, color:'#16a34a' }}>✅ {progress}</div>
        )}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {allMatchedKeys.length > 0 && (
            <button onClick={() => printSelected(allMatchedKeys)}
              style={btn('#7c3aed')}>
              🖨️ In {allMatchedKeys.length} HĐ có PDF
            </button>
          )}
          <button onClick={() => loadDB(thang)} disabled={dbLoading}
            style={btn('#6b7280')}>
            {dbLoading ? '...' : '🔄 Tải lại'}
          </button>
        </div>
      </div>

      {/* Thống kê */}
      {dbRecs && (
        <div style={{ ...card, display:'flex', gap:32, alignItems:'center', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:28, fontWeight:800 }}>{dbRecs.length}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>HĐ trong tháng</div>
          </div>
          <div>
            <div style={{ fontSize:28, fontWeight:800, color:'#16a34a' }}>{matchedKeys.size}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>Có file PDF</div>
          </div>
          <div>
            <div style={{ fontSize:28, fontWeight:800, color:'#ef4444' }}>
              {dbRecs.length - matchedKeys.size}
            </div>
            <div style={{ fontSize:12, color:'#64748b' }}>Chưa có PDF</div>
          </div>
          <div>
            <div style={{ fontSize:28, fontWeight:800, color:'#7c3aed' }}>
              {Object.keys(pdfMap).length}
            </div>
            <div style={{ fontSize:12, color:'#64748b' }}>PDF đã upload</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            {['all','co','chua'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ ...btn(filter === f ? '#1e293b' : '#e2e8f0'),
                  color: filter === f ? 'white' : '#1e293b' }}>
                {f === 'all' ? 'Tất cả' : f === 'co' ? 'Có PDF' : 'Chưa có PDF'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bảng */}
      {dbRecs && (
        <div style={{ ...card, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid #e2e8f0', background:'#f8fafc' }}>
                {['#','MST ĐV xuất','Ký hiệu HĐ','Số HĐ','Biển số xe',
                  'Lái xe','Ngày HĐ','Số lít','File PDF','Xem / In'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left',
                    fontWeight:600, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((r, i) => {
                const mapKey   = (r.ky_hieu_hd || '') + '|' + normSoHD(r.so_hd);
                const pdfEntry = pdfMap[mapKey];
                return (
                  <tr key={r.id}
                    style={{ borderBottom:'1px solid #f1f5f9',
                      background: pdfEntry ? '#f0fdf4' : 'white' }}>
                    <td style={{ padding:'8px 12px', color:'#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:11 }}>
                      {r.mst_dv_ban || '—'}
                    </td>
                    <td style={{ padding:'8px 12px', fontWeight:700 }}>
                      {r.ky_hieu_hd || '—'}
                    </td>
                    <td style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:600 }}>
                      {r.so_hd || '—'}
                    </td>
                    <td style={{ padding:'8px 12px', fontWeight:600, color:'#2563eb' }}>
                      {r.bien_so || '—'}
                    </td>
                    <td style={{ padding:'8px 12px' }}>{r.ten_tai_xe || '—'}</td>
                    <td style={{ padding:'8px 12px', color:'#64748b' }}>
                      {fmtDate(r.ngay_hd)}
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'right' }}>
                      {r.so_luong_lit != null ? fmtNum(r.so_luong_lit, 2) : '—'}
                    </td>
                    <td style={{ padding:'8px 12px', fontSize:11,
                      color: pdfEntry ? '#16a34a' : '#9ca3af' }}>
                      {pdfEntry
                        ? <span title={pdfEntry.name}>
                            {'✅ ' + (pdfEntry.name.length > 22
                              ? pdfEntry.name.slice(0, 20) + '…'
                              : pdfEntry.name)}
                          </span>
                        : '—'}
                    </td>
                    <td style={{ padding:'8px 12px' }}>
                      {pdfEntry && (
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={() => openPDF(mapKey)}
                            style={{ ...btn('#2563eb'), padding:'3px 10px', fontSize:11 }}>
                            🔍 Xem
                          </button>
                          <button onClick={() => printSelected([mapKey])}
                            style={{ ...btn('#7c3aed'), padding:'3px 10px', fontSize:11 }}>
                            🖨️ In
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lưu vào DB */}
      {matchedKeys.size > 0 && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
          <button onClick={handleSave} disabled={saved}
            style={btn(saved ? '#6b7280' : '#16a34a')}>
            {saved ? '✅ Đã lưu vào DB' : '💾 Lưu kết quả vào DB'}
          </button>
          {saved && (
            <span style={{ color:'#16a34a', fontSize:13 }}>
              Đã cập nhật pdf_file cho {matchedKeys.size} hóa đơn
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Parse Chi phí phát sinh Excel ────────────────────────────────────────────
// Format: header 2 dòng (merged), cột biển số + 7 cột chi phí
// Tự phát hiện header row, tự map cột theo keyword
function parseCPFile(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  // Tìm dòng header chứa 'biển số' hoặc 'bien so'
  let hRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const vals = rows[i].map(c => String(c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d'));
    if (vals.some(v => v.includes('bien so') || v.includes('bien ks'))) { hRow = i; break; }
  }
  if (hRow === -1) throw new Error('Không tìm thấy cột "Biển số" trong file');

  // Gộp 2 dòng header thành chuỗi key để nhận diện cột
  const h1 = rows[hRow]   || [];
  const h2 = rows[hRow+1] || [];
  const headers = h1.map((v, i) => {
    const combined = String(v || '') + ' ' + String(h2[i] || '');
    return combined.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/đ/g,'d').replace(/\s+/g,' ').trim();
  });

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/\s+/g,' ').trim();

  // Tìm index cột theo keywords
  const findCol = (...keywords) => headers.findIndex(h => keywords.every(k => h.includes(norm(k))));

  const colBS       = findCol('bien');
  const colNBCau    = findCol('noi bo', 'cau');
  const colNBBen    = findCol('noi bo', 'ben');
  const colNBBoc    = findCol('noi bo', 'boc');
  const colTinhCau  = findCol('tinh', 'cau');
  const colTinhBen  = findCol('tinh', 'ben');
  const colTinhBoc  = findCol('tinh', 'boc');
  const colRua      = findCol('rua');

  const toNum = v => {
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/[^\d.-]/g,''));
    return isNaN(n) ? 0 : n;
  };

  const result = {};
  const dataStart = hRow + (h2.some(v => v) ? 2 : 1);

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const rawBS = row[colBS];
    if (!rawBS) continue;
    const bs = String(rawBS).toUpperCase().replace(/[-.\s]/g,'');
    if (bs.length < 4) continue;

    result[bs] = {
      cp_nb_caudong:   colNBCau   >= 0 ? toNum(row[colNBCau])   : 0,
      cp_nb_ben:       colNBBen   >= 0 ? toNum(row[colNBBen])   : 0,
      cp_nb_bocxep:    colNBBoc   >= 0 ? toNum(row[colNBBoc])   : 0,
      cp_tinh_caudong: colTinhCau >= 0 ? toNum(row[colTinhCau]) : 0,
      cp_tinh_ben:     colTinhBen >= 0 ? toNum(row[colTinhBen]) : 0,
      cp_tinh_bocxep:  colTinhBoc >= 0 ? toNum(row[colTinhBoc]) : 0,
      cp_ruaxe:        colRua     >= 0 ? toNum(row[colRua])     : 0,
    };
  }
  return result;
}

// ══════════════════════════════════════════════════════════
// Tab Chi phí phát sinh
// ══════════════════════════════════════════════════════════
function TabChiPhi({ cpMap, setCpMap }) {
  const [preview, setPreview] = useState(null);
  const [msg, setMsg]         = useState(null);

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
        const parsed = parseCPFile(wb);
        setPreview(parsed);
        setMsg({ type: 'info', text: `Đọc được ${Object.keys(parsed).length} xe. Nhấn "Áp dụng" để dùng cho báo cáo tháng này.` });
      } catch (err) {
        setMsg({ type: 'error', text: 'Lỗi đọc file: ' + err.message });
        setPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const apply = () => {
    if (!preview) return;
    setCpMap(preview);
    setMsg({ type: 'ok', text: `✅ Đã áp dụng chi phí cho ${Object.keys(preview).length} xe. Vào tab Báo cáo tháng để xuất Excel.` });
  };

  const hasCpMap = Object.keys(cpMap).length > 0;

  return (
    <div>
      <div style={card}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#1e293b' }}>Chi phí phát sinh ngoại lộ</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Upload file Excel chi phí phát sinh (cầu đường, bến bãi, bốc xếp, rửa xe per xe).
          Dữ liệu chỉ lưu trong phiên làm việc — cần upload lại mỗi lần.
          Sau khi áp dụng, nút "Xuất báo cáo Excel" trong Báo cáo tháng sẽ điền đầy đủ phần B/C/D.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>File CP phát sinh (.xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ fontSize: 13 }} />
          </div>
          {preview && (
            <button onClick={apply} style={btn('#059669')}>
              ✅ Áp dụng cho báo cáo
            </button>
          )}
          {hasCpMap && !preview && (
            <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
              ✅ Đang dùng CP cho {Object.keys(cpMap).length} xe
            </div>
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
      {preview && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>
            Xem trước {Object.keys(preview).length} xe từ file
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Biển số','NB - Cầu đường','NB - Bến','NB - Bốc xếp',
                    'Tỉnh - Cầu đường','Tỉnh - Bến','Tỉnh - Bốc xếp','Rửa xe','Tổng CP'].map((h,i) => (
                    <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview).map(([bs, cp], i) => {
                  const total = Object.values(cp).reduce((s,v) => s+(v||0), 0);
                  return (
                    <tr key={bs} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: '#2563eb' }}>{bs}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_nb_caudong)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_nb_ben)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_nb_bocxep)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_tinh_caudong)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_tinh_ben)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_tinh_bocxep)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtNum(cp.cp_ruaxe)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{fmtNum(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hướng dẫn format file */}
      <div style={{ ...card, background: '#fffbeb', border: '1px solid #fcd34d' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#92400e' }}>📋 Định dạng file Excel chi phí phát sinh</h4>
        <p style={{ fontSize: 12, color: '#78350f', margin: 0, lineHeight: 1.6 }}>
          File cần có cột <b>Biển số</b> và các cột chi phí. Hệ thống tự phát hiện header (kể cả 2 dòng header gộp ô).
          Tên cột cần chứa từ khóa:<br/>
          — <b>Nội bộ + Cầu đường</b>: lệ phí cầu đường chuyến nội bộ<br/>
          — <b>Nội bộ + Bến</b>: phí vào bến nội bộ<br/>
          — <b>Nội bộ + Bốc</b>: phí bốc xếp nội bộ<br/>
          — <b>Tỉnh + Cầu đường</b>: lệ phí cầu đường chuyến tỉnh<br/>
          — <b>Tỉnh + Bến</b>: phí vào bến tỉnh<br/>
          — <b>Tỉnh + Bốc</b>: phí bốc xếp tỉnh<br/>
          — <b>Rửa</b>: chi phí rửa xe
        </p>
      </div>
    </div>
  );
}
