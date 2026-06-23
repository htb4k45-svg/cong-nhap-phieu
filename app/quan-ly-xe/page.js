'use client';

import { useState, useEffect } from 'react';
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

export default function QuanLyXePage() {
  const [drivers, setDrivers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAll, setShowAll]     = useState(false);
  const [editId, setEditId]       = useState(null);   // id đang edit inline
  const [editData, setEditData]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState(EMPTY_FORM);
  const [msg, setMsg]             = useState(null);   // { text, type:'ok'|'err' }

  const load = async (all) => {
    setLoading(true);
    const res  = await fetch('/api/drivers?all=' + (all ? '1' : '0'));
    const json = await res.json();
    setDrivers(json.drivers || []);
    setLoading(false);
  };

  useEffect(() => { load(showAll); }, [showAll]);

  const flash = (text, type) => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  // ── Inline edit ──────────────────────────────────────────────────────────────
  const startEdit = (d) => {
    setEditId(d.id);
    setEditData({
      ten: d.ten || '',
      vai_tro: d.vai_tro || 'lai_xe',
      dien_thoai: d.dien_thoai || '',
      bien_so:    d.bien_so    || '',
      suc_tai_thung: d.suc_tai_thung || '',
      suc_tai_kg:    d.suc_tai_kg    || '',
    });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const res  = await fetch('/api/drivers/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDrivers(ds => ds.map(d => d.id === id ? { ...d, ...json.driver } : d));
      setEditId(null);
      flash('Đã lưu', 'ok');
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d) => {
    const next = !d.active;
    const res  = await fetch('/api/drivers/' + d.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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

  // ── Thêm mới ─────────────────────────────────────────────────────────────────
  const addDriver = async () => {
    if (!addForm.ten.trim()) { flash('Vui lòng nhập tên', 'err'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDrivers(ds => [...ds, json.driver]);
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
      flash('Đã thêm lái xe', 'ok');
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const active   = drivers.filter(d => d.active !== false);
  const inactive = drivers.filter(d => d.active === false);

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 16px', fontFamily:'sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        <Link href="/dieu-xe" style={{ fontSize:13, color:'#3b82f6', textDecoration:'none' }}>← Điều xe</Link>
        <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>🚗 Quản lý lái xe & xe</h2>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <label style={{ fontSize:12, color:'#6b7280', display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Hiện cả xe đã vô hiệu hoá
          </label>
          <button onClick={() => setShowAdd(true)} style={{
            padding:'7px 16px', background:'#2563eb', color:'white', border:'none',
            borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer',
          }}>+ Thêm lái xe</button>
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div style={{
          padding:'10px 16px', borderRadius:8, marginBottom:16, fontSize:13, fontWeight:600,
          background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
          color:      msg.type === 'ok' ? '#059669'  : '#dc2626',
          border:     '1px solid ' + (msg.type === 'ok' ? '#a7f3d0' : '#fca5a5'),
        }}>{msg.type === 'ok' ? '✅ ' : '❌ '}{msg.text}</div>
      )}

      {/* Form thêm mới */}
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
                <input
                  type={type} placeholder={ph} value={addForm[key]}
                  onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:13, boxSizing:'border-box' }}
                />
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
              padding:'8px 16px', background:'white', border:'1px solid #d1d5db',
              borderRadius:7, fontSize:13, cursor:'pointer',
            }}>Huỷ</button>
          </div>
        </div>
      )}

      {/* Bảng danh sách */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>⏳ Đang tải…</div>
      ) : (
        <>
          <DriverTable
            drivers={active}
            editId={editId} editData={editData} saving={saving}
            onStartEdit={startEdit}
            onEditChange={(k,v) => setEditData(d => ({ ...d, [k]: v }))}
            onSave={saveEdit}
            onCancel={() => setEditId(null)}
            onToggleActive={toggleActive}
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
                onSave={saveEdit}
                onCancel={() => setEditId(null)}
                onToggleActive={toggleActive}
                dimmed
              />
            </div>
          )}
        </>
      )}

      <div style={{ marginTop:20, fontSize:11, color:'#9ca3af' }}>
        💡 Sức tải = 0 nghĩa là không giới hạn. Biển số xe sẽ hiện trong dropdown phân công.
      </div>
    </div>
  );
}

// ── Sub-component: bảng danh sách ────────────────────────────────────────────

function DriverTable({ drivers, editId, editData, saving, onStartEdit, onEditChange, onSave, onCancel, onToggleActive, dimmed }) {
  if (drivers.length === 0) return (
    <div style={{ textAlign:'center', padding:40, color:'#d1d5db', border:'1px dashed #e5e7eb', borderRadius:10 }}>
      Chưa có lái xe nào
    </div>
  );

  return (
    <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid #e5e7eb', opacity: dimmed ? 0.6 : 1 }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ background:'#f9fafb', borderBottom:'2px solid #e5e7eb' }}>
            {['Tên lái xe', 'Vai trò', 'Biển số xe', 'SĐT', 'Sức tải (thùng)', 'Sức tải (kg)', 'Thao tác'].map(h => (
              <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map(d => {
            const isEdit = editId === d.id;
            const vc = VAI_TRO_COLOR[d.vai_tro] || { bg:'#f3f4f6', color:'#374151' };
            return (
              <tr key={d.id} style={{ borderBottom:'1px solid #f3f4f6', background: isEdit ? '#eff6ff' : 'white' }}>

                {/* Tên */}
                <td style={{ padding:'10px 14px', fontWeight:600 }}>
                  {isEdit
                    ? <input value={editData.ten} onChange={e => onEditChange('ten', e.target.value)}
                        style={inputStyle} autoFocus />
                    : d.ten}
                </td>

                {/* Vai trò */}
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <select value={editData.vai_tro} onChange={e => onEditChange('vai_tro', e.target.value)} style={inputStyle}>
                        <option value="lai_xe">Lái xe</option>
                        <option value="giao_nhan">Phụ xe / Giao nhận</option>
                        <option value="ca_hai">Cả hai</option>
                      </select>
                    : <span style={{ padding:'2px 8px', borderRadius:5, fontSize:11, fontWeight:700, background:vc.bg, color:vc.color }}>
                        {VAI_TRO_LABEL[d.vai_tro] || d.vai_tro}
                      </span>}
                </td>

                {/* Biển số */}
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <input value={editData.bien_so} onChange={e => onEditChange('bien_so', e.target.value)}
                        placeholder="51C-123.45" style={inputStyle} />
                    : d.bien_so
                      ? <span style={{ fontWeight:700, color:'#1d4ed8', background:'#dbeafe', padding:'2px 8px', borderRadius:5, fontSize:12 }}>🚗 {d.bien_so}</span>
                      : <span style={{ color:'#d1d5db', fontSize:11 }}>Chưa có</span>}
                </td>

                {/* SĐT */}
                <td style={{ padding:'10px 14px', color:'#6b7280' }}>
                  {isEdit
                    ? <input value={editData.dien_thoai} onChange={e => onEditChange('dien_thoai', e.target.value)}
                        placeholder="0901234567" style={inputStyle} />
                    : d.dien_thoai || <span style={{ color:'#d1d5db' }}>—</span>}
                </td>

                {/* Sức tải thùng */}
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <input type="number" min="0" value={editData.suc_tai_thung} onChange={e => onEditChange('suc_tai_thung', e.target.value)}
                        style={{ ...inputStyle, width:80 }} />
                    : <span style={{ fontWeight:600, color: d.suc_tai_thung > 0 ? '#059669' : '#9ca3af' }}>
                        {d.suc_tai_thung > 0 ? d.suc_tai_thung + ' thùng' : '∞'}
                      </span>}
                </td>

                {/* Sức tải kg */}
                <td style={{ padding:'10px 14px' }}>
                  {isEdit
                    ? <input type="number" min="0" value={editData.suc_tai_kg} onChange={e => onEditChange('suc_tai_kg', e.target.value)}
                        style={{ ...inputStyle, width:80 }} />
                    : <span style={{ color:'#9ca3af', fontSize:12 }}>
                        {d.suc_tai_kg > 0 ? d.suc_tai_kg + ' kg' : '—'}
                      </span>}
                </td>

                {/* Thao tác */}
                <td style={{ padding:'8px 14px', whiteSpace:'nowrap' }}>
                  {isEdit ? (
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => onSave(d.id)} disabled={saving} style={btnOk}>
                        {saving ? '…' : '💾 Lưu'}
                      </button>
                      <button onClick={onCancel} style={btnCancel}>Huỷ</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => onStartEdit(d)} style={btnEdit}>✏️ Sửa</button>
                      <button onClick={() => onToggleActive(d)} style={d.active !== false ? btnDeactivate : btnActivate}>
                        {d.active !== false ? 'Vô hiệu' : '✅ Kích hoạt'}
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
  );
}

const inputStyle = {
  padding:'5px 8px', border:'1px solid #93c5fd', borderRadius:5,
  fontSize:12, width:'100%', boxSizing:'border-box', outline:'none',
};
const btnOk         = { padding:'5px 12px', background:'#2563eb', color:'white', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer' };
const btnCancel     = { padding:'5px 10px', background:'white', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, cursor:'pointer' };
const btnEdit       = { padding:'5px 10px', background:'#eff6ff', border:'1px solid #bfdbfe', color:'#1d4ed8', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:600 };
const btnDeactivate = { padding:'5px 10px', background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:6, fontSize:12, cursor:'pointer' };
const btnActivate   = { padding:'5px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', color:'#059669', borderRadius:6, fontSize:12, cursor:'pointer', fontWeight:600 };
