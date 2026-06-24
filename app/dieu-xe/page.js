'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

const TRANG_THAI = {
  cho_giao:  { label: 'Chờ giao',  color: '#2563eb', bg: '#dbeafe', next: 'dang_giao' },
  dang_giao: { label: 'Đang giao', color: '#d97706', bg: '#fef3c7', next: 'da_giao'   },
  da_giao:   { label: 'Đã giao',   color: '#059669', bg: '#d1fae5', next: 'cho_giao'  },
  huy:       { label: 'Huỷ',       color: '#dc2626', bg: '#fee2e2', next: 'cho_giao'  },
};

const BP_COLOR = { MT: '#7c3aed', GT: '#0891b2', B2B: '#15803d' };

function toDateStr(d) { return d.toISOString().split('T')[0]; }
function fmtVN(s)     { if (!s) return '—'; const [y,m,d]=s.split('-'); return `${d}/${m}/${y}`; }
function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  if (sameDay) return hm;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${hm}`;
}

function normVN(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

const KHU_VUC_PATTERNS = [
  [/\bQU[Aậ]N\s+(\d{1,2})\b/i,        m => `Quận ${m[1]}`],
  [/\bQ\.?\s*(\d{1,2})\b/,             m => `Quận ${m[1]}`],
  [/TP\.?\s*TH[UÚ]\s*Đ[UÚ]C/i, () => 'TP Thủ Đức'],
  [/LONG\s*AN/i,                        () => 'Long An'],
  [/B[IÌ]NH\s*D[UÙ][OƠ]NG/i, () => 'Bình Dương'],
  [/Đ[OÔ]NG\s*NAI/i,          () => 'Đồng Nai'],
  [/H[ÀA]\s*N[ỘO]I/i,         () => 'Hà Nội'],
];

function extractKhuVucFallback(diaChi) {
  if (!diaChi) return 'Chưa rõ';
  for (const [re, fn] of KHU_VUC_PATTERNS) {
    const m = diaChi.match(re);
    if (m) return fn(m);
  }
  const parts = diaChi.split(',');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].trim();
    if (last.length >= 3 && last.length <= 30) return last;
  }
  return 'Khác';
}

function buildHuyenMatcher(wardList) {
  if (!wardList || wardList.length === 0) return null;
  const entries = [];
  for (const w of wardList) {
    const fullNorm  = normVN(w.ten_xa);
    const shortNorm = normVN(w.ten_xa_ngan || '');
    const label     = w.ten_xa_ngan || w.ten_xa;
    entries.push({ norm: fullNorm, short: shortNorm, label, loai: w.loai_xa || null });
  }
  entries.sort((a, b) => b.norm.length - a.norm.length);
  return function matchWard(diaChi) {
    const addr = normVN(diaChi);
    for (const e of entries) {
      if (e.short.length >= 3 && addr.includes(e.short)) return { label: e.label, loai: e.loai };
      if (e.norm.length  >= 3 && addr.includes(e.norm))  return { label: e.label, loai: e.loai };
    }
    return null;
  };
}

function extractKhuVuc(diaChi, matcherFn) {
  if (!diaChi) return { name: 'Chưa rõ', loai: null };
  if (matcherFn) {
    const m = matcherFn(diaChi);
    if (m) return { name: m.label, loai: m.loai };
  }
  const d = diaChi.toLowerCase();
  const loai = /ph[ưu][ờo]ng/.test(d) ? 'phường'
             : /\bx[ãa]\b/.test(d)    ? 'xã'
             : /th[ỏi]\s*tr[ấa]n/.test(d) ? 'thị trấn'
             : null;
  return { name: extractKhuVucFallback(diaChi), loai };
}

function getTongThung(p) {
  // Ưu tiên tong_thung đã tính sẵn từ parser (đã quy đổi đúng đơn vị)
  if (p.tong_thung !== undefined && p.tong_thung !== null) return p.tong_thung;
  if (p.san_pham && p.san_pham.length) {
    return p.san_pham.reduce(function(acc, sp) {
      return acc + (sp.so_luong_thung !== undefined ? sp.so_luong_thung : (sp.so_luong || 0));
    }, 0);
  }
  return 0;
}

export default function DieuXePage() {
  const [ngayTu, setNgayTu]           = useState(toDateStr(new Date()));
  const [ngayDen, setNgayDen]         = useState(toDateStr(new Date()));
  const [phieuList, setPhieuList]     = useState([]);
  const [statusMap, setStatusMap]     = useState({});
  const [loading, setLoading]         = useState(false);
  const [sheetErrors, setSheetErrors] = useState([]);
  const [updatingKey, setUpdatingKey] = useState(null);
  const [filterBP, setFilterBP]       = useState('TAT_CA');
  const [filterTT, setFilterTT]       = useState('TAT_CA');
  const [filterLaiXe, setFilterLaiXe] = useState(null);
  const [activeDriver, setActiveDriver] = useState(null); // chế độ giỏ hàng
  const [searchQ, setSearchQ]         = useState('');
  const [groupByArea, setGroupByArea] = useState(true);
  const [lastFetch, setLastFetch]     = useState(null);
  const [huyenList, setHuyenList]     = useState([]);
  const [driverList, setDriverList]   = useState([]);
  const [assigningKey, setAssigningKey] = useState(null);
  const [toast, setToast]               = useState(null);
  const [lenhModal, setLenhModal]         = useState(null); // driver name
  const [lenhDownloading, setLenhDownloading] = useState(false);
  const [chotModal, setChotModal]         = useState(null); // driver name
  const [chotData, setChotData]           = useState({});   // { km_bat_dau, km_ket_thuc, ghi_chu, donHoan: Set }
  const [chotSaving, setChotSaving]       = useState(false);
  const [chotSummary, setChotSummary]     = useState(null); // { driver, date, thieu: [{so_phieu,ten_kh,ghi_chu}] }
  const [phieuHoiList, setPhieuHoiList]   = useState([]);
  const [hoiModal, setHoiModal]           = useState(null); // driver name
  const [hoiForm, setHoiForm]             = useState({ nguon_ten:'', nguon_dia_chi:'', nguon_sdt:'', loai_hang:'', so_luong_thung:'', ghi_chu:'' });
  const [hoiSaving, setHoiSaving]         = useState(false);
  const [hoiThenLenh, setHoiThenLenh]     = useState(false);  // true = opened from "In lệnh" (mandatory flow)
  const [hoiNoHoi, setHoiNoHoi]           = useState(false);  // checkbox "xác nhận không có hàng hồi"

  const fetchData = useCallback(async (from, to) => {
    setLoading(true);
    setSheetErrors([]);
    try {
      const [sheetsRes, statusRes, hoiRes] = await Promise.all([
        fetch(`/api/sheets-data?from=${from}&to=${to}`),
        fetch(`/api/dispatch-status?from=${from}&to=${to}`),
        fetch(`/api/phieu-hoi?date=${from}`),
      ]);
      const sheetsJson = await sheetsRes.json();
      const statusJson = await statusRes.json();
      const hoiJson    = await hoiRes.json();
      setPhieuList(sheetsJson.phieu || []);
      setStatusMap(statusJson.statusMap || {});
      setPhieuHoiList(hoiJson.phieu_hoi || []);
      setSheetErrors(sheetsJson.errors || []);
      setLastFetch(new Date().toLocaleTimeString('vi-VN'));
    } catch (e) {
      setSheetErrors([e.message]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(ngayTu, ngayDen); }, [ngayTu, ngayDen, fetchData]);

  useEffect(() => {
    fetch('/api/phuong-xa?list=1')
      .then(r => r.json())
      .then(d => {
        const list = d.wards || d.huyens || [];
        if (list.length > 0) setHuyenList(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/drivers')
      .then(r => r.json())
      .then(d => { if (d.drivers && d.drivers.length > 0) setDriverList(d.drivers); })
      .catch(() => {});
  }, []);

  const cycleStatus = async (phieu) => {
    const cur  = statusMap[phieu.row_key] ? statusMap[phieu.row_key].trang_thai : 'cho_giao';
    const next = TRANG_THAI[cur] ? TRANG_THAI[cur].next : 'cho_giao';
    setUpdatingKey(phieu.row_key);
    try {
      await fetch('/api/dispatch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_key: phieu.row_key, bo_phan: phieu.bo_phan,
          ngay_giao: phieu.ngay_can_giao || ngayTu, trang_thai: next,
        }),
      });
      setStatusMap(function(m) { return Object.assign({}, m, { [phieu.row_key]: Object.assign({}, m[phieu.row_key], { trang_thai: next }) }); });
    } finally {
      setUpdatingKey(null);
    }
  };

  const setPreset = (days) => {
    const today = new Date();
    const from  = new Date(today);
    const to    = new Date(today);
    if (days === 3) {
      from.setDate(today.getDate() - 1);
      to.setDate(today.getDate() + 1);
    } else if (days === 7) {
      from.setDate(today.getDate() - 3);
      to.setDate(today.getDate() + 3);
    }
    setNgayTu(toDateStr(from));
    setNgayDen(toDateStr(to));
  };

  const isSingleDay = ngayTu === ngayDen;

  const getTT = useCallback((p) => {
    const s = statusMap[p.row_key];
    return s ? s.trang_thai : 'cho_giao';
  }, [statusMap]);

  const showToast = useCallback((msg, type) => {
    setToast({ msg, type: type || 'warn' });
    setTimeout(function() { setToast(null); }, 4000);
  }, []);

  const printLenh = (driverName) => {
    const driverInfo = driverList.find(d => d.ten === driverName) || {};
    const orders = phieuList.filter(p => {
      const s = statusMap[p.row_key];
      const lx = s ? s.lai_xe_phan_cong : p.lai_xe;
      return lx === driverName;
    });
    const hoiItems = phieuHoiList.filter(h => h.lai_xe === driverName);
    const gn = orders.length > 0
      ? (statusMap[orders[0].row_key]?.giao_nhan_phan_cong || orders[0].giao_nhan || '—')
      : '—';

    const d = new Date(ngayTu + 'T00:00:00');
    const day   = String(d.getDate()).padStart(2,'0');
    const month = String(d.getMonth()+1).padStart(2,'0');
    const year  = d.getFullYear();

    // Tên đầy đủ: tìm trong driverList (so sánh không dấu, không case)
    const normFind = (list, name) => list.find(d =>
      normVN(d.ten) === normVN(name) ||
      normVN(d.ten).includes(normVN(name)) ||
      normVN(name).includes(normVN(d.ten))
    );
    const driverFull = normFind(driverList, driverName);
    const displayDriver = driverFull ? driverFull.ten : driverName;
    const gnFull = gn !== '—' ? normFind(driverList, gn) : null;
    const displayGN = gnFull ? gnFull.ten : gn;

    // Collect unique SP codes — bỏ qua code null/undefined
    const spCodes = [];
    for (const ord of orders) {
      for (const sp of (ord.san_pham || [])) {
        if (sp.ma_sp && !spCodes.includes(sp.ma_sp)) spCodes.push(sp.ma_sp);
      }
    }

    const spHeaderCells = spCodes.map(c => `<th>${c}</th>`).join('');
    const orderRows = orders.map((p, i) => {
      const spCells = spCodes.map(code => {
        const sp = (p.san_pham || []).find(s => s.ma_sp === code);
        if (!sp) return `<td class="center"></td>`;
        // Hiển thị thùng (đã quy đổi), nếu B2B thì kèm số Ream
        const thungSp = sp.so_luong_thung !== undefined ? sp.so_luong_thung : sp.so_luong;
        const isRaw = p.don_vi_sp === 'ream';
        const label = isRaw && sp.so_luong !== thungSp
          ? `${thungSp}<br/><span style="font-size:7.5pt;color:#777">${sp.so_luong}R</span>`
          : `${thungSp}`;
        return `<td class="center">${label}</td>`;
      }).join('');
      const thung = getTongThung(p) || '';
      return `<tr>
        <td class="center">${i+1}</td>
        <td class="center"></td>
        <td>${p.so_phieu || ''}</td>
        <td>${p.ten_kh || ''}</td>
        <td>${p.dia_chi_giao || ''}</td>
        ${spCells}
        <td class="center">${thung}</td>
        <td>${p.ghi_chu || ''}</td>
      </tr>`;
    }).join('');

    const totalCells = spCodes.map((_, i) => {
      const total = orders.reduce((s, p) => {
        const sp = (p.san_pham || []).find(x => x.ma_sp === spCodes[i]);
        if (!sp) return s;
        const thungSp = sp.so_luong_thung !== undefined ? sp.so_luong_thung : sp.so_luong;
        return s + (thungSp || 0);
      }, 0);
      return `<td class="center bold">${total || ''}</td>`;
    }).join('');
    const totalThung = orders.reduce((s, p) => s + (getTongThung(p) || 0), 0);

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<title>Lệnh điều xe — ${driverName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', serif; font-size: 10pt; color: #000; background: white; }
  .page { width: 297mm; min-height: 210mm; padding: 8mm 10mm 10mm 10mm; margin: 0 auto; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .header-left { font-size: 8.5pt; line-height: 1.4; }
  .header-left .company { font-weight: bold; font-size: 9.5pt; text-transform: uppercase; }
  .header-right { text-align: right; font-size: 8.5pt; line-height: 1.4; }

  /* Title */
  .title-block { text-align: center; margin: 4px 0 7px; border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 4px 0; }
  .title-block h1 { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
  .title-block .date { font-size: 10pt; margin-top: 2px; }

  /* Info row */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 7px; font-size: 9.5pt; }
  .info-item label { font-weight: bold; }
  .info-item .val { border-bottom: 1px solid #555; display: inline-block; min-width: 80px; padding: 0 4px; }

  /* Table */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 7px; }
  th { background: #1e3a5f; color: white; padding: 4px 3px; text-align: center; border: 1px solid #888; font-size: 8.5pt; }
  td { padding: 3px 4px; border: 1px solid #ccc; vertical-align: middle; }
  tr:nth-child(even) td { background: #f7f9fc; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .total-row td { background: #e8f0fe !important; font-weight: bold; border-top: 2px solid #1e3a5f; }
  td.stt { width: 28px; }
  td.order { width: 36px; }
  td.phieu { width: 80px; }
  td.sp { width: 44px; }
  td.thung { width: 46px; }

  /* Signature */
  .sign-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; text-align: center; font-size: 9pt; }
  .sign-box .title { font-weight: bold; margin-bottom: 40px; }
  .sign-box .name-line { border-top: 1px solid #555; padding-top: 4px; margin-top: 2px; min-height: 18px; }

  /* Note */
  .note-row { margin-top: 8px; font-size: 10pt; }
  .note-row label { font-weight: bold; }
  .note-line { border-bottom: 1px dashed #aaa; margin-top: 4px; height: 18px; }

  /* Editable fields */
  .editable { outline: none; min-width: 100px; }
  .editable:focus { background: #fffde7; border-bottom-color: #1e3a5f; }
  /* Print toolbar */
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1e3a5f; color: white; padding: 8px 20px; display: flex; align-items: center; gap: 12px; z-index: 999; font-family: Arial, sans-serif; }
  .print-bar button { padding: 6px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; }
  .btn-print { background: #f59e0b; color: #1e3a5f; }
  .btn-close { background: rgba(255,255,255,.2); color: white; }
  .print-hint { font-size: 12px; opacity: .8; }
  .page { margin-top: 44px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 8mm 10mm; margin-top: 0; }
    .print-bar { display: none !important; }
    .editable { border-bottom: 1px solid #555; }
    @page { size: A4 landscape; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="company">Công ty CP Hồng Hà Văn Phòng Phẩm</div>
      <div>Trung tâm Thương mại &amp; Dịch vụ</div>
      <div>25 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội</div>
      <div>Tel: 024 36524250 | dvkh@vpphongha.com.vn</div>
    </div>
    <div class="header-right">
      <div style="font-size:9pt;color:#555;">Mã: HH-VX-001</div>
      <div style="font-size:9pt;color:#555;">Lần ban hành: 1</div>
    </div>
  </div>

  <!-- Title -->
  <div class="title-block">
    <h1>Lệnh điều xe</h1>
    <div class="date">Ngày ${day} tháng ${month} năm ${year}</div>
  </div>

  <!-- Info -->
  <div class="info-grid">
    <div class="info-item">
      <label>Lái xe: </label><span class="val editable" contenteditable="true">${displayDriver}</span>
    </div>
    <div class="info-item">
      <label>Biển số: </label><span class="val editable" contenteditable="true">${driverFull ? (driverFull.bien_so || '') : ''}</span>
    </div>
    <div class="info-item">
      <label>Giao nhận: </label><span class="val editable" contenteditable="true">${displayGN !== '—' ? displayGN : ''}</span>
    </div>
    <div class="info-item">
      <label>Số km xuất phát: </label><span class="val editable" contenteditable="true"></span>
    </div>
    <div class="info-item">
      <label>Số km kết thúc: </label><span class="val editable" contenteditable="true"></span>
    </div>
    <div class="info-item">
      <label>Số lít xăng: </label><span class="val editable" contenteditable="true"></span>
    </div>
  </div>

  <!-- Table -->
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:28px">STT</th>
        <th rowspan="2" style="width:36px">Thứ tự<br/>giao</th>
        <th rowspan="2" style="width:82px">Số phiếu</th>
        <th rowspan="2">Tên khách hàng</th>
        <th rowspan="2">Địa chỉ giao</th>
        ${spCodes.length > 0 ? `<th colspan="${spCodes.length}">Giấy photo &amp; VPP</th>` : ''}
        <th rowspan="2" style="width:46px">Tổng<br/>thùng</th>
        <th rowspan="2" style="width:80px">Ghi chú</th>
      </tr>
      <tr>${spHeaderCells}</tr>
    </thead>
    <tbody>
      ${orderRows}
      <tr class="total-row">
        <td colspan="5" class="center bold">TỔNG</td>
        ${totalCells}
        <td class="center bold">${totalThung || ''}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <!-- Note lines -->
  <div class="note-row">
    <label>Ghi chú chuyến: </label>
    <div class="note-line"></div>
    <div class="note-line"></div>
  </div>

  ${hoiItems.length > 0 ? `
  <!-- Hàng hồi -->
  <div style="margin-top:10px; border:1.5px solid #7c3aed; border-radius:6px; overflow:hidden;">
    <div style="background:#7c3aed; color:white; padding:5px 10px; font-weight:bold; font-size:9.5pt;">📥 ĐIỂM NHẬN HÀNG HỒI — ${hoiItems.length} điểm</div>
    <table style="width:100%; border-collapse:collapse; font-size:8.5pt;">
      <thead><tr style="background:#f3e8ff;">
        <th style="padding:4px 6px; border:1px solid #d8b4fe; text-align:center; width:28px">STT</th>
        <th style="padding:4px 6px; border:1px solid #d8b4fe;">Điểm lấy</th>
        <th style="padding:4px 6px; border:1px solid #d8b4fe;">Địa chỉ</th>
        <th style="padding:4px 6px; border:1px solid #d8b4fe; width:90px">SĐT</th>
        <th style="padding:4px 6px; border:1px solid #d8b4fe;">Loại hàng</th>
        <th style="padding:4px 6px; border:1px solid #d8b4fe; text-align:center; width:50px">Thùng</th>
        <th style="padding:4px 6px; border:1px solid #d8b4fe; text-align:center; width:80px">Xác nhận ký</th>
      </tr></thead>
      <tbody>
        ${hoiItems.map((h, i) => `<tr>
          <td style="padding:3px 6px; border:1px solid #e5e7eb; text-align:center">${i+1}</td>
          <td style="padding:3px 6px; border:1px solid #e5e7eb; font-weight:bold">${h.nguon_ten || ''}</td>
          <td style="padding:3px 6px; border:1px solid #e5e7eb">${h.nguon_dia_chi || ''}</td>
          <td style="padding:3px 6px; border:1px solid #e5e7eb">${h.nguon_sdt || ''}</td>
          <td style="padding:3px 6px; border:1px solid #e5e7eb">${h.loai_hang || ''}</td>
          <td style="padding:3px 6px; border:1px solid #e5e7eb; text-align:center; font-weight:bold">${h.so_luong_thung || 0}</td>
          <td style="padding:3px 6px; border:1px solid #e5e7eb; text-align:center">□</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Signatures -->
  <div class="sign-row">
    <div class="sign-box"><div class="title">Người lập phiếu</div><div class="name-line"></div></div>
    <div class="sign-box"><div class="title">Lái xe</div><div class="name-line">${displayDriver}</div></div>
    <div class="sign-box"><div class="title">Giao nhận</div><div class="name-line">${displayGN !== '—' ? displayGN : ''}</div></div>
    <div class="sign-box"><div class="title">Thủ kho</div><div class="name-line"></div></div>
  </div>
</div>

<div class="print-bar no-print">
  <span style="font-weight:bold;font-size:14px">🖨️ Lệnh điều xe — ${displayDriver}</span>
  <span class="print-hint">Kiểm tra thông tin, chỉnh sửa nếu cần, rồi bấm In</span>
  <div style="flex:1"></div>
  <button class="btn-print" onclick="window.print()">🖨️ In / Xuất PDF</button>
  <button class="btn-close" onclick="window.close()">✕ Đóng</button>
</div>
<script>
  // Không tự print — để user kiểm tra trước
</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { showToast('Trình duyệt chặn popup — cho phép popup từ localhost', 'error'); return; }
    win.document.write(html);
    win.document.close();
  };

  const openChotModal = (driverName) => {
    const orders = phieuList.filter(p => {
      const s = statusMap[p.row_key];
      const lx = s ? (s.lai_xe_phan_cong || p.lai_xe) : p.lai_xe;
      return lx === driverName;
    });
    // Prefill km nếu đã có bản ghi hôm nay
    fetch(`/api/delivery-runs?date=${ngayTu}&driver=${encodeURIComponent(driverName)}`)
      .then(r => r.json())
      .then(d => {
        const existing = d.runs && d.runs[0];
        setChotData({
          km_bat_dau:    existing?.km_bat_dau  ?? '',
          km_ket_thuc:   existing?.km_ket_thuc ?? '',
          ghi_chu:       existing?.ghi_chu     ?? '',
          donHoan:       new Set(),
          donGhiChu:     {},  // { [row_key]: string } — ghi chú thiếu hàng per đơn
          phieuHoiDaLay: new Set(),
        });
      })
      .catch(() => setChotData({ km_bat_dau:'', km_ket_thuc:'', ghi_chu:'', donHoan: new Set(), donGhiChu:{}, phieuHoiDaLay: new Set() }));
    setChotModal(driverName);
  };

  const submitChot = async () => {
    if (!chotModal) return;
    const orders = phieuList.filter(p => {
      const s = statusMap[p.row_key];
      const lx = s ? (s.lai_xe_phan_cong || p.lai_xe) : p.lai_xe;
      return lx === chotModal;
    });

    // Kiểm tra hàng hồi chưa xác nhận — bắt buộc xử lý trước khi chốt
    const uncheckedHoi = phieuHoiList.filter(h =>
      h.lai_xe === chotModal &&
      h.trang_thai === 'cho_lay' &&
      !(chotData.phieuHoiDaLay && chotData.phieuHoiDaLay.has(h.id))
    );
    if (uncheckedHoi.length > 0) {
      showToast(`❌ Còn ${uncheckedHoi.length} điểm hàng hồi chưa xác nhận! Tick "Đã lấy" hoặc xóa trước khi chốt.`, 'error');
      return;
    }

    setChotSaving(true);
    try {
      // 1. Bulk update trạng thái + ghi chú thiếu từng đơn
      await Promise.all(orders.map(p => {
        const isHoan    = chotData.donHoan    && chotData.donHoan.has(p.row_key);
        const ghiChuDon = chotData.donGhiChu  && chotData.donGhiChu[p.row_key];
        const cur = statusMap[p.row_key] || {};
        return fetch('/api/dispatch-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            row_key:   p.row_key,
            bo_phan:   p.bo_phan,
            ngay_giao: p.ngay_can_giao || ngayTu,
            trang_thai: isHoan ? 'huy' : 'da_giao',
            lai_xe_phan_cong:    cur.lai_xe_phan_cong    || p.lai_xe    || null,
            giao_nhan_phan_cong: cur.giao_nhan_phan_cong || p.giao_nhan || null,
            ghi_chu_giao: ghiChuDon || null,
          }),
        });
      }));
      // 2. Lưu delivery_run (km + thống kê)
      const donHoan = chotData.donHoan ? chotData.donHoan.size : 0;
      await fetch('/api/delivery-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_name:  chotModal,
          ngay_chay:    ngayTu,
          km_bat_dau:   chotData.km_bat_dau  || null,
          km_ket_thuc:  chotData.km_ket_thuc || null,
          so_don_giao:  orders.length - donHoan,
          so_don_hoan:  donHoan,
          ghi_chu:      chotData.ghi_chu     || null,
        }),
      });
      // 3. Cập nhật phieu_hoi đã lấy trong cùng chuyến
      if (chotData.phieuHoiDaLay && chotData.phieuHoiDaLay.size > 0) {
        await Promise.all([...chotData.phieuHoiDaLay].map(id =>
          fetch('/api/phieu-hoi', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, trang_thai: 'da_lay' }),
          })
        ));
        setPhieuHoiList(prev => prev.map(h =>
          (chotData.phieuHoiDaLay && chotData.phieuHoiDaLay.has(h.id))
            ? { ...h, trang_thai: 'da_lay' } : h
        ));
      }

      // 4. Cập nhật local statusMap
      const newMap = { ...statusMap };
      orders.forEach(p => {
        const isHoan    = chotData.donHoan   && chotData.donHoan.has(p.row_key);
        const ghiChuDon = chotData.donGhiChu && chotData.donGhiChu[p.row_key];
        newMap[p.row_key] = { ...(newMap[p.row_key] || {}), trang_thai: isHoan ? 'huy' : 'da_giao', ghi_chu_giao: ghiChuDon || null };
      });
      setStatusMap(newMap);
      // 5. Tổng hợp đơn thiếu hàng để gửi email kho
      const donThieu = orders.filter(p => chotData.donGhiChu && chotData.donGhiChu[p.row_key]);
      if (donThieu.length > 0) {
        setChotSummary({
          driver: chotModal,
          date:   ngayTu,
          thieu:  donThieu.map(p => ({
            so_phieu: p.so_phieu,
            ten_kh:   p.ten_kh,
            ghi_chu:  chotData.donGhiChu[p.row_key],
          })),
        });
      } else {
        showToast(`✅ Chốt xong chuyến xe ${chotModal} — ${orders.length - donHoan} đơn giao, ${donHoan} hoàn`, 'ok');
      }
      setChotModal(null);
    } catch (e) {
      showToast('Lỗi chốt chuyến: ' + e.message, 'error');
    } finally {
      setChotSaving(false);
    }
  };

  const assignLaiXe = async (phieu, field, value) => {
    if (field === 'lai_xe_phan_cong' && value) {
      const capObj = driverCapacity[value];
      const cap = capObj ? capObj.thung : 0;
      if (cap > 0) {
        const curLoad    = driverLoad[value] || 0;
        const orderThung = getTongThung(phieu);
        const curStatus  = statusMap[phieu.row_key];
        const curAssigned = curStatus ? curStatus.lai_xe_phan_cong : phieu.lai_xe;
        const addThung   = (curAssigned === value) ? 0 : orderThung;
        const newTotal   = curLoad + addThung;
        const pctNew     = Math.round(newTotal / cap * 100);
        if (newTotal > cap) {
          showToast('Xe ' + value + ' da vuot suc tai! (' + curLoad + '/' + cap + ' thung). Khong the phan them.', 'error');
          return;
        }
        if (newTotal > cap * 0.85) {
          showToast('Canh bao: Xe ' + value + ' sap day tai! (' + newTotal + '/' + cap + ' thung = ' + pctNew + '%)', 'warn');
        }
      }
    }
    setAssigningKey(phieu.row_key + '_' + field);
    const cur = statusMap[phieu.row_key] || {};
    try {
      const res = await fetch('/api/dispatch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_key:   phieu.row_key,
          bo_phan:   phieu.bo_phan,
          ngay_giao: phieu.ngay_can_giao || ngayTu,
          trang_thai: cur.trang_thai || 'cho_giao',
          [field]:   value || null,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setStatusMap(function(m) { return Object.assign({}, m, { [phieu.row_key]: Object.assign({}, m[phieu.row_key], json.data) }); });
      }
    } catch (e) {
      console.error('assignLaiXe error:', e);
    } finally {
      setAssigningKey(null);
    }
  };

  const filtered = useMemo(() => {
    const q = normVN(searchQ);
    const list = phieuList.filter(function(p) {
      if (filterBP !== 'TAT_CA' && p.bo_phan !== filterBP) return false;
      if (filterTT !== 'TAT_CA' && getTT(p) !== filterTT) return false;
      if (filterLaiXe) {
        const lx = p.lai_xe || p.giao_nhan || 'Chua phan cong';
        if (lx !== filterLaiXe) return false;
      }
      if (q) {
        const hay = normVN((p.so_phieu||'') + ' ' + (p.ten_kh||'') + ' ' + (p.ma_lenh||''));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Sort: chưa có dispatch_status (mới nhất, chưa phân) lên trên,
    // sau đó theo updated_at DESC (mới cập nhật gần đây nhất)
    list.sort(function(a, b) {
      const sa = statusMap[a.row_key];
      const sb = statusMap[b.row_key];
      // Chưa có status → ưu tiên lên trên
      if (!sa && sb) return -1;
      if (sa && !sb) return 1;
      if (!sa && !sb) return 0;
      // Cả hai có status → so updated_at mới hơn lên trên
      return new Date(sb.updated_at) - new Date(sa.updated_at);
    });
    return list;
  }, [phieuList, filterBP, filterTT, filterLaiXe, searchQ, statusMap, getTT]);

  const stats = useMemo(() => {
    const total = phieuList.length;
    const cho   = phieuList.filter(function(p) { return getTT(p) === 'cho_giao'; }).length;
    const dang  = phieuList.filter(function(p) { return getTT(p) === 'dang_giao'; }).length;
    const da    = phieuList.filter(function(p) { return getTT(p) === 'da_giao'; }).length;
    const pct   = total ? Math.round((da / total) * 100) : 0;
    const byBP = {};
    phieuList.forEach(function(p) {
      const bp = p.bo_phan;
      if (!byBP[bp]) byBP[bp] = { total:0, cho:0, dang:0, da:0 };
      byBP[bp].total++;
      const tt = getTT(p);
      if (tt === 'cho_giao')  byBP[bp].cho++;
      if (tt === 'dang_giao') byBP[bp].dang++;
      if (tt === 'da_giao')   byBP[bp].da++;
    });
    const byLaiXe = {};
    phieuList.forEach(function(p) {
      const lx = p.lai_xe || 'Chua phan cong';
      if (!byLaiXe[lx]) byLaiXe[lx] = { total:0, cho:0, dang:0, da:0 };
      byLaiXe[lx].total++;
      const tt = getTT(p);
      if (tt === 'cho_giao')  byLaiXe[lx].cho++;
      if (tt === 'dang_giao') byLaiXe[lx].dang++;
      if (tt === 'da_giao')   byLaiXe[lx].da++;
    });
    const byGiaoNhan = {};
    phieuList.forEach(function(p) {
      const gn = p.giao_nhan || 'Chua phan cong';
      if (!byGiaoNhan[gn]) byGiaoNhan[gn] = { total:0, cho:0, dang:0, da:0 };
      byGiaoNhan[gn].total++;
      const tt = getTT(p);
      if (tt === 'cho_giao')  byGiaoNhan[gn].cho++;
      if (tt === 'dang_giao') byGiaoNhan[gn].dang++;
      if (tt === 'da_giao')   byGiaoNhan[gn].da++;
    });
    return { total, cho, dang, da, pct, byBP, byLaiXe, byGiaoNhan };
  }, [phieuList, getTT]);

  const huyenMatcher = useMemo(() => buildHuyenMatcher(huyenList), [huyenList]);

  const driverCapacity = useMemo(() => {
    const map = {};
    for (const d of driverList) {
      map[d.ten] = { thung: d.suc_tai_thung || 0, kg: d.suc_tai_kg || 0 };
    }
    return map;
  }, [driverList]);

  const driverLoad = useMemo(() => {
    const map = {};
    for (const p of phieuList) {
      const s = statusMap[p.row_key];
      const laiXe = s ? (s.lai_xe_phan_cong || p.lai_xe) : p.lai_xe;
      if (!laiXe) continue;
      const thung = getTongThung(p);
      if (!map[laiXe]) map[laiXe] = 0;
      map[laiXe] += thung;
    }
    return map;
  }, [phieuList, statusMap]);

  // Stats theo driverList (nguồn chính xác) thay vì tên từ sheet
  const driverStats = useMemo(() => {
    const map = {};
    for (const d of driverList) map[d.ten] = { cho:0, dang:0, da:0, total:0 };
    for (const p of phieuList) {
      const s = statusMap[p.row_key];
      const lx = s ? (s.lai_xe_phan_cong || p.lai_xe) : p.lai_xe;
      const gn = s ? (s.giao_nhan_phan_cong || p.giao_nhan) : p.giao_nhan;
      const tt = getTT(p);
      for (const name of [lx, gn]) {
        if (name && map[name]) {
          map[name].total++;
          if (tt === 'cho_giao')  map[name].cho++;
          if (tt === 'dang_giao') map[name].dang++;
          if (tt === 'da_giao')   map[name].da++;
        }
      }
    }
    return map;
  }, [driverList, phieuList, statusMap, getTT]);

  const grouped = useMemo(() => {
    if (!groupByArea) return [{ key: '__all', label: null, subGroups: { '__all': filtered } }];
    const buckets = {
      phuong: { key: 'phuong', label: 'Tp / Phuong', icon: '🏙️', color: '#1565C0', bg: '#E3F2FD', sub: {} },
      xa:     { key: 'xa',     label: 'Huyen / Xa',  icon: '🌿', color: '#2E7D32', bg: '#E8F5E9', sub: {} },
      other:  { key: 'other',  label: 'Chua xac dinh', icon: '📍', color: '#6b7280', bg: '#F3F4F6', sub: {} },
    };
    filtered.forEach(function(p) {
      const kv = extractKhuVuc(p.dia_chi_giao, huyenMatcher);
      const bucket = kv.loai === 'phường' ? buckets.phuong
                   : (kv.loai === 'xã' || kv.loai === 'thị trấn') ? buckets.xa
                   : buckets.other;
      if (!bucket.sub[kv.name]) bucket.sub[kv.name] = [];
      bucket.sub[kv.name].push(p);
    });
    const sortSub = function(sub) {
      return Object.fromEntries(Object.entries(sub).sort(function(a, b) { return a[0].localeCompare(b[0], 'vi'); }));
    };
    return Object.values(buckets)
      .map(function(b) { return Object.assign({}, b, { subGroups: sortSub(b.sub) }); })
      .filter(function(b) { return Object.keys(b.subGroups).length > 0; });
  }, [filtered, groupByArea, huyenMatcher]);

  return (
    <div style={{ paddingBottom: activeDriver ? 80 : 0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <Link href="/" style={{ fontSize:13, color:'#3b82f6', textDecoration:'none' }}>← Nhập phiếu</Link>
        <Link href="/bao-cao" style={{ fontSize:13, color:'#93c5fd', textDecoration:'none' }}>📊 Báo cáo</Link>
        <Link href="/quan-ly-xe" style={{
          fontSize:12, color:'white', textDecoration:'none',
          background:'#059669', padding:'5px 12px', borderRadius:6,
          fontWeight:700, border:'1px solid #047857',
        }}>🚗 Quản lý xe</Link>
        <span style={{ color:'#d1d5db' }}>|</span>
        <h2 style={{ fontSize:20, fontWeight:700, margin:0 }}>🚚 Điều xe</h2>
        {lastFetch && <span style={{ fontSize:11, color:'#9ca3af' }}>Cập nhật {lastFetch}</span>}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {[['Hôm nay', 0], ['±1 ngày', 3], ['±3 ngày', 7]].map(function(item) {
            const label = item[0], days = item[1];
            return (
              <button key={label} onClick={() => setPreset(days)} style={{
                padding:'5px 10px', border:'1px solid #d1d5db', borderRadius:6,
                background: 'white', cursor:'pointer', fontSize:12, color:'#374151',
              }}>{label}</button>
            );
          })}
          <span style={{ color:'#d1d5db', margin:'0 2px' }}>|</span>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <input type="date" value={ngayTu}
              onChange={function(e) { setNgayTu(e.target.value); if (e.target.value > ngayDen) setNgayDen(e.target.value); }}
              style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, fontWeight:600 }} />
            <span style={{ color:'#9ca3af', fontSize:13 }}>→</span>
            <input type="date" value={ngayDen} min={ngayTu}
              onChange={function(e) { setNgayDen(e.target.value); }}
              style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, fontWeight:600 }} />
          </div>
          <button onClick={() => fetchData(ngayTu, ngayDen)} disabled={loading}
            style={{ padding:'5px 12px', border:'1px solid #bfdbfe', borderRadius:6, background:'#eff6ff', color:'#1d4ed8', cursor:'pointer', fontSize:13 }}>
            {loading ? '…' : '🔄 Tải lại'}
          </button>
        </div>
      </div>

      {sheetErrors.length > 0 && (
        <div style={{ background:'#fef9c3', border:'1px solid #fde047', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#854d0e' }}>
          {sheetErrors.join(' · ')}
        </div>
      )}

      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:12, padding:16, marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr) 1.2fr', gap:10, marginBottom:16 }}>
          {[
            { label:'Tổng chuyến', val:stats.total, color:'#1d4ed8', bg:'#eff6ff' },
            { label:'Chờ giao',    val:stats.cho,   color:'#2563eb', bg:'#dbeafe' },
            { label:'Đang giao',   val:stats.dang,  color:'#d97706', bg:'#fef3c7' },
            { label:'Đã giao',     val:stats.da,    color:'#059669', bg:'#d1fae5' },
          ].map(function(s) {
            return (
              <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:30, fontWeight:800, color:s.color, lineHeight:1 }}>{s.val}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>{s.label}</div>
              </div>
            );
          })}
          <div style={{ background:'#f0fdf4', borderRadius:10, padding:'12px 16px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
              <span style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>Tiến độ</span>
              <span style={{ fontSize:24, fontWeight:800, color:'#059669' }}>{stats.pct}%</span>
            </div>
            <div style={{ background:'#bbf7d0', borderRadius:99, height:12, overflow:'hidden' }}>
              <div style={{ background:'#16a34a', height:'100%', width:(stats.pct + '%'), transition:'width .5s ease' }} />
            </div>
            <div style={{ display:'flex', gap:10, marginTop:8, fontSize:11, color:'#6b7280' }}>
              <span>⏳{stats.cho}</span><span>🚚{stats.dang}</span><span>✅{stats.da}</span>
            </div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:16 }}>
          <div style={{ borderRight:'1px solid #f3f4f6', paddingRight:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9ca3af', marginBottom:10, textTransform:'uppercase' }}>Theo bộ phận</div>
            {Object.keys(stats.byBP).length === 0
              ? <div style={{ fontSize:12, color:'#d1d5db' }}>Chưa có dữ liệu</div>
              : Object.entries(stats.byBP).map(function(entry) {
                const bp = entry[0], d = entry[1];
                const pct = d.total ? Math.round(d.da / d.total * 100) : 0;
                return (
                  <div key={bp} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:4, background:BP_COLOR[bp]||'#6b7280', color:'white' }}>{bp}</span>
                      <span style={{ fontSize:11, color:'#6b7280' }}>{d.da}/{d.total} ({pct}%)</span>
                    </div>
                    <div style={{ background:'#e5e7eb', borderRadius:99, height:8, overflow:'hidden', display:'flex' }}>
                      <div style={{ background:'#059669', width:(d.total ? d.da/d.total*100 : 0) + '%', transition:'width .4s' }} />
                      <div style={{ background:'#fbbf24', width:(d.total ? d.dang/d.total*100 : 0) + '%', transition:'width .4s' }} />
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:3, fontSize:10, color:'#9ca3af' }}>
                      <span>⏳{d.cho}</span><span>🚚{d.dang}</span><span>✅{d.da}</span>
                    </div>
                  </div>
                );
              })
            }
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {[
              { label:'🚗 Lái xe', roles:['lai_xe','ca_hai'], ac:'#1d4ed8', ab:'#eff6ff', bs:'#3b82f6', showLoad:true },
              { label:'📦 Phụ xe / Giao nhận', roles:['giao_nhan','ca_hai'], ac:'#b45309', ab:'#fffbeb', bs:'#f59e0b', showLoad:false },
            ].map(function(grp) {
              const drivers = driverList.filter(function(dr) { return dr.active !== false && grp.roles.includes(dr.vai_tro); });
              return (
                <div key={grp.label}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase' }}>{grp.label}</span>
                    {activeDriver && (
                      <button onClick={() => setActiveDriver(null)} style={{ fontSize:11, padding:'1px 8px', borderRadius:10, border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', cursor:'pointer' }}>✕ Bỏ chọn</button>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:6 }}>
                    {drivers.map(function(dr) {
                        const name = dr.ten;
                        const d    = driverStats[name] || { cho:0, dang:0, da:0, total:0 };
                        const pct  = d.total ? Math.round(d.da / d.total * 100) : 0;
                        const isActive = activeDriver === name;
                        const cap    = grp.showLoad ? (driverCapacity[name] ? driverCapacity[name].thung : 0) : 0;
                        const loaded = grp.showLoad ? (driverLoad[name] || 0) : 0;
                        const lPct   = cap > 0 ? Math.min(100, Math.round(loaded / cap * 100)) : 0;
                        const lColor = lPct >= 100 ? '#dc2626' : lPct >= 85 ? '#f59e0b' : '#10b981';
                        return (
                          <div key={name}
                            onClick={() => setActiveDriver(isActive ? null : name)}
                            style={{
                              background: isActive ? grp.ab : '#f9fafb',
                              borderRadius:8, padding:'7px 10px', cursor:'pointer',
                              border: isActive ? ('2px solid ' + grp.bs) : '1px solid #e5e7eb',
                              transition:'border-color .15s',
                            }}>
                            <div style={{ fontSize:12, fontWeight:700, marginBottom:2, color: isActive ? grp.ac : '#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {isActive ? '🛒 ' : ''}{name}
                            </div>
                            {dr.bien_so && (
                              <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>🚗 {dr.bien_so}</div>
                            )}
                            <div style={{ background:'#e5e7eb', borderRadius:99, height:4, overflow:'hidden', marginBottom:4 }}>
                              <div style={{ background: isActive ? grp.bs : '#059669', width:(pct+'%'), height:'100%' }} />
                            </div>
                            <div style={{ display:'flex', gap:6, fontSize:11 }}>
                              <span style={{ color:'#2563eb' }}>⏳{d.cho}</span>
                              <span style={{ color:'#d97706' }}>🚚{d.dang}</span>
                              <span style={{ color:'#059669' }}>✅{d.da}</span>
                              <span style={{ marginLeft:'auto', color:'#9ca3af', fontWeight:600 }}>{pct}%</span>
                            </div>
                            {grp.showLoad && cap > 0 && (
                              <div style={{ marginTop:5 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#9ca3af', marginBottom:2 }}>
                                  <span>🏋️ Tải</span>
                                  <span style={{ color:lColor, fontWeight:700 }}>{loaded}/{cap} ({lPct}%)</span>
                                </div>
                                <div style={{ background:'#e5e7eb', borderRadius:99, height:5, overflow:'hidden' }}>
                                  <div style={{ background:lColor, width:(lPct+'%'), height:'100%', transition:'width .4s' }} />
                                </div>
                              </div>
                            )}
                            {grp.showLoad && d.total > 0 && (
                              <div style={{ display:'flex', gap:4, marginTop:6 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setHoiThenLenh(true); setHoiNoHoi(false); setHoiModal(name); }}
                                  style={{ flex:1, padding:'3px 0', fontSize:11, fontWeight:700,
                                    background:'#1e3a5f', color:'white', border:'none', borderRadius:5, cursor:'pointer' }}>
                                  📋 In lệnh
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); openChotModal(name); }}
                                  style={{ flex:1, padding:'3px 0', fontSize:11, fontWeight:700,
                                    background:'#059669', color:'white', border:'none', borderRadius:5, cursor:'pointer' }}>
                                  ✅ Chốt
                                </button>
                              </div>
                            )}
                            {grp.showLoad && (() => {
                              const hoiCount = phieuHoiList.filter(h => h.lai_xe === name).length;
                              return (
                                <div style={{ marginTop:4 }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); setHoiModal(name); }}
                                    style={{ width:'100%', padding:'3px 0', fontSize:11, fontWeight:700,
                                      background: hoiCount > 0 ? '#7c3aed' : '#e5e7eb',
                                      color: hoiCount > 0 ? 'white' : '#9ca3af',
                                      border:'none', borderRadius:5, cursor:'pointer' }}>
                                    📥 {hoiCount > 0 ? `Hàng hồi (${hoiCount})` : 'Thêm hàng hồi'}
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:2, background:'#f3f4f6', borderRadius:8, padding:3 }}>
          {['TAT_CA','MT','GT','B2B'].map(function(bp) {
            return (
              <button key={bp} onClick={() => setFilterBP(bp)} style={{
                padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                background: filterBP===bp ? (BP_COLOR[bp]||'#374151') : 'transparent',
                color: filterBP===bp ? 'white' : '#6b7280',
              }}>{bp==='TAT_CA' ? 'Tất cả' : bp}</button>
            );
          })}
        </div>
        <div style={{ display:'flex', gap:2, background:'#f3f4f6', borderRadius:8, padding:3 }}>
          {[['TAT_CA','Tất cả',null,'#374151'],['cho_giao','Chờ','#dbeafe','#2563eb'],['dang_giao','Đang','#fef3c7','#d97706'],['da_giao','Đã giao','#d1fae5','#059669']].map(function(item) {
            const k=item[0],l=item[1],bg=item[2],col=item[3];
            return (
              <button key={k} onClick={() => setFilterTT(k)} style={{
                padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                background: filterTT===k ? (bg||'#374151') : 'transparent',
                color: filterTT===k ? (col||'white') : '#6b7280',
              }}>{l}</button>
            );
          })}
        </div>
        <button onClick={() => setGroupByArea(function(g) { return !g; })} style={{
          padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
          border:('1px solid ' + (groupByArea ? '#3b82f6' : '#d1d5db')),
          background: groupByArea ? '#eff6ff' : 'white',
          color: groupByArea ? '#1d4ed8' : '#6b7280',
        }}>📍 Nhóm khu vực {groupByArea ? '✓' : ''}</button>
        <div style={{ position:'relative', marginLeft:'auto' }}>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="🔍 Số phiếu / tên khách..."
            style={{
              padding:'5px 32px 5px 10px', borderRadius:8, border:'1px solid #d1d5db',
              fontSize:12, width:220, outline:'none',
            }}
          />
          {searchQ && (
            <button onClick={() => setSearchQ('')} style={{
              position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
              border:'none', background:'none', cursor:'pointer', color:'#9ca3af', fontSize:14, padding:0,
            }}>✕</button>
          )}
        </div>
        {filterLaiXe && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8 }}>
            <span style={{ fontSize:12, color:'#1d4ed8', fontWeight:600 }}>🔍 {filterLaiXe}</span>
            <button onClick={() => setFilterLaiXe(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'#93c5fd', fontSize:14 }}>✕</button>
          </div>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'#9ca3af', fontWeight:600 }}>{filtered.length} chuyến</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'white', borderRadius:12, border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>⏳</div>
          <div>Đang tải từ Google Sheets…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'white', borderRadius:12, border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
          <div style={{ fontWeight:600, marginBottom:4 }}>Không có chuyến nào {isSingleDay ? ('ngày ' + fmtVN(ngayTu)) : (fmtVN(ngayTu) + ' → ' + fmtVN(ngayDen))}</div>
          <div style={{ fontSize:12 }}>Kiểm tra Google Sheets hoặc chọn ngày khác</div>
        </div>
      ) : (
        grouped.map(function(bucket) {
          return (
            <div key={bucket.key} style={{ marginBottom: groupByArea && bucket.label ? 24 : 0 }}>
              {groupByArea && bucket.label && (
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'8px 14px', borderRadius:10, background:bucket.bg, border:('2px solid ' + bucket.color + '22') }}>
                  <span style={{ fontSize:18 }}>{bucket.icon}</span>
                  <span style={{ fontSize:15, fontWeight:800, color:bucket.color }}>{bucket.label}</span>
                  <span style={{ fontSize:12, color:bucket.color, opacity:0.7 }}>
                    — {Object.values(bucket.subGroups).flat().length} chuyến · ✅ {Object.values(bucket.subGroups).flat().filter(function(p) { return getTT(p)==='da_giao'; }).length} xong
                  </span>
                </div>
              )}
              {Object.entries(bucket.subGroups).map(function(sgEntry) {
                const groupKey = sgEntry[0], rows = sgEntry[1];
                return (
                  <div key={groupKey} style={{ marginBottom:14, marginLeft: groupByArea && bucket.label ? 12 : 0 }}>
                    {groupByArea && groupKey !== '__all' && (
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:bucket.color, background:bucket.bg, padding:'2px 10px', borderRadius:20, border:('1px solid ' + bucket.color + '33') }}>{groupKey}</span>
                        <span style={{ fontSize:11, color:'#9ca3af' }}>{rows.length} chuyến</span>
                        <div style={{ flex:1, height:1, background:'#e5e7eb' }} />
                        <span style={{ fontSize:11, color:'#9ca3af' }}>✅ {rows.filter(function(p) { return getTT(p)==='da_giao'; }).length}/{rows.length}</span>
                      </div>
                    )}
                    <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid #e5e7eb', background:'white' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                        <thead>
                          <tr style={{ background:'#f9fafb', borderBottom:'2px solid #e5e7eb' }}>
                            {[['#','36px'],['BP','50px'],['Mã / Phiếu','110px'],['Ngày giao','110px'],['Khách hàng','160px'],['Địa chỉ','200px'],['Kho','80px'],['Hàng hóa','160px'],['Trạng thái','100px'],['Cập nhật','80px'],['Lái xe','130px'],['Giao nhận','100px']].map(function(h) {
                              return <th key={h[0]} style={{ padding:'9px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7280', whiteSpace:'nowrap', width:h[1], minWidth:h[1] }}>{h[0]}</th>;
                            })}
                            {activeDriver && <th style={{ padding:'9px 10px', textAlign:'center', fontSize:11, fontWeight:700, color:'#7c3aed', whiteSpace:'nowrap', width:80, minWidth:80 }}>🛒 Giỏ</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(function(p, i) {
                            const ttObj  = TRANG_THAI[getTT(p)] || TRANG_THAI.cho_giao;
                            const isBusy = updatingKey === p.row_key;
                            const kvInfo = groupByArea ? null : extractKhuVuc(p.dia_chi_giao, huyenMatcher);
                            const rowBg  = getTT(p)==='da_giao' ? '#f0fdf4' : p.don_gap ? '#fff7ed' : !p.ngay_can_giao ? '#fffbeb' : 'white';
                            return (
                              <tr key={p.row_key} style={{ borderBottom:'1px solid #f3f4f6', background: rowBg }}>
                                <td style={{ padding:'9px 10px', color:'#9ca3af', fontSize:11 }}>{i+1}</td>
                                <td style={{ padding:'9px 10px' }}>
                                  <span style={{ padding:'2px 7px', borderRadius:4, fontSize:11, fontWeight:700, background:BP_COLOR[p.bo_phan]||'#6b7280', color:'white' }}>{p.bo_phan}</span>
                                </td>
                                <td style={{ padding:'9px 10px' }}>
                                  {p.ma_lenh && <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', marginBottom:1 }}>{p.ma_lenh}</div>}
                                  <div style={{ fontSize:11, color:'#6b7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }} title={p.so_phieu}>{p.so_phieu||'—'}</div>
                                </td>
                                <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                                  {p.ngay_can_giao
                                    ? <span style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{fmtVN(p.ngay_can_giao)}</span>
                                    : <span style={{ fontSize:11, color:'#b45309', background:'#fef3c7', padding:'2px 7px', borderRadius:5, fontWeight:700 }}>⚠️ Chưa lịch</span>}
                                  {p.don_gap && (
                                    <div style={{ marginTop:2 }}>
                                      <span style={{ fontSize:10, fontWeight:800, color:'#c2410c', background:'#ffedd5', padding:'1px 6px', borderRadius:4, border:'1px solid #fed7aa' }}>⚡ Gấp</span>
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding:'9px 10px' }}>
                                  <div style={{ fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }} title={p.ten_kh}>{p.ten_kh||'—'}</div>
                                  {p.sdt && <div style={{ fontSize:11, color:'#9ca3af' }}>☎ {p.sdt}</div>}
                                </td>
                                <td style={{ padding:'9px 10px' }}>
                                  <div style={{ fontSize:12, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }} title={p.dia_chi_giao}>{p.dia_chi_giao||'—'}</div>
                                  {!groupByArea && kvInfo && kvInfo.name && kvInfo.name !== 'Khác' && kvInfo.name !== 'Chưa rõ' && (
                                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, marginTop:2, display:'inline-block', color: kvInfo.loai==='phường'?'#1565C0':'#2E7D32', background: kvInfo.loai==='phường'?'#E3F2FD':'#E8F5E9' }}>
                                      {kvInfo.loai==='phường' ? '🏙️' : '🌿'} {kvInfo.name}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding:'9px 10px' }}>
                                  {p.ten_kho
                                    ? <span style={{ fontSize:11, color:'#6b7280', background:'#f3f4f6', padding:'2px 6px', borderRadius:4 }}>🏭 {p.ten_kho}</span>
                                    : <span style={{ color:'#e5e7eb' }}>—</span>}
                                </td>
                                <td style={{ padding:'9px 10px', maxWidth:160 }}>
                                  {p.san_pham && p.san_pham.length > 0 ? (
                                    <div>
                                      {p.san_pham.map(function(sp) {
                                        const thung = sp.so_luong_thung !== undefined ? sp.so_luong_thung : sp.so_luong;
                                        const isRaw = p.don_vi_sp === 'ream';
                                        return (
                                          <div key={sp.ma_sp} style={{ fontSize:11, color:'#374151', whiteSpace:'nowrap' }}>
                                            <span style={{ color:'#6b7280' }}>{sp.ma_sp}:</span>{' '}
                                            <strong>{thung} thùng</strong>
                                            {isRaw && sp.so_luong !== thung && (
                                              <span style={{ fontSize:10, color:'#9ca3af' }}> ({sp.so_luong}R)</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {p.tong_thung > 0 && (
                                        <div style={{ marginTop:2, fontSize:11, fontWeight:700, color:'#1d4ed8' }}>= {p.tong_thung} thùng</div>
                                      )}
                                    </div>
                                  ) : p.ghi_chu ? (
                                    <span style={{ fontSize:11, color:'#6b7280' }} title={p.ghi_chu}>{p.ghi_chu.length > 45 ? p.ghi_chu.slice(0,45)+'…' : p.ghi_chu}</span>
                                  ) : <span style={{ color:'#e5e7eb' }}>—</span>}
                                </td>
                                <td style={{ padding:'9px 10px' }}>
                                  <button onClick={() => cycleStatus(p)} disabled={isBusy} style={{
                                    padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                                    background:ttObj.bg, color:ttObj.color, fontWeight:700, fontSize:11,
                                    whiteSpace:'nowrap', minWidth:82, opacity:isBusy?0.6:1,
                                  }}>{isBusy ? '…' : ttObj.label}</button>
                                </td>
                                <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                                  {(function() {
                                    const t = fmtTime(statusMap[p.row_key] && statusMap[p.row_key].updated_at);
                                    return t ? <span style={{ fontSize:11, color:'#6b7280' }}>{t}</span> : <span style={{ color:'#e5e7eb' }}>—</span>;
                                  })()}
                                </td>
                                <td style={{ padding:'6px 8px' }}>
                                  {driverList.length > 0 ? (function() {
                                    const s2 = statusMap[p.row_key];
                                    const assigned  = s2 ? s2.lai_xe_phan_cong : undefined;
                                    const fromSheet = p.lai_xe;
                                    const display   = assigned !== undefined && assigned !== null ? assigned : (fromSheet || '');
                                    const isSaving  = assigningKey === p.row_key + '_lai_xe_phan_cong';
                                    const selCap    = display ? ((driverCapacity[display] && driverCapacity[display].thung) || 0) : 0;
                                    const selLoad   = display ? (driverLoad[display] || 0) : 0;
                                    const selPct    = selCap > 0 ? Math.round(selLoad / selCap * 100) : 0;
                                    const overload  = selCap > 0 && selPct >= 100;
                                    const nearFull  = selCap > 0 && selPct >= 85 && selPct < 100;
                                    const bc = overload ? '#dc2626' : nearFull ? '#f59e0b' : (assigned ? '#6366f1' : '#d1d5db');
                                    const bgc = overload ? '#fef2f2' : nearFull ? '#fffbeb' : (assigned ? '#eef2ff' : 'white');
                                    const tc = overload ? '#dc2626' : nearFull ? '#b45309' : (assigned ? '#4f46e5' : '#374151');
                                    return (
                                      <div>
                                        <select value={display} disabled={isSaving}
                                          onChange={function(e) { assignLaiXe(p, 'lai_xe_phan_cong', e.target.value); }}
                                          style={{ fontSize:11, padding:'3px 6px', borderRadius:5, border:('1px solid '+bc), background:bgc, color:tc, minWidth:100, cursor:'pointer', opacity:isSaving?0.5:1 }}>
                                          <option value=''>— chọn —</option>
                                          {driverList
                                            .filter(function(d) { return d.vai_tro === 'lai_xe' || d.vai_tro === 'ca_hai'; })
                                            .map(function(d) {
                                              const dc = driverCapacity[d.ten];
                                              const cap2 = dc ? dc.thung : 0;
                                              const load2 = driverLoad[d.ten] || 0;
                                              const isFull = cap2 > 0 && load2 >= cap2;
                                              const ps = cap2 > 0 ? (' (' + load2 + '/' + cap2 + ')') : '';
                                              const bs = d.bien_so ? (' [' + d.bien_so + ']') : '';
                                              return <option key={d.id} value={d.ten} disabled={isFull}>{d.ten}{bs}{ps}{isFull ? ' 🚫' : ''}</option>;
                                            })}
                                        </select>
                                        {(function() {
                                          const selDriver = driverList.find(function(d) { return d.ten === display; });
                                          const bienSo = selDriver && selDriver.bien_so;
                                          return bienSo ? <div style={{ fontSize:10, color:'#6b7280', marginTop:2 }}>🚗 {bienSo}</div> : null;
                                        })()}
                                        {selCap > 0 && (
                                          <div style={{ marginTop:2 }}>
                                            <div style={{ background:'#e5e7eb', borderRadius:99, height:3, overflow:'hidden' }}>
                                              <div style={{ background: overload?'#dc2626':nearFull?'#f59e0b':'#10b981', width:(Math.min(100,selPct)+'%'), height:'100%', transition:'width .3s' }} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })() : (
                                    <span style={{ fontSize:12, color:'#374151' }}>{p.lai_xe || <span style={{ color:'#d1d5db' }}>—</span>}</span>
                                  )}
                                </td>
                                <td style={{ padding:'6px 8px' }}>
                                  {driverList.length > 0 ? (function() {
                                    const s3 = statusMap[p.row_key];
                                    const assigned  = s3 ? s3.giao_nhan_phan_cong : undefined;
                                    const fromSheet = p.giao_nhan;
                                    const display   = assigned !== undefined && assigned !== null ? assigned : (fromSheet || '');
                                    const isSaving  = assigningKey === p.row_key + '_giao_nhan_phan_cong';
                                    return (
                                      <select value={display} disabled={isSaving}
                                        onChange={function(e) { assignLaiXe(p, 'giao_nhan_phan_cong', e.target.value); }}
                                        style={{ fontSize:11, padding:'3px 6px', borderRadius:5, border:(assigned?'1px solid #6366f1':'1px solid #d1d5db'), background:(assigned?'#eef2ff':'white'), color:(assigned?'#4f46e5':'#374151'), minWidth:90, cursor:'pointer', opacity:isSaving?0.5:1 }}>
                                        <option value=''>— chọn —</option>
                                        {driverList
                                          .filter(function(d) { return d.vai_tro === 'giao_nhan' || d.vai_tro === 'ca_hai'; })
                                          .map(function(d) { const bs = d.bien_so ? (' [' + d.bien_so + ']') : ''; return <option key={d.id} value={d.ten}>{d.ten}{bs}</option>; })}
                                      </select>
                                    );
                                  })() : (
                                    <span style={{ fontSize:12, color:'#374151' }}>{p.giao_nhan || <span style={{ color:'#d1d5db' }}>—</span>}</span>
                                  )}
                                </td>
                                {activeDriver && (() => {
                                  const s = statusMap[p.row_key];
                                  const lx = s ? s.lai_xe_phan_cong : p.lai_xe;
                                  const inCart = lx === activeDriver;
                                  const isSaving = assigningKey === p.row_key + '_lai_xe_phan_cong';
                                  return (
                                    <td style={{ padding:'6px 8px', textAlign:'center' }}>
                                      <button
                                        disabled={isSaving}
                                        onClick={() => {
                                          if (!inCart) assignLaiXe(p, 'lai_xe_phan_cong', activeDriver);
                                        }}
                                        style={{
                                          padding:'4px 8px', borderRadius:6, border:'none', cursor: inCart ? 'default' : 'pointer',
                                          background: inCart ? '#d1fae5' : '#7c3aed', color: inCart ? '#059669' : 'white',
                                          fontWeight:700, fontSize:12, minWidth:52, opacity: isSaving ? 0.5 : 1,
                                        }}>
                                        {isSaving ? '…' : inCart ? '✓' : '➕'}
                                      </button>
                                    </td>
                                  );
                                })()}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {/* ── STICKY CART BAR ── */}
      {activeDriver && (() => {
        const cartOrders = phieuList.filter(p => {
          const s = statusMap[p.row_key];
          const lx = s ? s.lai_xe_phan_cong : p.lai_xe;
          return lx === activeDriver;
        });
        const dInfo = driverList.find(d => d.ten === activeDriver) || {};
        return (
          <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:9990, background:'#1e3a5f', color:'white', padding:'12px 24px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 -4px 20px rgba(0,0,0,.25)' }}>
            <span style={{ fontSize:20 }}>🛒</span>
            <div>
              <div style={{ fontWeight:800, fontSize:14 }}>{activeDriver} {dInfo.bien_so ? '· ' + dInfo.bien_so : ''}</div>
              <div style={{ fontSize:12, opacity:.8 }}>{cartOrders.length} đơn trong giỏ</div>
            </div>
            <div style={{ flex:1 }} />
            <button
              onClick={() => { setHoiThenLenh(true); setHoiNoHoi(false); setHoiModal(activeDriver); }}
              disabled={cartOrders.length === 0}
              style={{ padding:'8px 18px', background: cartOrders.length === 0 ? '#4b6a8a' : '#f59e0b', color: cartOrders.length === 0 ? '#9ca3af' : '#1e3a5f', border:'none', borderRadius:8, fontWeight:800, fontSize:13, cursor: cartOrders.length===0 ? 'default' : 'pointer' }}>
              📋 Xem giỏ & In lệnh xe
            </button>
            <button
              onClick={() => setActiveDriver(null)}
              style={{ padding:'8px 14px', background:'rgba(255,255,255,.15)', color:'white', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
              ✕ Đóng giỏ
            </button>
          </div>
        );
      })()}

      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, padding:'12px 20px', borderRadius:10, maxWidth:380, background: toast.type==='error'?'#fef2f2':'#fffbeb', border:('2px solid '+(toast.type==='error'?'#fca5a5':'#fde68a')), color: toast.type==='error'?'#dc2626':'#b45309', fontWeight:700, fontSize:13, boxShadow:'0 4px 20px rgba(0,0,0,.15)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ flex:1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:16, color: toast.type==='error'?'#fca5a5':'#fde68a' }}>✕</button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ marginTop:10, padding:'8px 14px', background:'#f9fafb', borderRadius:8, fontSize:11, color:'#6b7280', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
          <span>📋 <b>{filtered.length}</b> chuyến</span>
          {filtered.filter(function(p) { return !p.ngay_can_giao; }).length > 0 && (
            <span style={{ color:'#b45309', fontWeight:700 }}>⚠️ Chưa lịch: <b>{filtered.filter(function(p) { return !p.ngay_can_giao; }).length}</b></span>
          )}
          <span>⏳ Chờ: <b>{filtered.filter(function(p) { return getTT(p)==='cho_giao'; }).length}</b></span>
          <span>🚚 Đang: <b>{filtered.filter(function(p) { return getTT(p)==='dang_giao'; }).length}</b></span>
          <span>✅ Xong: <b>{filtered.filter(function(p) { return getTT(p)==='da_giao'; }).length}</b></span>
          {groupByArea && (
            <span>📍 {grouped.reduce(function(n, b) { return n + Object.keys(b.subGroups).length; }, 0)} khu vực</span>
          )}
          <span style={{ marginLeft:'auto' }}>Dữ liệu realtime từ Google Sheets</span>
        </div>
      )}
      {/* ── MODAL LỆNH ĐIỀU XE ── */}
      {/* ── MODAL CHỐT CHUYẾN ── */}
      {/* ── MODAL TÓM TẮT THIẾU HÀNG → EMAIL KHO ── */}
      {chotSummary && (() => {
        const body = [
          `Kính gửi phụ trách kho,`,
          ``,
          `Tổng hợp hàng thiếu ngày ${chotSummary.date} — Xe: ${chotSummary.driver}`,
          ``,
          ...chotSummary.thieu.map((d, i) =>
            `${i+1}. [${d.so_phieu}] ${d.ten_kh}\n   → ${d.ghi_chu}`
          ),
          ``,
          `Vui lòng kiểm tra và bổ sung trong chuyến giao tiếp theo.`,
          `Trân trọng.`,
        ].join('\n');
        const mailtoLink = `mailto:?subject=${encodeURIComponent(`[Thiếu hàng] ${chotSummary.date} - Xe ${chotSummary.driver}`)}&body=${encodeURIComponent(body)}`;
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:10002, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:600, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
              <div style={{ background:'#f59e0b', color:'white', padding:'14px 20px', borderRadius:'14px 14px 0 0', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:16 }}>⚠️ Thiếu hàng — cần báo kho</div>
                  <div style={{ fontSize:12, opacity:.9 }}>{chotSummary.thieu.length} đơn có hàng thiếu · Xe {chotSummary.driver} · {chotSummary.date}</div>
                </div>
              </div>
              <div style={{ padding:'16px 20px' }}>
                <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:12, fontFamily:'monospace', fontSize:12, whiteSpace:'pre-wrap', lineHeight:1.6, marginBottom:14, maxHeight:260, overflowY:'auto' }}>
                  {body}
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={() => { navigator.clipboard.writeText(body); showToast('Đã copy nội dung email', 'ok'); }}
                    style={{ padding:'8px 16px', border:'1px solid #d1d5db', borderRadius:8, background:'white', cursor:'pointer', fontSize:13 }}>
                    📋 Copy nội dung
                  </button>
                  <a href={mailtoLink}
                    style={{ padding:'8px 16px', background:'#1d4ed8', color:'white', borderRadius:8, fontWeight:700, fontSize:13, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
                    ✉️ Mở email
                  </a>
                  <button onClick={() => { setChotSummary(null); showToast(`✅ Chốt xong xe ${chotSummary.driver}`, 'ok'); }}
                    style={{ padding:'8px 16px', background:'#059669', color:'white', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    Xong ✓
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {chotModal && (() => {
        const driverInfo = driverList.find(d => d.ten === chotModal) || {};
        const orders = phieuList.filter(p => {
          const s = statusMap[p.row_key];
          const lx = s ? (s.lai_xe_phan_cong || p.lai_xe) : p.lai_xe;
          return lx === chotModal;
        });
        const kmBatDau  = chotData.km_bat_dau  ?? '';
        const kmKetThuc = chotData.km_ket_thuc ?? '';
        const kmThucTe  = kmBatDau !== '' && kmKetThuc !== '' ? (parseInt(kmKetThuc) - parseInt(kmBatDau)) : null;
        const donHoan   = chotData.donHoan || new Set();
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:10001, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
            onClick={() => setChotModal(null)}>
            <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:780, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ background:'#059669', color:'white', padding:'14px 20px', borderRadius:'14px 14px 0 0', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:16 }}>✅ Chốt chuyến — {chotModal}</div>
                  <div style={{ fontSize:12, opacity:.85, marginTop:2 }}>
                    🚗 {driverInfo.bien_so || 'Chưa có biển số'} · 📅 {ngayTu} · {orders.length} đơn
                  </div>
                </div>
                <button onClick={() => setChotModal(null)} style={{ background:'rgba(255,255,255,.2)', border:'none', color:'white', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:14 }}>✕</button>
              </div>

              <div style={{ padding:'16px 20px' }}>
                {/* KM input */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16, background:'#f0fdf4', borderRadius:10, padding:14 }}>
                  {[
                    { label:'Km xuất phát', key:'km_bat_dau', placeholder:'VD: 45200' },
                    { label:'Km kết thúc',  key:'km_ket_thuc', placeholder:'VD: 45380' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:4 }}>{f.label}</div>
                      <input
                        type="number"
                        value={chotData[f.key] ?? ''}
                        onChange={e => setChotData(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width:'100%', padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, outline:'none' }}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:4 }}>Km thực tế</div>
                    <div style={{ padding:'7px 10px', border:'1px solid #bbf7d0', borderRadius:7, fontSize:16, fontWeight:800, color: kmThucTe != null ? '#059669' : '#9ca3af', background:'white' }}>
                      {kmThucTe != null ? `${kmThucTe} km` : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:4 }}>Ghi chú chuyến</div>
                  <input
                    value={chotData.ghi_chu ?? ''}
                    onChange={e => setChotData(prev => ({ ...prev, ghi_chu: e.target.value }))}
                    placeholder="VD: xe bị kẹt đường, giao chậm 2 đơn..."
                    style={{ width:'100%', padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:7, fontSize:13, outline:'none' }}
                  />
                </div>

                {/* Danh sách đơn */}
                <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>
                  Tick đơn <span style={{ color:'#dc2626', fontWeight:700 }}>HOÀN / KHÔNG GIAO ĐƯỢC</span> (còn lại tự động → Đã giao):
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f3f4f6' }}>
                      {['Hoàn?','#','Số phiếu','Khách hàng','Địa chỉ','Hàng hóa','Ghi chú thiếu hàng'].map(h => (
                        <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, color:'#374151', borderBottom:'2px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((p, i) => {
                      const isHoan = donHoan.has(p.row_key);
                      return (
                        <tr key={p.row_key} style={{ borderBottom:'1px solid #f3f4f6', background: isHoan ? '#fef2f2' : (i%2===0?'white':'#fafafa') }}>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>
                            <input type="checkbox" checked={isHoan} onChange={() => {
                              setChotData(prev => {
                                const next = new Set(prev.donHoan);
                                if (next.has(p.row_key)) next.delete(p.row_key); else next.add(p.row_key);
                                return { ...prev, donHoan: next };
                              });
                            }} style={{ width:16, height:16, cursor:'pointer', accentColor:'#dc2626' }} />
                          </td>
                          <td style={{ padding:'6px 8px', color:'#9ca3af' }}>{i+1}</td>
                          <td style={{ padding:'6px 8px', fontWeight:600, color: isHoan?'#dc2626':'#1d4ed8', textDecoration: isHoan?'line-through':'' }}>{p.so_phieu}</td>
                          <td style={{ padding:'6px 8px' }}>{p.ten_kh}</td>
                          <td style={{ padding:'6px 8px', color:'#6b7280', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.dia_chi_giao}</td>
                          <td style={{ padding:'6px 8px', color:'#374151', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {p.san_pham && p.san_pham.length > 0
                              ? p.san_pham.map(s => `${s.ma_sp}×${s.so_luong}`).join(', ')
                              : (p.ghi_chu ? p.ghi_chu.slice(0,40) : '—')}
                          </td>
                          <td style={{ padding:'4px 6px', minWidth:180 }}>
                            <input
                              type="text"
                              value={(chotData.donGhiChu && chotData.donGhiChu[p.row_key]) || ''}
                              onChange={e => setChotData(prev => ({
                                ...prev,
                                donGhiChu: { ...prev.donGhiChu, [p.row_key]: e.target.value }
                              }))}
                              placeholder="VD: thiếu 2 A4 70g..."
                              style={{
                                width:'100%', padding:'4px 7px', fontSize:11,
                                border: (chotData.donGhiChu && chotData.donGhiChu[p.row_key]) ? '1px solid #f59e0b' : '1px solid #e5e7eb',
                                borderRadius:5, outline:'none',
                                background: (chotData.donGhiChu && chotData.donGhiChu[p.row_key]) ? '#fffbeb' : 'white',
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Summary */}
                {(() => {
                  const donThieuCount = Object.values(chotData.donGhiChu || {}).filter(v => v && v.trim()).length;
                  return (
                    <div style={{ display:'flex', gap:16, marginTop:12, padding:'10px 14px', background:'#f9fafb', borderRadius:8, fontSize:12, flexWrap:'wrap' }}>
                      <span>📦 Tổng: <b>{orders.length}</b> đơn</span>
                      <span style={{ color:'#059669' }}>✅ Giao đủ: <b>{orders.length -