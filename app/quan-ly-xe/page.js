'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const VAI_TRO_LABEL = {
  lai_xe:   'Lái xe',
  giao_nhan:'Phụ xe / Giao nhận',
  ca_hai:   'Cả hai',
};

const VAI_TRO_COLOR = {
  lai_xe:    { bg:'#dbeafe', color:'#1d4ed8' },
  giao_nhan: { bg:'#fef3c7', color:'#b45309' },
  ca_hai:    { bg:'#d1fae5', color:'#059669'  },
};

const EMPTY_FORM = { ten:'', vai_tro:'lai_xe', dien_thoai:'', bien_so:'', suc_tai_thung:'', suc_tai_kg:'' };

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QuanLyXePage() {
  const [tab, setTab] = useState('danh-sach'); // 'danh-sach' | 'bao-cao'

  // ── Driver list state ─────────────────────────────────────────────────────
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAll, setShowAll]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving]     = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState(EMPTY_FORM);
  const [msg, setMsg]           = useState(null);

  // ── Lịch nghỉ / hỏng xe ────────────────────────────────────────────────────
  const [absences, setAbsences]       = useState([]);
  const [absenceModal, setAbsenceModal] = useState(null); // { id, ten }
  const [absenceForm, setAbsenceForm]   = useState({ ngay_tu: today(), ngay_den: today(), ly_do: '' });
  const [absenceSaving, setAbsenceSaving] = useState(false);

  const loadDrivers = async (all) => {
    setLoading(true);
    const res  = await fetch('/api/drivers?all=' + (all ? '1' : '0'));
    const json = await res.json();
    setDrivers(json.drivers || []);
    setLoading(false);
  };

  const loadAbsences = async () => {
    const res  = await fetch('/api/driver-absences');
    const json = await res.json();
    setAbsences(json.absences || []);
  };

  useEffect(() => { loadDrivers(showAll); }, [showAll]);
  useEffect(() => { loadAbsences(); }, []);

  const openAbsenceModal = (d) => {
    setAbsenceModal({ id: d.id, ten: d.ten });
    setAbsenceForm({ ngay_tu: today(), ngay_den: today(), ly_do: '' });
  };

  const saveAbsence = async () => {
    if (!absenceModal) return;
    setAbsenceSaving(true);
    try {
      const res  = await fetch('/api/driver-absences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: absenceModal.id, ...absenceForm }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(`Đã khai báo nghỉ cho ${absenceModal.ten}`, 'ok');
      setAbsenceModal(null);
      loadAbsences();
    } catch (e) { flash(e.message, 'err'); }
    finally { setAbsenceSaving(false); }
  };

  const deleteAbsence = async (id) => {
    try {
      const res  = await fetch('/api/driver-absences/' + id, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAbsences(as => as.filter(a => a.id !== id));
      flash('Đã xoá lịch nghỉ', 'ok');
    } catch (e) { flash(e.message, 'err'); }
  };

  const flash = (text, type) => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const startEdit = (d) => {
    setEditId(d.id);
    setEditData({
      ten: d.ten || '', vai_tro: d.vai_tro || 'lai_xe',
      dien_thoai: d.dien_thoai || '', bien_so: d.bien_so || '',
      suc_tai_thung: d.suc_tai_thung || '', suc_tai_kg: d.suc_tai_kg || '',
    });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const res  = await fetch('/api/drivers/' + id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDrivers(ds => ds.map(d => d.id === id ? { ...d, ...json.driver } : d));
      setEditId(null); flash('Đã lưu', 'ok');
    } catch (e) { flash(e.message, 'err'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (d) => {
    const next = !d.active;
    const res  = await fetch('/api/drivers/' + d.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    });
    const json = await res.json();
    if (json.error) { flash(json.error, 'err'); return; }
    if (showAll) {
      setDrivers(ds => ds.map(x => x.id === d.id ? { ...x, active: next } : x));
    } else {
      setDrivers(ds => ds.filter(x => x.id !== d.id));
    }
    flash(next ? 'Đã kích hoạt' : 'Đã vô hiệu hoá', 'ok');
  };

  const addDriver = async () => {
    if (!addForm.ten.trim()) { flash('Vui lòng nhập tên', 'err'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/drivers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDrivers(ds => [...ds, json.driver]);
      setAddForm(EMPTY_FORM); setShowAdd(false);
      flash('Đã thêm lái xe', 'ok');
    } catch (e) { flash(e.message, 'err'); }
    finally { setSaving(false); }
  };

  const active   = drivers.filter(d => d.active !== false);
  const inactive = drivers.filter(d => d.active === false);

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 16px', fontFamily:'sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <Link href="/dieu-xe" style={{ fontSize:13, color:'#3b82f6', textDecoration:'none' }}>← Điều xe</Link>
        <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>🚗 Quản lý xe</h2>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:24, borderBottom:'2px solid #e5e7eb' }}>
        {[['danh-sach', '📋 Danh sách xe'], ['bao-cao', '📊 Báo cáo vận hành']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding:'9px 22px', fontWeight:700, fontSize:14, border:'none', cursor:'pointer',
            background:'none', borderBottom: tab === key ? '3px solid #1d4ed8' : '3px solid transparent',
            color: tab === key ? '#1d4ed8' : '#6b7280',
            marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {/* Flash */}
      {msg && (
        <div style={{
          padding:'10px 16px', borderRadius:8, marginBottom:16, fontSize:13, fontWeight:600,
          background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
          color:      msg.type === 'ok' ? '#059669'  : '#dc2626',
          border:     '1px solid ' + (msg.type === 'ok' ? '#a7f3d0' : '#fca5a5'),
        }}>{msg.type === 'ok' ? '✅ ' : '❌ '}{msg.text}</div>
      )}

      {/* ── Tab: Danh sách ─────────────────────────────────────────────────── */}
      {tab === 'danh-sach' && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:16, alignItems:'center' }}>
            <label style={{ fontSize:12, color:'#6b7280', display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
              Hiện cả xe đã vô hiệu hoá
            </label>
            <button onClick={() => setShowAdd(true)} style={{
              padding:'7px 16px', background:'#2563eb', color:'white', border:'none',
              borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer',
            }}>+ Thêm lái xe</button>
          </div>

          {showAdd && (
            <div style={{ background:'#f0f9ff', border:'2px solid #bae6fd', borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:14, color:'#0369a1' }}>➕ Thêm lái xe / phụ xe mới</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:10 }}>
                {[
                  ['Tên *', 'ten', 'text', 'Nguyễn Văn A'],
                  ['SĐT', 'dien_thoai', 'text', '0901234567'],
                  ['Biển số xe', 'bien_so', 'text', '51C-123.45'],
                  ['Sức tải (thùng)', 'suc_tai_thung', 'number', '200'],
                ].map(([label, key, type, ph]) => (
                  <div key={key}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>{label}</div>
                    <input type={type} placeholder={ph} value={addForm[key]}
                      onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>Vai trò *</div>
                  <select value={addForm.vai_tro} onChange={e => setAddForm(f => ({ ...f, vai_tro: e.target.value }))}
                    style={{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13 }}>
                    <option value="lai_xe">Lái xe</option>
                    <option value="giao_nhan">Phụ xe / Giao nhận</option>
                    <option value="ca_hai">Cả hai</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:14 }}>
                <button onClick={addDriver} disabled={saving} style={{
                  padding:'8px 20px', background:'#2563eb', color:'white', border:'none',
                  borderRadius:7, fontWeight:700, fontSize:13, cursor:'pointer', opacity: saving ? 0.6 : 1,
                }}>{saving ? 'Đang lưu…' : '💾 Lưu'}</button>
                <button onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }} style={{
                  padding:'8px 16px', background:'white', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, cursor:'pointer',
                }}>Huỷ</button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>⏳ Đang tải…</div>
          ) : (
            <>
              <DriverTable
                drivers={active}
                editId={editId} editData={editData} saving={saving}
                onStartEdit={startEdit}
                onEditChange={(k,v) => setEditData(d => ({ ...d, [k]: v }))}
                onSave={saveEdit} onCancel={() => setEditId(null)}
                onToggleActive={toggleActive}
                absences={absences}
                onOpenAbsence={openAbsenceModal}
              />
              {showAll && inactive.length > 0 && (
                <div style={{ marginTop:24 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', marginBottom:8 }}>
                    Đã vô hiệu hoá ({inactive.length})
                  </div>
                  <DriverTable
                    drivers={inactive}
                    editId={editId} editData={editData} saving={saving}
                    onStartEdit={startEdit}
                    onEditChange={(k,v) => setEditData(d => ({ ...d, [k]: v }))}
                    onSave={saveEdit} onCancel={() => setEditId(null)}
                    onToggleActive={toggleActive} dimmed
                    absences={absences}
                    onOpenAbsence={openAbsenceModal}
                  />
                </div>
              )}

              {/* ── Lịch nghỉ / hỏng xe đang hiệu lực hoặc sắp tới ────────────── */}
              <AbsenceList absences={absences} onDelete={deleteAbsence} />
            </>
          )}

          <div style={{ marginTop:20, fontSize:11, color:'#9ca3af' }}>
            💡 Sức tải = 0 nghĩa là không giới hạn. Biển số xe sẽ hiện trong dropdown phân công.
            Dùng nút "🔧 Khai báo nghỉ" khi xe hỏng/tài xế nghỉ phép vài ngày — xe sẽ tự loại khỏi danh sách chọn trong đúng khoảng ngày đó rồi tự quay lại, không cần Vô hiệu hoá vĩnh viễn.
          </div>
        </>
      )}

      {/* ── Modal khai báo nghỉ ─────────────────────────────────────────────── */}
      {absenceModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setAbsenceModal(null)}>
          <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:380, padding:20, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>🔧 Khai báo nghỉ — {absenceModal.ten}</div>
            <div style={{ display:'grid', gap:10 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>Từ ngày</div>
                <input type="date" value={absenceForm.ngay_tu}
                  onChange={e => setAbsenceForm(f => ({ ...f, ngay_tu: e.target.value }))}
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>Đến ngày</div>
                <input type="date" value={absenceForm.ngay_den}
                  onChange={e => setAbsenceForm(f => ({ ...f, ngay_den: e.target.value }))}
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:4 }}>Lý do</div>
                <input value={absenceForm.ly_do} placeholder="Hỏng xe, Nghỉ phép..."
                  onChange={e => setAbsenceForm(f => ({ ...f, ly_do: e.target.value }))}
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end' }}>
              <button onClick={() => setAbsenceModal(null)} style={{ padding:'8px 16px', background:'white', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, cursor:'pointer' }}>Huỷ</button>
              <button onClick={saveAbsence} disabled={absenceSaving} style={{ padding:'8px 20px', background:'#dc2626', color:'white', border:'none', borderRadius:7, fontWeight:700, fontSize:13, cursor:'pointer', opacity: absenceSaving ? 0.6 : 1 }}>
                {absenceSaving ? 'Đang lưu…' : '💾 Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Báo cáo ──────────────────────────────────────────────────── */}
      {tab === 'bao-cao' && <BaoCaoTab />}
    </div>
  );
}

// ── Tab Báo cáo vận hành ──────────────────────────────────────────────────────

function BaoCaoTab() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to,   setTo]   = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/bao-cao-xe?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, []);

  function setPreset(label) {
    const d = new Date();
    if (label === 'thismonth') {
      setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
      setTo(d.toISOString().slice(0, 10));
    } else if (label === 'lastmonth') {
      const lm  = new Date(d.getFullYear(), d.getMonth() - 1, 1);
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

  function printReport() {
    if (!data) return;
    const { summary, drivers: drs } = data;
    const periodLabel = `${fmtDate(data.from)} – ${fmtDate(data.to)}`;

    const driverRows = drs.map(dr => {
      const hoanleTy = (dr.tong_don_giao + dr.tong_don_hoan) > 0
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
              tỷ lệ hoàn: ${hoanleTy}%
              ${thieu > 0 ? `&nbsp;|&nbsp; ⚠️ ${thieu} thiếu hàng` : ''}
            </span>
          </div>
          ${dr.runs.length > 0 ? `
          <table>
            <thead><tr>
              <th>Ngày</th><th>KM xuất</th><th>KM về</th><th>KM thực tế</th>
              <th>Đơn giao</th><th>Đơn hoàn</th><th>Ghi chú</th>
            </tr></thead>
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
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Times New Roman',serif; font-size:11pt; color:#111; }
        .toolbar { position:sticky; top:0; background:#1d4ed8; color:#fff; padding:8px 16px;
          display:flex; gap:10px; align-items:center; }
        .toolbar button { background:#fff; color:#1d4ed8; border:none; border-radius:5px;
          padding:5px 14px; font-weight:700; cursor:pointer; }
        .toolbar .close { background:#1e40af; color:#fff; }
        .header { text-align:center; margin:16px 0 18px; border-bottom:2px solid #1d4ed8; padding-bottom:12px; }
        .header h1 { font-size:16pt; color:#1d4ed8; text-transform:uppercase; letter-spacing:1px; }
        .header .period { font-size:11pt; color:#374151; margin-top:4px; }
        .summary-cards { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
        .card { flex:1; min-width:100px; border:1px solid #93c5fd; border-radius:6px;
          padding:8px 12px; text-align:center; }
        .card .val { font-size:18pt; font-weight:700; color:#1d4ed8; }
        .card .lbl { font-size:8pt; color:#6b7280; text-transform:uppercase; }
        .driver-block { margin-bottom:20px; page-break-inside:avoid; }
        .driver-header { background:#dbeafe; padding:7px 10px; border-left:4px solid #1d4ed8;
          display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .driver-header .name { font-size:12pt; font-weight:700; }
        .driver-header .bienso { background:#fff; border:1px solid #93c5fd; border-radius:4px;
          padding:1px 6px; font-size:10pt; }
        .driver-header .role { color:#6b7280; font-size:9pt; }
        .driver-header .summary-inline { font-size:9pt; color:#374151; margin-left:auto; }
        table { width:100%; border-collapse:collapse; font-size:9.5pt; margin-bottom:4px; }
        th { background:#1d4ed8; color:#fff; padding:5px 7px; text-align:left; font-size:9pt;
          border:1px solid #2563eb; }
        td { padding:4px 7px; border:1px solid #d1d5db; }
        tr:nth-child(even) td { background:#f9fafb; }
        .total-row td { background:#dbeafe !important; font-weight:600; }
        .thieu { margin-top:6px; background:#fffbeb; border:1px solid #fde68a;
          border-radius:4px; padding:6px 10px; font-size:9pt; color:#78350f; }
        .footer { margin-top:30px; display:flex; justify-content:space-between; font-size:10pt; }
        .sign-box { text-align:center; }
        .sign-box .title { font-weight:700; margin-bottom:48px; }
        .sign-box .name-line { border-top:1px solid #374151; padding-top:4px; color:#374151; }
        @media print { .toolbar { display:none !important; } }
      </style>
    </head><body>

    <div class="toolbar">
      <span style="font-weight:700">📄 Báo cáo vận hành xe – ${periodLabel}</span>
      <button onclick="window.print()" style="margin-left:auto">🖨️ In / Lưu PDF</button>
      <button class="close" onclick="window.close()">✕</button>
    </div>

    <div class="header">
      <div style="font-size:10pt;color:#6b7280;margin-bottom:4px">HỒNG HÀ VĂN PHÒNG PHẨM</div>
      <h1>Báo cáo vận hành xe</h1>
      <div class="period">Kỳ báo cáo: ${periodLabel}</div>
    </div>

    <div class="summary-cards">
      <div class="card"><div class="val">${summary.so_tai_xe}</div><div class="lbl">Lái xe / Phụ xe</div></div>
      <div class="card"><div class="val">${summary.tong_chuyen}</div><div class="lbl">Tổng chuyến</div></div>
      <div class="card"><div class="val">${fmtNum(summary.tong_km)}</div><div class="lbl">Tổng KM</div></div>
      <div class="card"><div class="val">${fmtNum(summary.tong_don_giao)}</div><div class="lbl">Đơn giao thành công</div></div>
      <div class="card"><div class="val" style="color:#dc2626">${fmtNum(summary.tong_don_hoan)}</div><div class="lbl">Đơn hoàn</div></div>
      ${summary.tong_thieu > 0 ? `<div class="card"><div class="val" style="color:#d97706">${summary.tong_thieu}</div><div class="lbl">Ghi chú thiếu hàng</div></div>` : ''}
    </div>

    ${driverRows}

    <div class="footer">
      <div class="sign-box"><div class="title">Người lập báo cáo</div><div class="name-line">Ký tên, họ tên</div></div>
      <div class="sign-box"><div class="title">Trưởng phòng điều vận</div><div class="name-line">Ký tên, họ tên</div></div>
      <div class="sign-box"><div class="title">Ban giám đốc</div><div class="name-line">Ký tên, họ tên</div></div>
    </div>

    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  }

  const s   = data?.summary;
  const drs = data?.drivers || [];

  const thStyle = { padding:'9px 12px', background:'#1d4ed8', color:'#fff', fontSize:12, fontWeight:600, textAlign:'left', whiteSpace:'nowrap', borderRight:'1px solid #2563eb' };
  const tdStyle = { padding:'10px 12px', fontSize:13, verticalAlign:'middle' };

  return (
    <div>
      {/* Filter bar */}
      <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <label style={{ fontSize:13, fontWeight:600, color:'#374151' }}>Từ ngày</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ border:'1px solid #d1d5db', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        <label style={{ fontSize:13, fontWeight:600, color:'#374151' }}>Đến ngày</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ border:'1px solid #d1d5db', borderRadius:6, padding:'5px 10px', fontSize:13 }} />
        <button onClick={load} disabled={loading}
          style={{ background:'#1d4ed8', color:'#fff', border:'none', borderRadius:6, padding:'6px 16px', fontWeight:700, cursor:'pointer' }}>
          {loading ? '⏳' : '🔍 Xem'}
        </button>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {[['thisweek','Tuần này'],['thismonth','Tháng này'],['lastmonth','Tháng trước']].map(([k,lbl]) => (
            <button key={k} onClick={() => setPreset(k)}
              style={{ background:'#e0e7ff', color:'#3730a3', border:'none', borderRadius:5, padding:'4px 10px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
              {lbl}
            </button>
          ))}
        </div>
        <button onClick={printReport} disabled={!data || loading}
          style={{ background:'#059669', color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
          🖨️ Xuất PDF
        </button>
      </div>

      {error && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', color:'#dc2626', marginBottom:16 }}>{error}</div>}

      {/* Summary cards */}
      {s && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
          {[
            { label:'Lái xe / Phụ xe', value:s.so_tai_xe, bg:'#eff6ff', color:'#1d4ed8' },
            { label:'Tổng chuyến', value:s.tong_chuyen, bg:'#f0fdf4', color:'#16a34a' },
            { label:'Tổng KM', value:fmtNum(s.tong_km)+' km', bg:'#eff6ff', color:'#1d4ed8', raw:true },
            { label:'Đơn giao thành công', value:s.tong_don_giao, bg:'#f0fdf4', color:'#16a34a' },
            { label:'Đơn hoàn', value:s.tong_don_hoan, bg:'#fef2f2', color:'#dc2626' },
            ...(s.tong_thieu > 0 ? [{ label:'Thiếu hàng', value:s.tong_thieu, bg:'#fffbeb', color:'#d97706' }] : []),
          ].map(c => (
            <div key={c.label} style={{ background:c.bg, border:`1px solid ${c.color}30`, borderRadius:10, padding:'12px 18px', flex:1, minWidth:130 }}>
              <div style={{ fontSize:11, color:'#6b7280', marginBottom:3, textTransform:'uppercase', letterSpacing:'.5px' }}>{c.label}</div>
              <div style={{ fontSize:24, fontWeight:700, color:c.color, lineHeight:1 }}>{c.raw ? c.value : fmtNum(c.value)}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:40, color:'#6b7280' }}>⏳ Đang tải...</div>}

      {!loading && drs.length === 0 && data && (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:14 }}>
          Không có dữ liệu vận hành trong khoảng thời gian này.<br />
          <span style={{ fontSize:12 }}>Dữ liệu được ghi khi "Chốt chuyến" trên trang Điều xe.</span>
        </div>
      )}

      {drs.length > 0 && (
        <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Lái xe / Phụ xe</th>
                <th style={thStyle}>Vai trò</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Số chuyến</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Tổng KM</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Đơn giao</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Đơn hoàn</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Tỷ lệ hoàn</th>
                <th style={{ ...thStyle, textAlign:'right' }}>Thiếu hàng</th>
              </tr>
            </thead>
            <tbody>
              {drs.map(dr => {
                const isExp = !!expanded[dr.driver_name];
                const hoanleTy = (dr.tong_don_giao + dr.tong_don_hoan) > 0
                  ? ((dr.tong_don_hoan / (dr.tong_don_giao + dr.tong_don_hoan)) * 100).toFixed(1) : 0;
                const thieu = dr.thieu_hang?.length || 0;
                return (
                  <>
                    <tr key={dr.driver_name} onClick={() => setExpanded(p => ({ ...p, [dr.driver_name]: !p[dr.driver_name] }))}
                      style={{ cursor:'pointer', background: isExp ? '#f0f9ff' : undefined, borderBottom:'1px solid #e5e7eb' }}>
                      <td style={tdStyle}>
                        <span style={{ marginRight:6, fontSize:12, color:'#9ca3af' }}>{isExp ? '▼' : '▶'}</span>
                        <strong>{dr.driver_name}</strong>
                        {dr.bien_so && <span style={{ marginLeft:8, fontSize:11, color:'#6b7280', background:'#f3f4f6', borderRadius:4, padding:'1px 5px' }}>{dr.bien_so}</span>}
                      </td>
                      <td style={{ ...tdStyle, color:'#6b7280', fontSize:12 }}>{vaiTroLabel(dr.vai_tro)}</td>
                      <td style={{ ...tdStyle, textAlign:'right' }}>{dr.tong_chuyen}</td>
                      <td style={{ ...tdStyle, textAlign:'right', fontWeight:600, color:'#1d4ed8' }}>{fmtNum(dr.tong_km)} km</td>
                      <td style={{ ...tdStyle, textAlign:'right' }}>{fmtNum(dr.tong_don_giao)}</td>
                      <td style={{ ...tdStyle, textAlign:'right', color: dr.tong_don_hoan > 0 ? '#dc2626' : '#6b7280' }}>{fmtNum(dr.tong_don_hoan)}</td>
                      <td style={{ ...tdStyle, textAlign:'right', color: hoanleTy > 10 ? '#dc2626' : '#059669', fontSize:12 }}>{hoanleTy}%</td>
                      <td style={{ ...tdStyle, textAlign:'right', color: thieu > 0 ? '#d97706' : '#6b7280' }}>{thieu > 0 ? `⚠️ ${thieu}` : '–'}</td>
                    </tr>

                    {isExp && (
                      <tr key={dr.driver_name + '-detail'}>
                        <td colSpan={8} style={{ padding:0, background:'#f9fafb' }}>
                          {dr.runs.length > 0 && (
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                              <thead>
                                <tr style={{ background:'#e0e7ff' }}>
                                  {['Ngày chạy','KM xuất phát','KM kết thúc','KM thực tế','Đơn giao','Đơn hoàn','Ghi chú'].map((h,i) => (
                                    <th key={i} style={{ padding:'6px 10px', fontSize:11, fontWeight:600, color:'#3730a3', textAlign: i > 0 && i < 6 ? 'right' : 'left', borderRight:'1px solid #c7d2fe' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {dr.runs.map(r => (
                                  <tr key={r.id} style={{ borderBottom:'1px solid #e5e7eb' }}>
                                    <td style={{ padding:'6px 10px', fontSize:12, color:'#374151', borderRight:'1px solid #e5e7eb' }}>{fmtDate(r.ngay_chay)}</td>
                                    <td style={{ padding:'6px 10px', fontSize:12, textAlign:'right', borderRight:'1px solid #e5e7eb' }}>{r.km_bat_dau ?? '–'}</td>
                                    <td style={{ padding:'6px 10px', fontSize:12, textAlign:'right', borderRight:'1px solid #e5e7eb' }}>{r.km_ket_thuc ?? '–'}</td>
                                    <td style={{ padding:'6px 10px', fontSize:12, textAlign:'right', fontWeight:600, color:'#1d4ed8', borderRight:'1px solid #e5e7eb' }}>{r.km_thuc_te ?? '–'}</td>
                                    <td style={{ padding:'6px 10px', fontSize:12, textAlign:'right', borderRight:'1px solid #e5e7eb' }}>{r.so_don_giao}</td>
                                    <td style={{ padding:'6px 10px', fontSize:12, textAlign:'right', color: r.so_don_hoan > 0 ? '#dc2626' : 'inherit', borderRight:'1px solid #e5e7eb' }}>{r.so_don_hoan}</td>
                                    <td style={{ padding:'6px 10px', fontSize:12 }}>{r.ghi_chu || '–'}</td>
                                  </tr>
                                ))}
                                <tr style={{ background:'#e0e7ff', fontWeight:700 }}>
                                  <td style={{ padding:'6px 10px', fontSize:12 }}>Tổng</td>
                                  <td style={{ padding:'6px 10px', textAlign:'right' }}>–</td>
                                  <td style={{ padding:'6px 10px', textAlign:'right' }}>–</td>
                                  <td style={{ padding:'6px 10px', textAlign:'right', color:'#1d4ed8' }}>{fmtNum(dr.tong_km)} km</td>
                                  <td style={{ padding:'6px 10px', textAlign:'right' }}>{fmtNum(dr.tong_don_giao)}</td>
                                  <td style={{ padding:'6px 10px', textAlign:'right', color: dr.tong_don_hoan > 0 ? '#dc2626' : 'inherit' }}>{fmtNum(dr.tong_don_hoan)}</td>
                                  <td></td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                          {dr.thieu_hang?.length > 0 && (
                            <div style={{ padding:'10px 16px', borderTop:'1px solid #fde68a', background:'#fffbeb' }}>
                              <div style={{ fontSize:12, fontWeight:700, color:'#92400e', marginBottom:6 }}>⚠️ Ghi chú thiếu hàng ({dr.thieu_hang.length} đơn)</div>
                              {dr.thieu_hang.map((t,i) => (
                                <div key={i} style={{ fontSize:12, color:'#78350f', marginBottom:2 }}>
                                  <span style={{ color:'#6b7280' }}>{fmtDate(t.ngay)}</span>
                                  {' · '}<span style={{ fontFamily:'monospace' }}>{t.row_key}</span>
                                  {' → '}{t.ghi_chu_giao}
                                </div>
                              ))}
                            </div>
                          )}
                          {dr.runs.length === 0 && !dr.thieu_hang?.length && (
                            <div style={{ padding:12, fontSize:12, color:'#9ca3af', fontStyle:'italic' }}>Chưa có dữ liệu chuyến trong kỳ này</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drs.length > 0 && (
        <div style={{ marginTop:10, fontSize:11, color:'#6b7280' }}>
          * Tỷ lệ hoàn = Đơn hoàn / (Đơn giao + Đơn hoàn). Dữ liệu được chốt qua "Chốt chuyến" trên trang Điều xe.
        </div>
      )}
    </div>
  );
}

// ── Sub-component: bảng danh sách xe ─────────────────────────────────────────

function DriverTable({ drivers, editId, editData, saving, onStartEdit, onEditChange, onSave, onCancel, onToggleActive, dimmed, absences = [], onOpenAbsence }) {
  if (drivers.length === 0) return (
    <div style={{ textAlign:'center', padding:40, color:'#d1d5db', border:'1px dashed #e5e7eb', borderRadius:10 }}>
      Chưa có lái xe nào
    </div>
  );

  const todayStr = today();
  const absenceOf = (driverId) => absences.find(a => a.driver_id === driverId && a.ngay_tu <= todayStr && a.ngay_den >= todayStr);

  return (
    <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid #e5e7eb', opacity: dimmed ? 0.6 : 1 }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ background:'#f9fafb', borderBottom:'2px solid #e5e7eb' }}>
            {['Tên lái xe','Vai trò','Biển số xe','SĐT','Sức tải (thùng)','Sức tải (kg)','Trạng thái','Thao tác'].map(h => (
              <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map(d => {
            const isEdit = editId === d.id;
            const vc = VAI_TRO_COLOR[d.vai_tro] || { bg:'#f3f4f6', color:'#374151' };
            const curAbsence = absenceOf(d.id);
            return (
              <tr key={d.id} style={{ borderBottom:'1px solid #f3f4f6', background: isEdit ? '#eff6ff' : 'white' }}>
                <td style={{ padding:'10px 14px', fontWeight:600 }}>
                  {isEdit
                    ? <input value={editData.ten} onChange={e => onEditChange('ten', e.target.value)} style={inputStyle} autoFocus />
                    : d.ten}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <select value={editData.vai_tro} onChange={e => onEditChange('vai_tro', e.target.value)} style={inputStyle}>
                        <option value="lai_xe">Lái xe</option>
                        <option value="giao_nhan">Phụ xe / Giao nhận</option>
                        <option value="ca_hai">Cả hai</option>
                      </select>
                    : <span style={{ padding:'2px 8px', borderRadius:5, fontSize:11, fontWeight:700, background:vc.bg, color:vc.color }}>{VAI_TRO_LABEL[d.vai_tro] || d.vai_tro}</span>}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <input value={editData.bien_so} onChange={e => onEditChange('bien_so', e.target.value)} placeholder="51C-123.45" style={inputStyle} />
                    : d.bien_so
                      ? <span style={{ fontWeight:700, color:'#1d4ed8', background:'#dbeafe', padding:'2px 8px', borderRadius:5, fontSize:12 }}>🚗 {d.bien_so}</span>
                      : <span style={{ color:'#d1d5db', fontSize:11 }}>Chưa có</span>}
                </td>
                <td style={{ padding:'10px 14px', color:'#6b7280' }}>
                  {isEdit
                    ? <input value={editData.dien_thoai} onChange={e => onEditChange('dien_thoai', e.target.value)} placeholder="0901234567" style={inputStyle} />
                    : d.dien_thoai || <span style={{ color:'#d1d5db' }}>—</span>}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <input type="number" min="0" value={editData.suc_tai_thung} onChange={e => onEditChange('suc_tai_thung', e.target.value)} style={{ ...inputStyle, width:80 }} />
                    : <span style={{ fontWeight:600, color: d.suc_tai_thung > 0 ? '#059669' : '#9ca3af' }}>{d.suc_tai_thung > 0 ? d.suc_tai_thung + ' thùng' : '∞'}</span>}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <input type="number" min="0" value={editData.suc_tai_kg} onChange={e => onEditChange('suc_tai_kg', e.target.value)} style={{ ...inputStyle, width:80 }} />
                    : <span style={{ color:'#9ca3af', fontSize:12 }}>{d.suc_tai_kg > 0 ? d.suc_tai_kg + ' kg' : '—'}</span>}
                </td>
                <td style={{ padding:'10px 14px' }}>
                  {curAbsence
                    ? <span title={curAbsence.ly_do || ''} style={{ padding:'2px 8px', borderRadius:5, fontSize:11, fontWeight:700, background:'#fef3c7', color:'#b45309' }}>
                        🔧 Đang nghỉ (đến {fmtDate(curAbsence.ngay_den)})
                      </span>
                    : <span style={{ color:'#9ca3af', fontSize:11 }}>—</span>}
                </td>
                <td style={{ padding:'8px 14px', whiteSpace:'nowrap' }}>
                  {isEdit ? (
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => onSave(d.id)} disabled={saving} style={btnOk}>{saving ? '…' : '💾 Lưu'}</button>
                      <button onClick={onCancel} style={btnCancel}>Huỷ</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button onClick={() => onStartEdit(d)} style={btnEdit}>✏️ Sửa</button>
                      <button onClick={() => onToggleActive(d)} style={d.active !== false ? btnDeactivate : btnActivate}>
                        {d.active !== false ? 'Vô hiệu' : '✅ Kích hoạt'}
                      </button>
                      {onOpenAbsence && (
                        <button onClick={() => onOpenAbsence(d)} style={btnAbsence}>🔧 Khai báo nghỉ</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const inputStyle   = { padding:'5px 8px', border:'1px solid #93c5fd', borderRadius:5, fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' };
const btnOk        = { padding:'5px 12px', background:'#2563eb', color:'white', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer' };
const btnCancel    = { padding:'5px 10px', background:'white', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, cursor:'pointer' };
const btnEdit      = { padding:'5px 10px', background:'#eff6ff', border:'1px solid #bfdbfe', color:'#1d4ed8', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:600 };
const btnDeactivate= { padding:'5px 10px', background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:6, fontSize:12, cursor:'pointer' };
const btnActivate  = { padding:'5px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', color:'#059669', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:600 };
const btnAbsence   = { padding:'5px 10px', background:'#fffbeb', border:'1px solid #fde68a', color:'#b45309', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:600 };

// ── Sub-component: danh sách lịch nghỉ đang/sắp hiệu lực ─────────────────────

function AbsenceList({ absences, onDelete }) {
  const todayStr = today();
  const upcoming = (absences || [])
    .filter(a => a.ngay_den >= todayStr)
    .sort((a, b) => a.ngay_tu.localeCompare(b.ngay_tu));

  if (upcoming.length === 0) return null;

  return (
    <div style={{ marginTop:24 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', marginBottom:8 }}>
        🔧 Lịch nghỉ / hỏng xe đang & sắp tới ({upcoming.length})
      </div>
      <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid #fde68a' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#fffbeb', borderBottom:'2px solid #fde68a' }}>
              {['Tên','Từ ngày','Đến ngày','Lý do','Trạng thái',''].map(h => (
                <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#92400e', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {upcoming.map(a => {
              const active = a.ngay_tu <= todayStr;
              return (
                <tr key={a.id} style={{ borderBottom:'1px solid #fef3c7' }}>
                  <td style={{ padding:'8px 14px', fontWeight:600 }}>{a.driver_name}</td>
                  <td style={{ padding:'8px 14px' }}>{fmtDate(a.ngay_tu)}</td>
                  <td style={{ padding:'8px 14px' }}>{fmtDate(a.ngay_den)}</td>
                  <td style={{ padding:'8px 14px', color:'#6b7280' }}>{a.ly_do || '—'}</td>
                  <td style={{ padding:'8px 14px' }}>
                    {active && <span style={{ fontSize:11, fontWeight:700, color:'#b45309' }}>Đang nghỉ</span>}
                  </td>
                  <td style={{ padding:'8px 14px', textAlign:'right' }}>
                    <button onClick={() => onDelete(a.id)} style={{ padding:'4px 10px', background:'white', border:'1px solid #fca5a5', color:'#dc2626', borderRadius:6, fontSize:12, cursor:'pointer' }}>
                      Xoá
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
