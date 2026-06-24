'use client';

import { useState } from 'react';
import PhieuForm from '@/components/PhieuForm';

// ── Thu hồi form ─────────────────────────────────────────────────────────────

const emptyHoi = {
  nguon_ten: '', nguon_dia_chi: '', nguon_sdt: '',
  loai_hang: '', so_luong_thung: '0', ghi_chu: '',
  kho_nhan: '', nguoi_nhan: '',
  ngay_lay: new Date().toISOString().split('T')[0],
};

function PhieuHoiForm() {
  const [form, setForm]       = useState(emptyHoi);
  const [saving, setSaving]   = useState(false);
  const [result, setResult]   = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nguon_ten.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/phieu-hoi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nguon_ten:      form.nguon_ten.trim(),
          nguon_dia_chi:  form.nguon_dia_chi || null,
          nguon_sdt:      form.nguon_sdt || null,
          loai_hang:      form.loai_hang || null,
          so_luong_thung: parseInt(form.so_luong_thung) || 0,
          ghi_chu:        form.ghi_chu || null,
          kho_nhan:       form.kho_nhan || null,
          nguoi_nhan:     form.nguoi_nhan || null,
          ngay_lay:       form.ngay_lay,
        }),
      });
      const data = await res.json();
      if (data.phieu) {
        setResult({ ok: true });
        setForm(emptyHoi);
      } else {
        setResult({ error: data.error || 'Lỗi không rõ' });
      }
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box' };
  const labelStyle = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Thông tin điểm lấy */}
      <div className="section-card">
        <h2 className="section-title">1. Thông tin điểm lấy hàng</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelStyle}>Tên điểm lấy / Khách hàng trả hàng *</label>
            <input value={form.nguon_ten} onChange={e => set('nguon_ten', e.target.value)}
              placeholder="VD: Công ty ABC, Nguyễn Văn A..."
              required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Địa chỉ điểm lấy</label>
            <input value={form.nguon_dia_chi} onChange={e => set('nguon_dia_chi', e.target.value)}
              placeholder="Số nhà, đường, quận..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SĐT liên hệ</label>
            <input value={form.nguon_sdt} onChange={e => set('nguon_sdt', e.target.value)}
              placeholder="0909..." style={inputStyle} />
          </div>
        </div>
      </div>

      {/* 2. Thông tin hàng */}
      <div className="section-card">
        <h2 className="section-title">2. Thông tin hàng thu hồi</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <label style={labelStyle}>Loại hàng</label>
            <input value={form.loai_hang} onChange={e => set('loai_hang', e.target.value)}
              placeholder="VD: Giấy A4, hàng lỗi, hàng thừa..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Số thùng</label>
            <input type="number" min="0" value={form.so_luong_thung}
              onChange={e => set('so_luong_thung', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Ngày lấy *</label>
            <input type="date" value={form.ngay_lay}
              onChange={e => set('ngay_lay', e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Ghi chú</label>
            <input value={form.ghi_chu} onChange={e => set('ghi_chu', e.target.value)}
              placeholder="Hàng dễ vỡ, lưu ý đặc biệt..." style={inputStyle} />
          </div>
        </div>
      </div>

      {/* 3. Kho nhận */}
      <div className="section-card">
        <h2 className="section-title">3. Kho nhận tại Hồng Hà</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <label style={labelStyle}>Kho nhận</label>
            <input value={form.kho_nhan} onChange={e => set('kho_nhan', e.target.value)}
              placeholder="VD: Kho Miền Nam, Kho HN..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Người nhận tại Hồng Hà</label>
            <input value={form.nguoi_nhan} onChange={e => set('nguoi_nhan', e.target.value)}
              placeholder="VD: Nguyễn Văn A..." style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-2 pb-4">
        <div>
          {result?.ok && (
            <span style={{ color:'#059669', fontWeight:600, fontSize:13 }}>✅ Đã lưu phiếu thu hồi thành công!</span>
          )}
          {result?.error && (
            <span style={{ color:'#dc2626', fontSize:13 }}>❌ {result.error}</span>
          )}
        </div>
        <button type="submit" disabled={saving || !form.nguon_ten.trim()}
          className="btn-primary flex items-center gap-2" style={{ opacity: saving ? 0.7 : 1 }}>
          {saving ? (
            <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Đang lưu…</>
          ) : '✓ Xác nhận phiếu thu hồi'}
        </button>
      </div>
    </form>
  );
}

// ── Trang chính ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [mode, setMode] = useState('giao_di');

  return (
    <div>
      {/* Header + mode toggle */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {mode === 'giao_di' ? 'Nhập phiếu xuất hàng' : 'Tạo phiếu thu hồi hàng'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'giao_di'
              ? 'Điền đầy đủ thông tin rồi bấm Xác nhận để lưu phiếu'
              : 'Nhập thông tin điểm lấy hàng cần thu hồi về kho'}
          </p>
        </div>

        {/* Toggle */}
        <div style={{ display:'flex', background:'#f3f4f6', borderRadius:10, padding:4, gap:3 }}>
          {[
            ['giao_di',  '🚚 Giao hàng đi', '#1d4ed8'],
            ['thu_hoi',  '📥 Thu hồi',       '#7c3aed'],
          ].map(([m, label, color]) => (
            <button key={m} type="button"
              onClick={() => setMode(m)}
              style={{
                padding:'8px 20px', borderRadius:7, border:'none', cursor:'pointer',
                fontSize:14, fontWeight:700,
                background: mode === m ? color : 'transparent',
                color: mode === m ? 'white' : '#6b7280',
                transition:'all .15s',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'giao_di' && <PhieuForm />}
      {mode === 'thu_hoi' && <PhieuHoiForm />}
    </div>
  );
}
