'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

const newNguoiNhan = () => ({ id: crypto.randomUUID(), ho_ten: '', so_dt: '' });
const newSanPham   = () => ({
  id: crypto.randomUUID(),
  san_pham_id: '',
  ma_sp: '',
  ten_sp: '',
  so_luong: 1,
  khoi_luong_quy_doi: 0,
  don_vi: 'thùng',
  la_moi: false,
});

const DAC_DIEM_MAP = {
  xuat_moi:   'Xuất mới',
  xuat_gui:   'Xuất hàng gửi',
  xuat_thieu: 'Xuất hàng thiếu',
};

// ── Component chính ───────────────────────────────────────────────────────────

export default function PhieuForm() {
  // ── State form ──
  const [form, setForm] = useState({
    ngay_nhap:     today(),
    so_phieu:      '',
    ma_kh:         '',
    ten_kh:        '',
    dia_chi_giao:  '',
    bo_phan:       '',
    ma_kho:        '',
    ten_kho:       '',
    kho_custom:    false,
    ngay_can_giao: '',
    dac_diem:      'xuat_moi',
    so_phieu_goc:  '',
    ghi_chu:       '',
  });

  const [nguoiNhanList, setNguoiNhanList] = useState([newNguoiNhan()]);
  const [sanPhamList,   setSanPhamList]   = useState([newSanPham()]);

  // ── Dữ liệu tham chiếu ──
  const [danhSachKho,      setDanhSachKho]      = useState([]);
  const [danhSachSanPham,  setDanhSachSanPham]  = useState([]);
  const [danhSachKhachHang, setDanhSachKhachHang] = useState([]);

  // ── UI state ──
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState(null);
  const [khLookup,    setKhLookup]    = useState('idle'); // idle | loading | found | not_found
  const [showAddSP,   setShowAddSP]   = useState(false);
  const [newSP,       setNewSP]       = useState({ ma_sp: '', ten_sp: '', khoi_luong_quy_doi: '', don_vi: 'thùng' });

  const toastTimer = useRef(null);

  // ── Hiển thị toast ──
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
        const [khoRes, spRes, khRes] = await Promise.all([
          fetch('/api/kho'),
          fetch('/api/san-pham'),
          fetch('/api/khach-hang'),
        ]);
        const [khoData, spData, khData] = await Promise.all([
          khoRes.json(),
          spRes.json(),
          khRes.json(),
        ]);
        setDanhSachKho(khoData.data || []);
        setDanhSachSanPham(spData.data || []);
        setDanhSachKhachHang(khData.data || []);
      } catch (e) {
        showToast('Không tải được dữ liệu tham chiếu', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadRefs();
  }, [showToast]);

  // ── Lookup khách hàng theo mã ──
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

  // ── Handlers form ──
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleKhoChange = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setField('kho_custom', true);
      setField('ma_kho', '');
      setField('ten_kho', '');
    } else {
      const kho = danhSachKho.find(k => k.ma_kho === val);
      setField('kho_custom', false);
      setField('ma_kho', val);
      setField('ten_kho', kho?.ten_kho || '');
    }
  };

  // ── Người nhận ──
  const updateNguoiNhan = (id, key, val) =>
    setNguoiNhanList(l => l.map(n => n.id === id ? { ...n, [key]: val } : n));
  const addNguoiNhan    = () => setNguoiNhanList(l => [...l, newNguoiNhan()]);
  const removeNguoiNhan = (id) =>
    setNguoiNhanList(l => l.length > 1 ? l.filter(n => n.id !== id) : l);

  // ── Sản phẩm nặng ──
  const updateSanPham = (id, key, val) =>
    setSanPhamList(l => l.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, [key]: val };
      if (key === 'san_pham_id') {
        const sp = danhSachSanPham.find(p => p.id === val);
        if (sp) {
          updated.ma_sp              = sp.ma_sp;
          updated.ten_sp             = sp.ten_sp;
          updated.khoi_luong_quy_doi = sp.khoi_luong_quy_doi;
          updated.don_vi             = sp.don_vi;
          updated.la_moi             = false;
        }
      }
      return updated;
    }));

  const addSanPham    = () => setSanPhamList(l => [...l, newSanPham()]);
  const removeSanPham = (id) =>
    setSanPhamList(l => l.length > 1 ? l.filter(s => s.id !== id) : l);

  const tongKhoiLuong = sanPhamList.reduce(
    (sum, s) => sum + (parseFloat(s.so_luong) || 0) * (parseFloat(s.khoi_luong_quy_doi) || 0),
    0
  );

  // ── Thêm sản phẩm mới vào danh sách ──
  const handleAddNewSP = async () => {
    if (!newSP.ma_sp || !newSP.ten_sp || !newSP.khoi_luong_quy_doi) {
      showToast('Vui lòng điền đủ thông tin sản phẩm mới', 'error');
      return;
    }
    try {
      const res = await fetch('/api/san-pham', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSP),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDanhSachSanPham(l => [...l, data.data]);
      setNewSP({ ma_sp: '', ten_sp: '', khoi_luong_quy_doi: '', don_vi: 'thùng' });
      setShowAddSP(false);
      showToast(`Đã thêm sản phẩm "${data.data.ten_sp}"`);
    } catch (e) {
      showToast(e.message || 'Lỗi thêm sản phẩm', 'error');
    }
  };

  // ── Import danh sách khách hàng từ Excel ──
  const handleImportKH = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'binary' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        // Chuẩn hoá cột: mã KH, tên KH, địa chỉ
        const khData = rows.map(r => ({
          ma_kh:  String(r['Mã KH'] || r['ma_kh'] || r['MA_KH'] || '').trim(),
          ten_kh: String(r['Tên KH'] || r['ten_kh'] || r['TEN_KH'] || '').trim(),
          dia_chi: String(r['Địa chỉ'] || r['dia_chi'] || r['DIA_CHI'] || '').trim(),
        })).filter(k => k.ma_kh && k.ten_kh);

        const res = await fetch('/api/khach-hang', {
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
    const khPhieu = {
      'Ngày nhập phiếu':    form.ngay_nhap,
      'Số phiếu':           form.so_phieu,
      'Mã khách hàng':      form.ma_kh,
      'Tên khách hàng':     form.ten_kh,
      'Địa chỉ giao hàng':  form.dia_chi_giao,
      'Bộ phận':            form.bo_phan,
      'Mã kho':             form.ma_kho,
      'Tên kho':            form.ten_kho,
      'Ngày cần giao':      form.ngay_can_giao,
      'Đặc điểm':           DAC_DIEM_MAP[form.dac_diem],
      'Số phiếu gốc':       form.so_phieu_goc,
      'Ghi chú':            form.ghi_chu,
    };

    const wb = XLSX.utils.book_new();

    // Sheet 1: Thông tin phiếu
    const infoRows = Object.entries(khPhieu).map(([k, v]) => ({ 'Trường': k, 'Giá trị': v }));
    const wsInfo = XLSX.utils.json_to_sheet(infoRows);
    wsInfo['!cols'] = [{ wch: 25 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Thông tin phiếu');

    // Sheet 2: Người nhận
    const wsNN = XLSX.utils.json_to_sheet(
      nguoiNhanList.map((n, i) => ({
        'STT': i + 1,
        'Họ và tên': n.ho_ten,
        'Số điện thoại': n.so_dt,
      }))
    );
    wsNN['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsNN, 'Người nhận');

    // Sheet 3: Sản phẩm nặng
    const spRows = sanPhamList.map((s, i) => ({
      'STT':                     i + 1,
      'Mã SP':                   s.ma_sp,
      'Tên sản phẩm':            s.ten_sp,
      'Số lượng':                s.so_luong,
      'Đơn vị':                  s.don_vi,
      'KL quy đổi (kg/đvt)':    s.khoi_luong_quy_doi,
      'KL tổng (kg)':            (parseFloat(s.so_luong) || 0) * (parseFloat(s.khoi_luong_quy_doi) || 0),
    }));
    spRows.push({
      'STT': '',
      'Mã SP': '',
      'Tên sản phẩm': 'TỔNG',
      'Số lượng': '',
      'Đơn vị': '',
      'KL quy đổi (kg/đvt)': '',
      'KL tổng (kg)': tongKhoiLuong,
    });
    const wsSP = XLSX.utils.json_to_sheet(spRows);
    wsSP['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsSP, 'Sản phẩm nặng');

    XLSX.writeFile(wb, `Phieu_${form.so_phieu || 'export'}_${form.ngay_nhap}.xlsx`);
    showToast('Đã xuất file Excel');
  };

  // ── Submit lưu phiếu ──
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
      const payload = {
        ...form,
        nguoi_nhan: nguoiNhanList.filter(n => n.ho_ten.trim()),
        san_pham:   sanPhamList.filter(s => s.ten_sp.trim()),
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
        {/* ─── 1. Thông tin cơ bản ─── */}
        <div className="section-card">
          <h2 className="section-title">1. Thông tin phiếu</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div>
              <label className="label">Bộ phận lên đơn *</label>
              <div className="flex gap-2">
                {['MT', 'GT', 'B2B'].map(bp => (
                  <button key={bp} type="button"
                    onClick={() => setField('bo_phan', bp)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${form.bo_phan === bp
                        ? bp === 'MT' ? 'bg-purple-600 text-white border-purple-600'
                          : bp === 'GT' ? 'bg-green-600 text-white border-green-600'
                          : 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}>
                    {bp}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* Mã + Tên khách hàng */}
            <div>
              <label className="label">Mã khách hàng</label>
              <div className="relative">
                <input type="text" className="input-field pr-8" placeholder="VD: KH-001"
                  value={form.ma_kh}
                  onChange={e => setField('ma_kh', e.target.value)} />
                {khLookup === 'found' && (
                  <span className="absolute right-2 top-2.5 text-green-500 text-xs">✓</span>
                )}
              </div>
              {khLookup === 'not_found' && (
                <p className="text-xs text-amber-600 mt-1">⚠ Không tìm thấy trong danh sách</p>
              )}
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
                {danhSachKho.map(k => (
                  <option key={k.ma_kho} value={k.ma_kho}>{k.ma_kho} – {k.ten_kho}</option>
                ))}
                <option value="__custom__">✏ Nhập kho khác…</option>
              </select>
            </div>
            {form.kho_custom && (
              <>
                <div>
                  <label className="label">Mã kho (nhập tay)</label>
                  <input type="text" className="input-field" placeholder="Mã kho"
                    value={form.ma_kho}
                    onChange={e => setField('ma_kho', e.target.value)} />
                </div>
                <div>
                  <label className="label">Tên kho (nhập tay)</label>
                  <input type="text" className="input-field" placeholder="Tên kho"
                    value={form.ten_kho}
                    onChange={e => setField('ten_kho', e.target.value)} />
                </div>
              </>
            )}
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
                  value={nn.ho_ten}
                  onChange={e => updateNguoiNhan(nn.id, 'ho_ten', e.target.value)} />
                <input type="tel" className="input-field max-w-[180px]" placeholder="Số điện thoại"
                  value={nn.so_dt}
                  onChange={e => updateNguoiNhan(nn.id, 'so_dt', e.target.value)} />
                <button type="button" className="btn-danger" title="Xóa"
                  onClick={() => removeNguoiNhan(nn.id)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-add" onClick={addNguoiNhan}>
            + Thêm người nhận
          </button>
        </div>

        {/* ─── 4. Sản phẩm nặng ─── */}
        <div className="section-card">
          <h2 className="section-title">4. Sản phẩm nặng trong đơn</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 w-6">#</th>
                  <th className="pb-2">Sản phẩm</th>
                  <th className="pb-2 w-24">Số lượng</th>
                  <th className="pb-2 w-20">Đơn vị</th>
                  <th className="pb-2 w-32">KL quy đổi (kg)</th>
                  <th className="pb-2 w-28 text-right">KL tổng</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sanPhamList.map((sp, i) => (
                  <tr key={sp.id}>
                    <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2 pr-2">
                      {sp.la_moi ? (
                        <input type="text" className="input-field" placeholder="Tên sản phẩm mới"
                          value={sp.ten_sp}
                          onChange={e => updateSanPham(sp.id, 'ten_sp', e.target.value)} />
                      ) : (
                        <select className="input-field"
                          value={sp.san_pham_id}
                          onChange={e => {
                            if (e.target.value === '__new__') {
                              updateSanPham(sp.id, 'la_moi', true);
                            } else {
                              updateSanPham(sp.id, 'san_pham_id', e.target.value);
                            }
                          }}>
                          <option value="">-- Chọn sản phẩm --</option>
                          {danhSachSanPham.map(p => (
                            <option key={p.id} value={p.id}>{p.ten_sp}</option>
                          ))}
                          <option value="__new__">✏ Nhập sản phẩm mới…</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="1" className="input-field" placeholder="SL"
                        value={sp.so_luong}
                        onChange={e => updateSanPham(sp.id, 'so_luong', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="text" className="input-field" placeholder="thùng"
                        value={sp.don_vi}
                        onChange={e => updateSanPham(sp.id, 'don_vi', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" step="0.001" min="0" className="input-field"
                        placeholder="kg/đvt"
                        value={sp.khoi_luong_quy_doi}
                        onChange={e => updateSanPham(sp.id, 'khoi_luong_quy_doi', e.target.value)} />
                    </td>
                    <td className="py-2 text-right font-medium text-gray-700">
                      {((parseFloat(sp.so_luong) || 0) * (parseFloat(sp.khoi_luong_quy_doi) || 0)).toFixed(2)} kg
                    </td>
                    <td className="py-2">
                      <button type="button" className="btn-danger"
                        onClick={() => removeSanPham(sp.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={5} className="pt-2 text-right text-sm font-semibold text-gray-600">
                    Tổng khối lượng:
                  </td>
                  <td className="pt-2 text-right font-bold text-blue-700">
                    {tongKhoiLuong.toFixed(2)} kg
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-4 mt-2">
            <button type="button" className="btn-add" onClick={addSanPham}>
              + Thêm sản phẩm
            </button>
            <button type="button" className="btn-add text-green-600 hover:text-green-800"
              onClick={() => setShowAddSP(v => !v)}>
              + Định nghĩa sản phẩm mới vào danh sách
            </button>
          </div>

          {/* Form thêm SP mới vào danh sách */}
          {showAddSP && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-800 mb-3">Thêm sản phẩm mới vào danh sách</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="label text-xs">Mã SP *</label>
                  <input type="text" className="input-field" placeholder="SP-XXX"
                    value={newSP.ma_sp} onChange={e => setNewSP(v => ({ ...v, ma_sp: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Tên sản phẩm *</label>
                  <input type="text" className="input-field" placeholder="Tên SP"
                    value={newSP.ten_sp} onChange={e => setNewSP(v => ({ ...v, ten_sp: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">KL quy đổi (kg/đvt) *</label>
                  <input type="number" step="0.001" min="0" className="input-field" placeholder="kg"
                    value={newSP.khoi_luong_quy_doi}
                    onChange={e => setNewSP(v => ({ ...v, khoi_luong_quy_doi: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">Đơn vị tính</label>
                  <input type="text" className="input-field" placeholder="thùng"
                    value={newSP.don_vi} onChange={e => setNewSP(v => ({ ...v, don_vi: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" className="btn-primary text-sm py-1.5" onClick={handleAddNewSP}>
                  Lưu vào danh sách
                </button>
                <button type="button" className="btn-secondary text-sm py-1.5"
                  onClick={() => setShowAddSP(false)}>Hủy</button>
              </div>
            </div>
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

          {/* Số phiếu gốc khi xuất gửi / xuất thiếu */}
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
            <button type="button" className="btn-secondary">
              Lưu nháp
            </button>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
              {saving ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Đang lưu…
                </>
              ) : '✓ Xác nhận phiếu'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
