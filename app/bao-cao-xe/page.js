'use client';
import { useState, useEffect, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtNum(n) { return (n || 0).toLocaleString('vi-VN'); }

function vaiTroLabel(vt) {
  return { lai_xe: 'Lái xe', giao_nhan: 'Phụ xe / GN', ca_hai: 'Ca hai' }[vt] || vt || '';
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function Card({ label, value, unit = '', color = '#1d4ed8', bg = '#eff6ff' }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 10, padding: '14px 20px', minWidth: 150, flex: 1 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>
        {fmtNum(value)}
        {unit && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4, color: '#6b7280' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Driver Row ────────────────────────────────────────────────────────────────

function DriverRow({ dr, expanded, onToggle }) {
  const hoanleTy = dr.tong_don_giao > 0
    ? ((dr.tong_don_hoan / (dr.tong_don_giao + dr.tong_don_hoan)) * 100).toFixed(1)
    : 0;
  const thieu = dr.thieu_hang?.length || 0;

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', background: expanded ? '#f0f9ff' : undefined, borderBottom: '1px solid #e5e7eb' }}
      >
        <td style={td}>
          <span style={{ marginRight: 6, fontSize: 12, color: '#9ca3af' }}>{expanded ? '▼' : '▶'}</span>
          <strong>{dr.driver_name}</strong>
          {dr.bien_so && <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>{dr.bien_so}</span>}
        </td>
        <td style={{ ...td, color: '#6b7280', fontSize: 12 }}>{vaiTroLabel(dr.vai_tro)}</td>
        <td style={{ ...td, textAlign: 'right' }}>{dr.tong_chuyen}</td>
        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#1d4ed8' }}>{fmtNum(dr.tong_km)} km</td>
        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(dr.tong_don_giao)}</td>
        <td style={{ ...td, textAlign: 'right', color: dr.tong_don_hoan > 0 ? '#dc2626' : '#6b7280' }}>{fmtNum(dr.tong_don_hoan)}</td>
        <td style={{ ...td, textAlign: 'right', color: hoanleTy > 10 ? '#dc2626' : '#059669', fontSize: 12 }}>{hoanleTy}%</td>
        <td style={{ ...td, textAlign: 'right', color: thieu > 0 ? '#d97706' : '#6b7280' }}>
          {thieu > 0 ? `⚠️ ${thieu}` : '–'}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: '#f9fafb' }}>
            {/* Bảng chi tiết từng chuyến */}
            {dr.runs.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#e0e7ff' }}>
                    <th style={subTh}>Ngày chạy</th>
                    <th style={{ ...subTh, textAlign: 'right' }}>KM xuất phát</th>
                    <th style={{ ...subTh, textAlign: 'right' }}>KM kết thúc</th>
                    <th style={{ ...subTh, textAlign: 'right' }}>KM thực tế</th>
                    <th style={{ ...subTh, textAlign: 'right' }}>Đơn giao</th>
                    <th style={{ ...subTh, textAlign: 'right' }}>Đơn hoàn</th>
                    <th style={subTh}>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {dr.runs.map(run => (
                    <tr key={run.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={subTd}>{fmtDate(run.ngay_chay)}</td>
                      <td style={{ ...subTd, textAlign: 'right' }}>{run.km_bat_dau ?? '–'}</td>
                      <td style={{ ...subTd, textAlign: 'right' }}>{run.km_ket_thuc ?? '–'}</td>
                      <td style={{ ...subTd, textAlign: 'right', fontWeight: 600, color: '#1d4ed8' }}>{run.km_thuc_te ?? '–'}</td>
                      <td style={{ ...subTd, textAlign: 'right' }}>{run.so_don_giao}</td>
                      <td style={{ ...subTd, textAlign: 'right', color: run.so_don_hoan > 0 ? '#dc2626' : 'inherit' }}>{run.so_don_hoan}</td>
                      <td style={subTd}>{run.ghi_chu || '–'}</td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr style={{ background: '#e0e7ff', fontWeight: 700 }}>
                    <td style={subTd}>Tổng</td>
                    <td style={{ ...subTd, textAlign: 'right' }}>–</td>
                    <td style={{ ...subTd, textAlign: 'right' }}>–</td>
                    <td style={{ ...subTd, textAlign: 'right', color: '#1d4ed8' }}>{fmtNum(dr.tong_km)} km</td>
                    <td style={{ ...subTd, textAlign: 'right' }}>{fmtNum(dr.tong_don_giao)}</td>
                    <td style={{ ...subTd, textAlign: 'right', color: dr.tong_don_hoan > 0 ? '#dc2626' : 'inherit' }}>{fmtNum(dr.tong_don_hoan)}</td>
                    <td style={subTd}></td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Thiếu hàng */}
            {dr.thieu_hang?.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #fde68a', background: '#fffbeb' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                  ⚠️ Ghi chú thiếu hàng ({dr.thieu_hang.length} đơn)
                </div>
                {dr.thieu_hang.map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 2 }}>
                    <span style={{ color: '#6b7280' }}>{fmtDate(t.ngay)}</span>
                    {' · '}
                    <span style={{ fontFamily: 'monospace' }}>{t.row_key}</span>
                    {' → '}
                    {t.ghi_chu_giao}
                  </div>
                ))}
              </div>
            )}

            {dr.runs.length === 0 && !dr.thieu_hang?.length && (
              <div style={{ padding: 12, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                Chưa có dữ liệu chuyến trong kỳ này
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const th = {
  padding: '9px 12px', background: '#1d4ed8', color: '#fff',
  fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap',
  borderRight: '1px solid #2563eb',
};
const td = { padding: '10px 12px', fontSize: 13, verticalAlign: 'middle' };
const subTh = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#3730a3', textAlign: 'left', borderRight: '1px solid #c7d2fe' };
const subTd = { padding: '6px 10px', fontSize: 12, color: '#374151', borderRight: '1px solid #e5e7eb' };

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaoCaoXePage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to,   setTo]   = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/bao-cao-xe?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      // Auto-expand nếu chỉ 1 lái xe
      if (json.drivers?.length === 1) {
        setExpanded({ [json.drivers[0].driver_name]: true });
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, []);

  // ── Quick presets ─────────────────────────────────────────────────────────

  function setPreset(label) {
    const d = new Date();
    if (label === 'thismonth') {
      setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
      setTo(d.toISOString().slice(0, 10));
    } else if (label === 'lastmonth') {
      const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lme = new Date(d.getFullYear(), d.getMonth(), 0);
      setFrom(lm.toISOString().slice(0, 10));
      setTo(lme.toISOString().slice(0, 10));
    } else if (label === 'thisweek') {
      const day = d.getDay() || 7;
      const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
      setFrom(mon.toISOString().slice(0, 10));
      setTo(d.toISOString().slice(0, 10));
    }
  }

  // ── Print / PDF ───────────────────────────────────────────────────────────

  function printReport() {
    if (!data) return;
    const { summary, drivers: drs } = data;
    const periodLabel = `${fmtDate(data.from)} – ${fmtDate(data.to)}`;

    const driverRows = drs.map(dr => {
      const hoanleTy = dr.tong_don_giao > 0
        ? ((dr.tong_don_hoan / (dr.tong_don_giao + dr.tong_don_hoan)) * 100).toFixed(1) : 0;
      const thieu = dr.thieu_hang?.length || 0;
      const detailRows = dr.runs.map(r => `
        <tr>
          <td>${fmtDate(r.ngay_chay)}</td>
          <td style="text-align:right">${r.km_bat_dau ?? '–'}</td>
          <td style="text-align:right">${r.km_ket_thuc ?? '–'}</td>
          <td style="text-align:right;font-weight:600">${r.km_thuc_te ?? '–'}</td>
          <td style="text-align:right">${r.so_don_giao}</td>
          <td style="text-align:right;color:${r.so_don_hoan > 0 ? '#dc2626' : 'inherit'}">${r.so_don_hoan}</td>
          <td>${r.ghi_chu || ''}</td>
        </tr>`).join('');
      const thieuSection = thieu > 0 ? `
        <div class="thieu">
          <strong>⚠️ Thiếu hàng (${thieu} đơn):</strong><br>
          ${dr.thieu_hang.map(t => `${fmtDate(t.ngay)} · ${t.row_key} → ${t.ghi_chu_giao}`).join('<br>')}
        </div>` : '';
      return `
        <div class="driver-block">
          <div class="driver-header">
            <span class="name">${dr.driver_name}</span>
            ${dr.bien_so ? `<span class="bienso">${dr.bien_so}</span>` : ''}
            <span class="role">${vaiTroLabel(dr.vai_tro)}</span>
            <span class="summary-inline">
              ${dr.tong_chuyen} chuyến &nbsp;|&nbsp;
              <strong>${fmtNum(dr.tong_km)} km</strong> &nbsp;|&nbsp;
              ${fmtNum(dr.tong_don_giao)} giao &nbsp;|&nbsp;
              ${fmtNum(dr.tong_don_hoan)} hoàn &nbsp;|&nbsp;
              hoàn: ${hoanleTy}%
              ${thieu > 0 ? `&nbsp;|&nbsp; ⚠️ ${thieu} thiếu hàng` : ''}
            </span>
          </div>
          ${dr.runs.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Ngày</th><th>KM xuất</th><th>KM về</th><th>KM thực tế</th>
                <th>Đơn giao</th><th>Đơn hoàn</th><th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>${detailRows}</tbody>
            <tfoot>
              <tr class="total-row">
                <td>Tổng</td><td>–</td><td>–</td>
                <td style="font-weight:700;color:#1d4ed8">${fmtNum(dr.tong_km)} km</td>
                <td>${fmtNum(dr.tong_don_giao)}</td>
                <td style="color:${dr.tong_don_hoan > 0 ? '#dc2626' : 'inherit'}">${fmtNum(dr.tong_don_hoan)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>` : '<p style="color:#9ca3af;font-style:italic;font-size:11px">Chưa có dữ liệu chuyến</p>'}
          ${thieuSection}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="vi"><head>
      <meta charset="UTF-8">
      <title>Báo cáo vận hành xe – ${periodLabel}</title>
      <style>
        @page { size: A4; margin: 18mm 14mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #111; }
        .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; }
        .header h1 { font-size: 16pt; color: #1d4ed8; text-transform: uppercase; letter-spacing: 1px; }
        .header .period { font-size: 11pt; color: #374151; margin-top: 4px; }
        .summary-cards { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
        .card { flex: 1; min-width: 100px; border: 1px solid #93c5fd; border-radius: 6px; padding: 8px 12px; text-align: center; }
        .card .val { font-size: 18pt; font-weight: 700; color: #1d4ed8; }
        .card .lbl { font-size: 8pt; color: #6b7280; text-transform: uppercase; }
        .driver-block { margin-bottom: 20px; page-break-inside: avoid; }
        .driver-header { background: #dbeafe; padding: 7px 10px; border-left: 4px solid #1d4ed8;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .driver-header .name { font-size: 12pt; font-weight: 700; }
        .driver-header .bienso { background: #fff; border: 1px solid #93c5fd; border-radius: 4px;
          padding: 1px 6px; font-size: 10pt; }
        .driver-header .role { color: #6b7280; font-size: 9pt; }
        .driver-header .summary-inline { font-size: 9pt; color: #374151; margin-left: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 4px; }
        th { background: #1d4ed8; color: #fff; padding: 5px 7px; text-align: left; font-size: 9pt; border: 1px solid #2563eb; }
        td { padding: 4px 7px; border: 1px solid #d1d5db; }
        tr:nth-child(even) td { background: #f9fafb; }
        .total-row td { background: #dbeafe !important; font-weight: 600; }
        .thieu { margin-top: 6px; background: #fffbeb; border: 1px solid #fde68a;
          border-radius: 4px; padding: 6px 10px; font-size: 9pt; color: #78350f; }
        .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10pt; }
        .sign-box { text-align: center; }
        .sign-box .title { font-weight: 700; margin-bottom: 48px; }
        .sign-box .name-line { border-top: 1px solid #374151; padding-top: 4px; color: #374151; }
        @media print { .no-print { display: none !important; } }
      </style>
    </head><body>

    <div class="no-print" style="position:sticky;top:0;background:#1d4ed8;color:#fff;padding:8px 16px;display:flex;gap:10px;align-items:center;z-index:99">
      <span style="font-weight:700">📄 Báo cáo vận hành xe</span>
      <span style="margin-left:auto;font-size:12px">${periodLabel}</span>
      <button onclick="window.print()" style="background:#fff;color:#1d4ed8;border:none;border-radius:5px;padding:5px 14px;font-weight:700;cursor:pointer">🖨️ In / Lưu PDF</button>
      <button onclick="window.close()" style="background:#1e40af;color:#fff;border:none;border-radius:5px;padding:5px 10px;cursor:pointer">✕</button>
    </div>

    <div class="header">
      <div style="font-size:10pt;color:#6b7280;margin-bottom:4px">HỒNG HÀ VĂN PHÒNG PHẨM</div>
      <h1>Báo cáo vận hành xe</h1>
      <div class="period">Kỳ báo cáo: ${periodLabel}</div>
    </div>

    <div class="summary-cards">
      <div class="card">
        <div class="val">${summary.so_tai_xe}</div>
        <div class="lbl">Lái xe / Phụ xe</div>
      </div>
      <div class="card">
        <div class="val">${summary.tong_chuyen}</div>
        <div class="lbl">Tổng chuyến</div>
      </div>
      <div class="card">
        <div class="val">${fmtNum(summary.tong_km)}</div>
        <div class="lbl">Tổng KM</div>
      </div>
      <div class="card">
        <div class="val">${fmtNum(summary.tong_don_giao)}</div>
        <div class="lbl">Đơn giao thành công</div>
      </div>
      <div class="card">
        <div class="val" style="color:#dc2626">${fmtNum(summary.tong_don_hoan)}</div>
        <div class="lbl">Đơn hoàn</div>
      </div>
      ${summary.tong_thieu > 0 ? `
      <div class="card">
        <div class="val" style="color:#d97706">${summary.tong_thieu}</div>
        <div class="lbl">Ghi chú thiếu hàng</div>
      </div>` : ''}
    </div>

    ${driverRows}

    <div class="footer">
      <div class="sign-box">
        <div class="title">Người lập báo cáo</div>
        <div class="name-line">Ký tên, họ tên</div>
      </div>
      <div class="sign-box">
        <div class="title">Trưởng phòng điều vận</div>
        <div class="name-line">Ký tên, họ tên</div>
      </div>
      <div class="sign-box">
        <div class="title">Ban giám đốc</div>
        <div class="name-line">Ký tên, họ tên</div>
      </div>
    </div>

    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const s = data?.summary;
  const drs = data?.drivers || [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8', margin: 0 }}>🚚 Báo cáo vận hành xe</h1>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Tổng hợp km, đơn giao, đánh giá hiệu suất</div>
        </div>
        <button
          onClick={printReport}
          disabled={!data || loading}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
        >
          🖨️ Xuất PDF
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Từ ngày</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 13 }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Đến ngày</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 13 }} />
        <button onClick={load} disabled={loading}
          style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? '⏳' : '🔍 Xem'}
        </button>

        {/* Preset buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[['thisweek', 'Tuần này'], ['thismonth', 'Tháng này'], ['lastmonth', 'Tháng trước']].map(([k, lbl]) => (
            <button key={k} onClick={() => setPreset(k)}
              style={{ background: '#e0e7ff', color: '#3730a3', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', marginBottom: 16 }}>{error}</div>}

      {/* Summary cards */}
      {s && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <Card label="Lái xe / Phụ xe"       value={s.so_tai_xe}      bg="#eff6ff" color="#1d4ed8" />
          <Card label="Tổng chuyến"            value={s.tong_chuyen}    bg="#f0fdf4" color="#16a34a" />
          <Card label="Tổng KM"                value={s.tong_km}        bg="#eff6ff" color="#1d4ed8" unit="km" />
          <Card label="Đơn giao thành công"    value={s.tong_don_giao}  bg="#f0fdf4" color="#16a34a" />
          <Card label="Đơn hoàn"               value={s.tong_don_hoan}  bg="#fef2f2" color="#dc2626" />
          {s.tong_thieu > 0 && (
            <Card label="Ghi chú thiếu hàng"  value={s.tong_thieu}     bg="#fffbeb" color="#d97706" />
          )}
        </div>
      )}

      {/* Drivers table */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>⏳ Đang tải...</div>
      )}

      {!loading && drs.length === 0 && data && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>
          Không có dữ liệu vận hành trong khoảng thời gian này.<br />
          <span style={{ fontSize: 12 }}>Hãy đảm bảo đã "Chốt chuyến" cho các xe trong ngày.</span>
        </div>
      )}

      {drs.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Lái xe / Phụ xe</th>
                <th style={th}>Vai trò</th>
                <th style={{ ...th, textAlign: 'right' }}>Số chuyến</th>
                <th style={{ ...th, textAlign: 'right' }}>Tổng KM</th>
                <th style={{ ...th, textAlign: 'right' }}>Đơn giao</th>
                <th style={{ ...th, textAlign: 'right' }}>Đơn hoàn</th>
                <th style={{ ...th, textAlign: 'right' }}>Tỷ lệ hoàn</th>
                <th style={{ ...th, textAlign: 'right' }}>Thiếu hàng</th>
              </tr>
            </thead>
            <tbody>
              {drs.map(dr => (
                <DriverRow
                  key={dr.driver_name}
                  dr={dr}
                  expanded={!!expanded[dr.driver_name]}
                  onToggle={() => setExpanded(prev => ({
                    ...prev,
                    [dr.driver_name]: !prev[dr.driver_name],
                  }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tỷ lệ hoàn note */}
      {drs.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280' }}>
          * Tỷ lệ hoàn = Đơn hoàn / (Đơn giao + Đơn hoàn). Dữ liệu được chốt qua tính năng "Chốt chuyến" trên trang Điều xe.
        </div>
      )}
    </div>
  );
}
