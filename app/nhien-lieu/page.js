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

// ══════════════════════════════════════════════════════════
// Tab 1: BÁO CÁO
// ══════════════════════════════════════════════════════════
function TabBaoCao() {
  const [thang, setThang]       = useState(thisMonth());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [detail, setDetail]     = useState(null); // { bien_so, rows }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/nhien-lieu/bao-cao?thang=${thang}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [thang]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (bien_so) => {
    if (detail?.bien_so === bien_so) { setDetail(null); return; }
    const res = await fetch(`/api/nhien-lieu/bao-cao?thang=${thang}&bien_so=${encodeURIComponent(bien_so)}`);
    const json = await res.json();
    setDetail({ bien_so, rows: json.detail || [] });
  };

  const exportCSV = () => {
    if (!data?.rows?.length) return;
    const headers = ['Biển số','Tải trọng','ĐM (l/100km)','Km đầu','Km cuối','Km thực','Tồn đầu','Lít đổ','Tồn cuối','Lít tiêu thụ','ĐM tổng lít','TH thực (l/100km)','Chênh lệch','Tiền hàng','Tổng DT'];
    const rows = data.rows.map(r => [
      r.bien_so, r.tai_trong, r.dinh_muc, r.km_dau, r.km_cuoi, r.km_thuc,
      r.ton_dau, r.lit_do, r.ton_cuoi, r.lit_tieu_thu, r.dm_tong_lit,
      r.tieu_hao_thuc, r.chenh_lech, r.tien_hang, r.tong_dt,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `nhien-lieu_${thang}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Bộ lọc */}
      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Tháng</label>
          <input type="month" value={thang} onChange={e => setThang(e.target.value)} style={input} />
        </div>
        <button onClick={load} style={btn()}>Tải báo cáo</button>
        <button onClick={exportCSV} disabled={!data?.rows?.length}
          style={{ ...btn('#059669'), opacity: data?.rows?.length ? 1 : 0.4 }}>
          ⬇ Xuất CSV
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Đang tải...</div>}
      {error   && <div style={{ padding: 16, color: '#dc2626', background: '#fef2f2', borderRadius: 8 }}>Lỗi: {error}</div>}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Tổng xe',       val: data.summary.tong_xe,                color: '#2563eb' },
              { label: 'Xe vượt ĐM',    val: data.summary.xe_vuot_dm,              color: '#dc2626' },
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

          {/* Table */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Biển số','Tải trọng','ĐM\n(l/100km)','Km đầu','Km cuối','Km thực','Tồn đầu (l)','Lít đổ','Tồn cuối (l)','Lít tiêu thụ','ĐM tổng lít','TH thực\n(l/100km)','Chênh lệch','Tiền hàng','Tổng DT',''].map((h, i) => (
                    <th key={i} style={{ padding: '8px 8px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, color: '#475569', whiteSpace: 'pre', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map(r => (
                  <>
                    <tr key={r.bien_so}
                      onClick={() => loadDetail(r.bien_so)}
                      style={{
                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                        background: r.vuot_dm ? '#fff7f7' : (detail?.bien_so === r.bien_so ? '#eff6ff' : 'white'),
                      }}>
                      <td style={{ padding: '7px 8px', fontWeight: 700, color: '#2563eb' }}>{r.bien_so}</td>
                      <td style={{ padding: '7px 8px', color: '#64748b' }}>{r.tai_trong}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#475569' }}>{r.dinh_muc ?? '—'}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtNum(r.km_dau)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtNum(r.km_cuoi)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.km_thuc)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{fmtNum(r.ton_dau, 1)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{fmtNum(r.lit_do, 1)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{fmtNum(r.ton_cuoi, 1)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(r.lit_tieu_thu, 1)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{r.dm_tong_lit != null ? fmtNum(r.dm_tong_lit, 1) : '—'}</td>
                      <td style={{
                        padding: '7px 8px', textAlign: 'right', fontWeight: 700,
                        color: r.vuot_dm ? '#dc2626' : (r.tieu_hao_thuc != null ? '#059669' : '#94a3b8'),
                      }}>
                        {r.tieu_hao_thuc != null ? fmtNum(r.tieu_hao_thuc, 1) : '—'}
                      </td>
                      <td style={{
                        padding: '7px 8px', textAlign: 'right',
                        color: r.vuot_dm ? '#dc2626' : '#059669', fontWeight: 600,
                      }}>
                        {r.chenh_lech != null ? (r.chenh_lech > 0 ? `+${fmtNum(r.chenh_lech, 1)}` : fmtNum(r.chenh_lech, 1)) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtNum(r.tien_hang)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.tong_dt)}</td>
                      <td style={{ padding: '7px 8px' }}>
                        {r.vuot_dm && <span style={{ padding: '2px 6px', background: '#fee2e2', color: '#dc2626', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>VƯỢT ĐM</span>}
                        <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 4 }}>{detail?.bien_so === r.bien_so ? '▲' : '▼'}</span>
                      </td>
                    </tr>
                    {detail?.bien_so === r.bien_so && (
                      <tr key={r.bien_so + '_detail'}>
                        <td colSpan={16} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <DetailTable rows={detail.rows} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DetailTable({ rows }) {
  if (!rows?.length) return <div style={{ padding: 16, color: '#94a3b8' }}>Không có giao dịch</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#e0e7ff', borderBottom: '1px solid #c7d2fe' }}>
            {['Ngày GD','Tên tài xế','ĐV Kinh doanh','Mặt hàng','Đơn vị','Số lít','Giá (có CK)','Tiền hàng (có CK)','Tổng DT (có CK)','Ký hiệu HĐ','Số HĐ','Ngày HĐ','Tên ĐV bán','MST ĐV bán'].map((h,i) => (
              <th key={i} style={{ padding: '6px 8px', textAlign: i >= 5 ? 'right' : 'left', fontWeight: 600, color: '#3730a3', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e0e7ff', background: i % 2 === 0 ? 'white' : '#f5f3ff' }}>
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{fmtDateTime(r.ngay_gd)}</td>
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{r.ten_tai_xe || '—'}</td>
              <td style={{ padding: '5px 8px' }}>{r.don_vi_kd || '—'}</td>
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{r.mat_hang || '—'}</td>
              <td style={{ padding: '5px 8px' }}>{r.don_vi || '—'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmtNum(r.so_luong_lit, 1)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(r.gia_co_ck)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(r.tien_hang_co_ck)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.tong_dt_co_ck)}</td>
              <td style={{ padding: '5px 8px' }}>{r.ky_hieu_hd || '—'}</td>
              <td style={{ padding: '5px 8px' }}>{r.so_hd || '—'}</td>
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{fmtDate(r.ngay_hd)}</td>
              <td style={{ padding: '5px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ten_dv_ban || '—'}</td>
              <td style={{ padding: '5px 8px' }}>{r.mst_dv_ban || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
