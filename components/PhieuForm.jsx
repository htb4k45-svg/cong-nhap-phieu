'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const newNguoiNhan = () => ({ id: crypto.randomUUID(), ho_ten: '', so_dt: '' });

const DAC_DIEM_MAP = {
  xuat_moi:   'Xuất mới',
  xuat_gui:   'Xuất hàng gửi',
  xuat_thieu: 'Xuất hàng thiếu',
};

// Sản phẩm cố định
const SP_LIST = [
  { ma_sp: 'A3',   ten_sp: 'Sản phẩm A3' },
  { ma_sp: 'A4',   ten_sp: 'Sản phẩm A4' },
  { ma_sp: 'VO',   ten_sp: 'Nhóm Vở' },
  { ma_sp: 'GVS',  ten_sp: 'Giấy vệ sinh' },
  { ma_sp: 'HD',   ten_sp: 'Hóa đơn',                    doc: true }, // tài liệu, không tính thùng
  { ma_sp: 'HDPL', ten_sp: 'Hợp đồng/phụ lục Hợp đồng', doc: true }, // tài liệu, không tính thùng
];

// B2B: Ream ÷ 5, làm tròn lên → thùng
function reamToThung(ream) {
  const r = parseFloat(ream) || 0;
  return r > 0 ? Math.ceil(r / 5) : 0;
}

// ── Component chính ───────────────────────────────────────────────────────────

export default function PhieuForm() {
  // ── State form ──
  const [form, setForm] = useState({
    bo_phan:       '',
    ma_lenh:       '',
    ngay_nhap:     today(),
    so_phieu:      '',
    ma_kh:         '',
    ten_kh:        '',
    dia_chi_giao:  '',
    ma_kho:        '',
    ten_kho:       '',
    kho_custom:    false,
    ngay_can_giao: '',
    dac_diem:      'xuat_moi',
    so_phieu_goc:  '',
    ghi_chu:       '',
  });

  const coMaLenh = ['MT', 'GT'].includes(form.bo_phan);
  const isB2B    = form.bo_phan === 'B2B';

  const [nguoiNhanList, setNguoiNhanList] = useState([newNguoiNhan()]);

  // ── Sản phẩm: { A3, A4, VO, GVS } — giá trị nhập (thùng với MT/GT, ream với B2B)
  const [sanPham, setSanPham] = useState({ A3: '', A4: '', VO: '', GVS: '', HD: '', HDPL: '' });

  // ── Dữ liệu tham chiếu ──
  const [danhSachKho,       setDanhSachKho]       = useState([]);
  const [danhSachKhachHang, setDanhSachKhachHang] = useState([]);

  // ── UI state ──
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [khLookup,  setKhLookup]  = useState('idle');

  const toastTimer = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load dữ liệu ban đầu ──
  useEffect(() => {
    async function loadRefs() {
      setLoading(true);
      try {
        const [khoRes, khRes] = await Promise.all([
          fetch('/api/kho'),
          fetch('/api/khach-hang'),
        ]);
        const [khoData, khData] = await Promise.all([khoRes.json(), khRes.json()]);
        setDanhSachKho(khoData.kho || khoData.data || []);
        setDanhSachKhachHang(khData.data || []);
      } catch {
        showToast('Không tải được dữ liệu tham chiếu', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadRefs();
  }, [showToast]);

  // ── Lookup khách hàng ──
  useEffect(() => {
    if (!form.ma_kh.trim()) {
      setForm(f => ({ ...f, ten_kh: '', dia_chi_giao: '' }));
      setKhLookup('idle');
      return;
    }
    const kh = danhSachKhachHang.find(
      k => k.ma_kh.toLowerCase() === form.ma_kh.trim().toLowerCase()
    );
    if (kh) {
      setForm(f => ({ ...f, ten_kh: kh.ten_kh, dia_chi_giao: f.dia_chi_giao || kh.dia_chi || '' }));
      setKhLookup('found');
    } else {
      setKhLookup(form.ma_kh.length >= 2 ? 'not_found' : 'idle');
    }
  }, [form.ma_kh, danhSachKhachHang]);

  // ── Handlers ──
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleKhoChange = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setField('kho_custom', true); setField('ma_kho', ''); setField('ten_kho', '');
    } else {
      const kho = danhSachKho.find(k => k.ma_kho === val);
      setField('kho_custom', false); setField('ma_kho', val); setField('ten_kho', kho?.ten_kho || '');
    }
  };

  const updateNguoiNhan = (id, key, val) =>
    setNguoiNhanList(l => l.map(n => n.id === id ? { ...n, [key]: val } : n));
  const addNguoiNhan    = () => setNguoiNhanList(l => [...l, newNguoiNhan()]);
  const removeNguoiNhan = (id) =>
    setNguoiNhanList(l => l.length > 1 ? l.filter(n => n.id !== id) : l);

  // ── Tính thùng từ sanPham ──
  const getSanPhamPayload = () => {
    return SP_LIST
      .filter(sp => parseFloat(sanPham[sp.ma_sp]) > 0)
      .map(sp => {
        const raw   = parseFloat(sanPham[sp.ma_sp]) || 0;
        const thung = sp.doc ? raw : (isB2B ? reamToThung(raw) : raw); // tài liệu không quy đổi thùng
        return { ma_sp: sp.ma_sp, ten_sp: sp.ten_sp, so_luong: raw, so_luong_thung: thung };
      });
  };

  const tongThung = SP_LIST.filter(sp => !sp.doc).reduce((sum, sp) => {
    const raw = parseFloat(sanPham[sp.ma_sp]) || 0;
    return sum + (isB2B ? reamToThung(raw) : raw);
  }, 0);

  // ── Import KH từ Excel ──
  const handleImportKH = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        const khData = rows.map(r => ({
          ma_kh:  String(r['Mã KH'] || r['ma_kh'] || r['MA_KH'] || '').trim(),
          ten_kh: String(r['Tên KH'] || r['ten_kh'] || r['TEN_KH'] || '').trim(),
          dia_chi: String(r['Địa chỉ'] || r['dia_chi'] || r['DIA_CHI'] || '').trim(),
        })).filter(k => k.ma_kh && k.ten_kh);
        const res  = await fetch('/api/khach-hang', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khach_hang: khData }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDanhSachKhachHang(data.data || []);
        showToast(`Import thành công ${khData.length} khách hàng`);
      } catch (err) {
        showToast('Lỗi import: ' + err.message, 'error');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // ── Export Excel ──
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Thông tin phiếu
    const infoRows = Object.entries({
      'Ngày nhập phiếu':   form.ngay_nhap,
      'Số phiếu':          form.so_phieu,
      'Mã khách hàng':     form.ma_kh,
      'Tên khách hàng':    form.ten_kh,
      'Địa chỉ giao':      form.dia_chi_giao,
      'Bộ phận':           form.bo_phan,
      'Kho':               form.ten_kho || form.ma_kho,
      'Ngày cần giao':     form.ngay_can_giao,
      'Đặc điểm':          DAC_DIEM_MAP[form.dac_diem],
      'Ghi chú':           form.ghi_chu,
    }).map(([k, v]) => ({ 'Trường': k, 'Giá trị': v }));
    const wsInfo = XLSX.utils.json_to_sheet(infoRows);
    wsInfo['!cols'] = [{ wch: 22 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Thông tin phiếu');

    // Sheet 2: Hàng hóa
    const spPayload = getSanPhamPayload();
    const spRows = spPayload.map((sp, i) => ({
      STT: i + 1,
      'Mã SP': sp.ma_sp,
      'Tên SP': sp.ten_sp,
      [isB2B ? 'Số lượng (Ream)' : 'Số thùng']: sp.so_luong,
      ...(isB2B ? { 'Số thùng (quy đổi)': sp.so_luong_thung } : {}),
    }));
    spRows.push({ STT: '', 'Mã SP': '', 'Tên SP': 'TỔNG THÙNG', [isB2B ? 'Số lượng (Ream)' : 'Số thùng']: tongThung });
    const wsSP = XLSX.utils.json_to_sheet(spRows);
    wsSP['!cols'] = [{ wch: 5 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSP, 'Hàng hóa');

    XLSX.writeFile(wb, `Phieu_${form.so_phieu || 'export'}_${form.ngay_nhap}.xlsx`);
    showToast('Đã xuất file Excel');
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.so_phieu || !form.ten_kh || !form.bo_phan) {
      showToast('Vui lòng điền Số phiếu, Tên khách hàng và Bộ phận', 'error');
      return;
    }
    if (['xuat_gui', 'xuat_thieu'].includes(form.dac_diem) && !form.so_phieu_goc) {
      showToast('Vui lòng nhập Số phiếu xuất gốc', 'error');
      return;
    }
    setSaving(true);
    try {
      const spPayload = getSanPhamPayload();
      const payload = {
        ...form,
        nguoi_nhan:  nguoiNhanList.filter(n => n.ho_ten.trim()),
        san_pham:    spPayload,
        tong_thung:  tongThung,
        don_vi_sp:   isB2B ? 'ream' : 'thung',
      };
      const res = await fetch('/api/phieu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Đã lưu phiếu ${form.so_phieu} thành công!`);
    } catch (err) {
      showToast('Lỗi lưu phiếu: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-3 text-gray-600">Đang tải dữ liệu…</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium
          ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ─── 1. Thông tin phiếu ─── */}
        <div className="section-card">
          <h2 className="section-title">1. Thông tin phiếu</h2>

          <div className="mb-5">
            <label className="label">Bộ phận lên đơn *</label>
            <div className="flex gap-2 max-w-xs">
              {['MT', 'GT', 'B2B'].map(bp => (
                <button key={bp} type="button"
                  onClick={() => { setField('bo_phan', bp); setSanPham({ A3:'', A4:'', VO:'', GVS:'', HD:'', HDPL:'' }); }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors
                    ${form.bo_phan === bp
                      ? bp === 'MT' ? 'bg-purple-600 text-white border-purple-600'
                        : bp === 'GT' ? 'bg-green-600 text-white border-green-600'
                        : 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>
                  {bp}
                </button>
              ))}
            </div>
          </div>

          {form.bo_phan && (
            <>
              {coMaLenh && (
                <div className="mb-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Mã Lệnh *</label>
                      <input type="text" className="input-field" placeholder="VD: ML-2024-001"
                        value={form.ma_lenh}
                        onChange={e => setField('ma_lenh', e.target.value)} required={coMaLenh} />
                    </div>
                    <div>
                      <label className="label">Ngày nhập phiếu *</label>
                      <input type="date" className="input-field"
                        value={form.ngay_nhap}
                        onChange={e => setField('ngay_nhap', e.target.value)} required />
                    </div>
                  </div>
                  <div className="mt-3 ml-6 pl-4 border-l-2 border-purple-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-purple-500 font-medium">↳ Phiếu thuộc Mã Lệnh {form.ma_lenh || '...'}</span>
                    </div>
                    <div className="max-w-sm">
                      <label className="label">Số phiếu *</label>
                      <input type="text" className="input-field" placeholder="VD: PX-2024-001"
                        value={form.so_phieu}
                        onChange={e => setField('so_phieu', e.target.value)} required />
                    </div>
                  </div>
                </div>
              )}

              {form.bo_phan === 'B2B' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="label">Ngày nhập phiếu *</label>
                    <input type="date" className="input-field"
                      value={form.ngay_nhap}
                      onChange={e => setField('ngay_nhap', e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Số phiếu *</label>
                    <input type="text" className="input-field" placeholder="VD: PX-2024-001"
                      value={form.so_phieu}
                      onChange={e => setField('so_phieu', e.target.value)} required />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Mã khách hàng</label>
                  <div className="relative">
                    <input type="text" className="input-field pr-8" placeholder="VD: KH-001"
                      value={form.ma_kh}
                      onChange={e => setField('ma_kh', e.target.value)} />
                    {khLookup === 'found' && <span className="absolute right-2 top-2.5 text-green-500 text-xs">✓</span>}
                  </div>
                  {khLookup === 'not_found' && <p className="text-xs text-amber-600 mt-1">⚠ Không tìm thấy trong danh sách</p>}
                </div>
                <div>
                  <label className="label">Tên khách hàng *</label>
                  <input type="text" className="input-field" placeholder="Tự động hoặc nhập tay"
                    value={form.ten_kh}
                    onChange={e => setField('ten_kh', e.target.value)} required />
                </div>
                <div className="flex items-end">
                  <label className="btn-secondary cursor-pointer w-full text-center text-xs">
                    📤 Import Excel KH
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportKH} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="label">Địa chỉ giao hàng</label>
                  <input type="text" className="input-field" placeholder="Địa chỉ nhận hàng"
                    value={form.dia_chi_giao}
                    onChange={e => setField('dia_chi_giao', e.target.value)} />
                </div>
                <div>
                  <label className="label">Ngày cần giao</label>
                  <input type="date" className="input-field"
                    value={form.ngay_can_giao}
                    onChange={e => setField('ngay_can_giao', e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── 2. Kho xuất ─── */}
        <div className="section-card">
          <h2 className="section-title">2. Kho xuất hàng</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Mã kho xuất</label>
              <select className="input-field" onChange={handleKhoChange}
                value={form.kho_custom ? '__custom__' : form.ma_kho}>
                <option value="">-- Chọn kho --</option>
                {/* Hà Nội đứng đầu, các tỉnh khác gom vào "Kho khác" */}
                {[
                  { label: 'Hà Nội',    list: danhSachKho.filter(k => k.tinh_thanh === 'Hà Nội') },
                  { label: 'Kho khác',  list: danhSachKho.filter(k => k.tinh_thanh !== 'Hà Nội') },
                ].filter(g => g.list.length > 0).map(({ label, list }) => (
                  <optgroup key={label} label={label}>
                    {list.map(k => (
                      <option key={k.ma_kho} value={k.ma_kho}>{k.ten_kho}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ─── 3. Người nhận ─── */}
        <div className="section-card">
          <h2 className="section-title">3. Thông tin người nhận hàng</h2>
          <div className="space-y-3">
            {nguoiNhanList.map((nn, i) => (
              <div key={nn.id} className="flex gap-3 items-center">
                <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                <input type="text" className="input-field" placeholder="Họ và tên người nhận"
                  value={nn.ho_ten} onChange={e => updateNguoiNhan(nn.id, 'ho_ten', e.target.value)} />
                <input type="tel" className="input-field max-w-[180px]" placeholder="Số điện thoại"
                  value={nn.so_dt} onChange={e => updateNguoiNhan(nn.id, 'so_dt', e.target.value)} />
                <button type="button" className="btn-danger" onClick={() => removeNguoiNhan(nn.id)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-add" onClick={addNguoiNhan}>+ Thêm người nhận</button>
        </div>

        {/* ─── 4. Hàng hóa ─── */}
        <div className="section-card">
          <h2 className="section-title">4. Hàng hóa trong đơn</h2>

          {!form.bo_phan && (
            <p className="text-sm text-gray-400 italic">Chọn bộ phận trước để nhập hàng hóa.</p>
          )}

          {form.bo_phan && (
            <>
              {isB2B && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-4 font-medium">
                  📦 B2B: nhập số <strong>Ream</strong> — hệ thống tự quy đổi sang thùng (5 ream = 1 thùng, làm tròn lên)
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="pb-2 w-8">#</th>
                      <th className="pb-2">Sản phẩm</th>
                      <th className="pb-2 w-36">{isB2B ? 'Số lượng (Ream)' : 'Số thùng'}</th>
                      {isB2B && <th className="pb-2 w-32 text-right">Thùng (quy đổi)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {SP_LIST.map((sp, i) => {
                      const val   = sanPham[sp.ma_sp];
                      const thung = isB2B ? reamToThung(val) : (parseFloat(val) || 0);
                      return (
                        <tr key={sp.ma_sp}>
                          <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="py-2 pr-3">
                            <span className="font-medium text-gray-700">{sp.ten_sp}</span>
                            <span className="ml-2 text-xs text-gray-400">({sp.ma_sp})</span>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number" min="0" step="1"
                              className="input-field"
                              placeholder="0"
                              value={val}
                              onChange={e => setSanPham(prev => ({ ...prev, [sp.ma_sp]: e.target.value }))}
                            />
                          </td>
                          {isB2B && (
                            <td className="py-2 text-right">
                              {sp.doc
                                ? <span className="text-gray-300">—</span>
                                : parseFloat(val) > 0
                                  ? <span className="font-bold text-blue-700">{thung} thùng</span>
                                  : <span className="text-gray-300">—</span>
                              }
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={isB2B ? 3 : 2} className="pt-2 text-right text-sm font-semibold text-gray-600">
                        Tổng thùng:
                      </td>
                      <td className="pt-2 text-right font-bold text-blue-700">
                        {tongThung > 0 ? `${tongThung} thùng` : <span className="text-gray-300">0</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ─── 5. Đặc điểm phiếu ─── */}
        <div className="section-card">
          <h2 className="section-title">5. Đặc điểm phiếu xuất</h2>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(DAC_DIEM_MAP).map(([val, label]) => (
              <label key={val}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors
                  ${form.dac_diem === val
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>
                <input type="radio" name="dac_diem" value={val} className="hidden"
                  checked={form.dac_diem === val}
                  onChange={() => setField('dac_diem', val)} />
                {label}
              </label>
            ))}
          </div>

          {['xuat_gui', 'xuat_thieu'].includes(form.dac_diem) && (
            <div className="mt-4 max-w-xs">
              <label className="label">Số phiếu xuất gốc *</label>
              <input type="text" className="input-field" placeholder="Nhập số phiếu gốc"
                value={form.so_phieu_goc}
                onChange={e => setField('so_phieu_goc', e.target.value)} required />
            </div>
          )}

          <div className="mt-4">
            <label className="label">Ghi chú</label>
            <textarea className="input-field resize-none" rows={2} placeholder="Ghi chú thêm…"
              value={form.ghi_chu}
              onChange={e => setField('ghi_chu', e.target.value)} />
          </div>
        </div>

        {/* ─── Action buttons ─── */}
        <div className="flex justify-between items-center pt-2 pb-4">
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={handleExport}>
            📥 Xuất Excel
          </button>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary">Lưu nháp</button>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
              {saving ? (
                <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Đang lưu…</>
              ) : '✓ Xác nhận phiếu'}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
