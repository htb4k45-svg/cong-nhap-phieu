'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

// ── Hằng số ──────────────────────────────────────────────────────────────────

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

// ── Normalize tiếng Việt (bỏ dấu) ────────────────────────────────────────────

function normVN(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

// ── Regex fallback (khi chưa có dữ liệu DB) ──────────────────────────────────

const KHU_VUC_PATTERNS = [
  [/\bQU[AẬ]N\s+(\d{1,2})\b/i,        m => `Quận ${m[1]}`],
  [/\bQ\.?\s*(\d{1,2})\b/,             m => `Quận ${m[1]}`],
  [/TP\.?\s*TH[UÚ]\s*Đ[UÚ]C/i,         () => 'TP Thủ Đức'],
  [/TH[UÚ]\s*Đ[UÚ]C/i,                 () => 'Thủ Đức'],
  [/B[ÌI]NH\s*TH[AẠ]NH/i,              () => 'Bình Thạnh'],
  [/G[ÒO]\s*V[AẤ]P/i,                  () => 'Gò Vấp'],
  [/PH[UÚ]\s*NH[UU][AẬ]N/i,            () => 'Phú Nhuận'],
  [/T[AÂ]N\s*B[ÌI]NH/i,               () => 'Tân Bình'],
  [/T[AÂ]N\s*PH[UÚ]/i,                () => 'Tân Phú'],
  [/B[ÌI]NH\s*T[AÂ]N/i,               () => 'Bình Tân'],
  [/B[ÌI]NH\s*CH[AÁ]NH/i,             () => 'Bình Chánh'],
  [/H[OÓ]C\s*M[ÔO]N/i,               () => 'Hóc Môn'],
  [/C[UÚ]\s*CHI/i,                     () => 'Củ Chi'],
  [/NH[AÀ]\s*B[EÈ]/i,                  () => 'Nhà Bè'],
  [/C[AẦ]N\s*GI[OÒ]/i,                () => 'Cần Giờ'],
  [/LONG\s*AN/i,                        () => 'Long An'],
  [/B[ÌI]NH\s*D[UÙ][OƠ]NG/i,          () => 'Bình Dương'],
  [/Đ[OÔ]NG\s*NAI/i,                   () => 'Đồng Nai'],
  [/T[IÌ][EÊ]N\s*GIANG/i,              () => 'Tiền Giang'],
  [/T[AÂ]Y\s*NINH/i,                   () => 'Tây Ninh'],
  [/V[UÚ]NG\s*T[AÀ]U/i,               () => 'Vũng Tàu'],
  [/H[AÀ]\s*N[OỘ]I/i,                 () => 'Hà Nội'],
  [/B[AẮ]C\s*NINH/i,                   () => 'Bắc Ninh'],
  [/H[UÙ]NG\s*Y[EÊ]N/i,               () => 'Hưng Yên'],
  [/H[AÀ]\s*NAM/i,                     () => 'Hà Nam'],
  [/V[IÌ]NH\s*PH[UÚ]C/i,              () => 'Vĩnh Phúc'],
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

// ── Build matcher từ danh sách phường/xã DB (schema mới, không có quận) ───────
// wardList: [{ten_xa, ten_xa_ngan, ma_tinh, ten_tinh}]

function buildHuyenMatcher(wardList) {
  if (!wardList || wardList.length === 0) return null;

  const entries = [];
  for (const w of wardList) {
    const fullNorm  = normVN(w.ten_xa);
    const shortNorm = normVN(w.ten_xa_ngan || '');
    const label     = w.ten_xa_ngan || w.ten_xa;
    // loai_xa: 'phường' | 'xã' | 'thị trấn'
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

// ── extractKhuVuc → { name, loai } ────────────────────────────────────────────
// loai: 'phường' | 'xã' | 'thị trấn' | null

function extractKhuVuc(diaChi, matcherFn) {
  if (!diaChi) return { name: 'Chưa rõ', loai: null };

  // DB matcher
  if (matcherFn) {
    const m = matcherFn(diaChi);
    if (m) return { name: m.label, loai: m.loai };
  }

  // Fallback: đoán loai từ text địa chỉ
  const d = diaChi.toLowerCase();
  const loai = /ph[ưu][ờo]ng/.test(d) ? 'phường'
             : /\bx[ãa]\b/.test(d)    ? 'xã'
             : /th[ịi]\s*tr[aấ]n/.test(d) ? 'thị trấn'
             : null;
  return { name: extractKhuVucFallback(diaChi), loai };
}

// ── Component chính ───────────────────────────────────────────────────────────

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
  const [filterLaiXe, setFilterLaiXe] = useState(null);  // null = tất cả
  const [groupByArea, setGroupByArea] = useState(true);
  const [lastFetch, setLastFetch]     = useState(null);
  const [huyenList, setHuyenList]     = useState([]);  // dữ liệu quận/huyện từ DB
  const [driverList, setDriverList]   = useState([]);  // danh sách lái xe từ DB
  const [assigningKey, setAssigningKey] = useState(null); // row_key đang lưu phân công

  // ── Fetch dữ liệu ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async (from, to) => {
    setLoading(true);
    setSheetErrors([]);
    try {
      const [sheetsRes, statusRes] = await Promise.all([
        fetch(`/api/sheets-data?from=${from}&to=${to}`),
        fetch(`/api/dispatch-status?from=${from}&to=${to}`),
      ]);
      const sheetsJson = await sheetsRes.json();
      const statusJson = await statusRes.json();
      setPhieuList(sheetsJson.phieu || []);
      setStatusMap(statusJson.statusMap || {});
      setSheetErrors(sheetsJson.errors || []);
      setLastFetch(new Date().toLocaleTimeString('vi-VN'));
    } catch (e) {
      setSheetErrors([e.message]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(ngayTu, ngayDen); }, [ngayTu, ngayDen, fetchData]);

  // Load danh sách phường/xã từ DB (1 lần khi mount)
  useEffect(() => {
    fetch('/api/phuong-xa?list=1')
      .then(r => r.json())
      .then(d => {
        const list = d.wards || d.huyens || [];
        if (list.length > 0) setHuyenList(list);
      })
      .catch(() => {});
  }, []);

  // Load danh sách lái xe từ DB (1 lần khi mount)
  useEffect(() => {
    fetch('/api/drivers')
      .then(r => r.json())
      .then(d => { if (d.drivers?.length > 0) setDriverList(d.drivers); })
      .catch(() => {});
  }, []);

  // ── Chuyển trạng thái ───────────────────────────────────────────────────────

  const cycleStatus = async (phieu) => {
    const cur  = statusMap[phieu.row_key]?.trang_thai || 'cho_giao';
    const next = TRANG_THAI[cur]?.next || 'cho_giao';
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
      setStatusMap(m => ({ ...m, [phieu.row_key]: { ...m[phieu.row_key], trang_thai: next } }));
    } finally {
      setUpdatingKey(null);
    }
  };

  // days=0 → hôm nay | days=3 → hôm qua+hôm nay+ngày mai | days=7 → 3 ngày qua → 3 ngày tới
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

  // ── Helper ─────────────────────────────────────────────────────────────────

  const getTT = useCallback((p) => statusMap[p.row_key]?.trang_thai || 'cho_giao', [statusMap]);

  // ── Phân công lái xe ────────────────────────────────────────────────────────

  const assignLaiXe = async (phieu, field, value) => {
    // field: 'lai_xe_phan_cong' | 'giao_nhan_phan_cong'
    setAssigningKey(phieu.row_key + '_' + field);
    const cur = statusMap[phieu.row_key] || {};
    const newStatus = {
      ...cur,
      [field]: value || null,
    };
    try {
      const res = await fetch('/api/dispatch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_key:    phieu.row_key,
          bo_phan:    phieu.bo_phan,
          ngay_giao:  phieu.ngay_can_giao || ngayTu,
          trang_thai: cur.trang_thai || 'cho_giao',
          [field]:    value || null,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setStatusMap(m => ({ ...m, [phieu.row_key]: { ...m[phieu.row_key], ...json.data } }));
      }
    } catch (e) {
      console.error('assignLaiXe error:', e);
    } finally {
      setAssigningKey(null);
    }
  };

  // ── Computed values ────────────────────────────────────────────────────────

  const filtered = useMemo(() => phieuList.filter(p => {
    if (filterBP !== 'TAT_CA' && p.bo_phan !== filterBP) return false;
    if (filterTT !== 'TAT_CA' && getTT(p) !== filterTT) return false;
    if (filterLaiXe) {
      const lx = p.lai_xe || p.giao_nhan || 'Chưa phân công';
      if (lx !== filterLaiXe) return false;
    }
    return true;
  }), [phieuList, filterBP, filterTT, filterLaiXe, getTT]);

  const stats = useMemo(() => {
    const total = phieuList.length;
    const cho   = phieuList.filter(p => getTT(p) === 'cho_giao').length;
    const dang  = phieuList.filter(p => getTT(p) === 'dang_giao').length;
    const da    = phieuList.filter(p => getTT(p) === 'da_giao').length;
    const pct   = total ? Math.round((da / total) * 100) : 0;

    const byBP = {};
    phieuList.forEach(p => {
      const bp = p.bo_phan;
      if (!byBP[bp]) byBP[bp] = { total:0, cho:0, dang:0, da:0 };
      byBP[bp].total++;
      const tt = getTT(p);
      if (tt === 'cho_giao')  byBP[bp].cho++;
      if (tt === 'dang_giao') byBP[bp].dang++;
      if (tt === 'da_giao')   byBP[bp].da++;
    });

    const byLaiXe = {};
    phieuList.forEach(p => {
      const lx = p.lai_xe || p.giao_nhan || 'Chưa phân công';
      if (!byLaiXe[lx]) byLaiXe[lx] = { total:0, cho:0, dang:0, da:0 };
      byLaiXe[lx].total++;
      const tt = getTT(p);
      if (tt === 'cho_giao')  byLaiXe[lx].cho++;
      if (tt === 'dang_giao') byLaiXe[lx].dang++;
      if (tt === 'da_giao')   byLaiXe[lx].da++;
    });

    return { total, cho, dang, da, pct, byBP, byLaiXe };
  }, [phieuList, getTT]);

  // Build matcher function từ dữ liệu DB
  const huyenMatcher = useMemo(() => buildHuyenMatcher(huyenList), [huyenList]);

  // grouped: mảng [ { key, label, icon, color, subGroups: { tenPhuong: [phieu] } } ]
  const grouped = useMemo(() => {
    if (!groupByArea) return [{ key: '__all', label: null, subGroups: { '__all': filtered } }];

    const buckets = {
      phuong:    { key: 'phuong',  label: 'Tp / Phường', icon: '🏙️', color: '#1565C0', bg: '#E3F2FD', sub: {} },
      xa:        { key: 'xa',      label: 'Huyện / Xã',  icon: '🌿', color: '#2E7D32', bg: '#E8F5E9', sub: {} },
      other:     { key: 'other',   label: 'Chưa xác định', icon: '📍', color: '#6b7280', bg: '#F3F4F6', sub: {} },
    };

    filtered.forEach(p => {
      const { name, loai } = extractKhuVuc(p.dia_chi_giao, huyenMatcher);
      const bucket = loai === 'phường' ? buckets.phuong
                   : (loai === 'xã' || loai === 'thị trấn') ? buckets.xa
                   : buckets.other;
      if (!bucket.sub[name]) bucket.sub[name] = [];
      bucket.sub[name].push(p);
    });

    const sortSub = sub => Object.fromEntries(
      Object.entries(sub).sort(([a], [b]) => a.localeCompare(b, 'vi'))
    );

    return Object.values(buckets)
      .map(b => ({ ...b, subGroups: sortSub(b.sub) }))
      .filter(b => Object.keys(b.subGroups).length > 0);
  }, [filtered, groupByArea, huyenMatcher]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <Link href="/" style={{ fontSize:13, color:'#3b82f6', textDecoration:'none' }}>← Nhập phiếu</Link>
        <span style={{ color:'#d1d5db' }}>|</span>
        <h2 style={{ fontSize:20, fontWeight:700, margin:0 }}>🚚 Điều xe</h2>
        {lastFetch && <span style={{ fontSize:11, color:'#9ca3af' }}>Cập nhật {lastFetch}</span>}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {/* Preset nhanh */}
          {[
            ['Hôm nay', 0],
            ['±1 ngày', 3],
            ['±3 ngày', 7],
          ].map(([label, days]) => (
            <button key={label} onClick={()=>setPreset(days)} style={{
              ...btnStyle, fontSize:12, padding:'5px 10px',
              background: (days===0 && isSingleDay && ngayTu===toDateStr(new Date()))
                || (days===3 && !isSingleDay) ? '#eff6ff' : 'white',
              color: '#374151',
            }}>{label}</button>
          ))}

          <span style={{ color:'#d1d5db', margin:'0 2px' }}>|</span>

          {/* From - To pickers */}
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <input type="date" value={ngayTu}
              onChange={e => { setNgayTu(e.target.value); if (e.target.value > ngayDen) setNgayDen(e.target.value); }}
              style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, fontWeight:600 }} />
            <span style={{ color:'#9ca3af', fontSize:13 }}>→</span>
            <input type="date" value={ngayDen} min={ngayTu}
              onChange={e => setNgayDen(e.target.value)}
              style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, fontWeight:600 }} />
          </div>

          <button onClick={()=>fetchData(ngayTu, ngayDen)} disabled={loading}
            style={{ ...btnStyle, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe', padding:'5px 12px' }}>
            {loading ? '…' : '🔄 Tải lại'}
          </button>
        </div>
      </div>

      {/* Lỗi sheet */}
      {sheetErrors.length > 0 && (
        <div style={{ background:'#fef9c3', border:'1px solid #fde047', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#854d0e' }}>
          ⚠️ {sheetErrors.join(' · ')}
        </div>
      )}

      {/* ── DASHBOARD ──────────────────────────────────────────────────────── */}
      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:12, padding:16, marginBottom:14 }}>

        {/* Stats + progress bar */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr) 1.2fr', gap:10, marginBottom:16 }}>
          {[
            { label:'Tổng chuyến', val:stats.total, color:'#1d4ed8', bg:'#eff6ff' },
            { label:'Chờ giao',    val:stats.cho,   color:'#2563eb', bg:'#dbeafe' },
            { label:'Đang giao',   val:stats.dang,  color:'#d97706', bg:'#fef3c7' },
            { label:'Đã giao',     val:stats.da,    color:'#059669', bg:'#d1fae5' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:30, fontWeight:800, color:s.color, lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>{s.label}</div>
            </div>
          ))}

          {/* Tiến độ */}
          <div style={{ background:'#f0fdf4', borderRadius:10, padding:'12px 16px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
              <span style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>Tiến độ hoàn thành</span>
              <span style={{ fontSize:24, fontWeight:800, color:'#059669' }}>{stats.pct}%</span>
            </div>
            <div style={{ background:'#bbf7d0', borderRadius:99, height:12, overflow:'hidden' }}>
              <div style={{
                background: stats.pct >= 100 ? '#059669' : stats.pct >= 50 ? '#16a34a' : '#4ade80',
                height:'100%', width:`${stats.pct}%`, transition:'width .5s ease',
              }} />
            </div>
            <div style={{ display:'flex', gap:10, marginTop:8, fontSize:11, color:'#6b7280' }}>
              <span>⏳{stats.cho} chờ</span>
              <span>🚚{stats.dang} đang</span>
              <span>✅{stats.da} xong</span>
            </div>
          </div>
        </div>

        {/* Theo bộ phận + theo lái xe */}
        <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:16 }}>

          {/* Theo bộ phận */}
          <div style={{ borderRight:'1px solid #f3f4f6', paddingRight:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9ca3af', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>
              Theo bộ phận
            </div>
            {Object.keys(stats.byBP).length === 0
              ? <div style={{ fontSize:12, color:'#d1d5db' }}>Chưa có dữ liệu</div>
              : Object.entries(stats.byBP).map(([bp, d]) => {
                const pct = d.total ? Math.round(d.da / d.total * 100) : 0;
                return (
                  <div key={bp} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{
                        fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:4,
                        background:BP_COLOR[bp]||'#6b7280', color:'white',
                      }}>{bp}</span>
                      <span style={{ fontSize:11, color:'#6b7280' }}>{d.da}/{d.total} ({pct}%)</span>
                    </div>
                    <div style={{ background:'#e5e7eb', borderRadius:99, height:8, overflow:'hidden', display:'flex' }}>
                      <div title={`Đã giao: ${d.da}`}
                        style={{ background:'#059669', width:`${d.total?d.da/d.total*100:0}%`, transition:'width .4s' }} />
                      <div title={`Đang giao: ${d.dang}`}
                        style={{ background:'#fbbf24', width:`${d.total?d.dang/d.total*100:0}%`, transition:'width .4s' }} />
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:3, fontSize:10, color:'#9ca3af' }}>
                      <span>⏳{d.cho}</span><span>🚚{d.dang}</span><span>✅{d.da}</span>
                    </div>
                  </div>
                );
              })
            }
          </div>

          {/* Theo lái xe */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>
                Theo lái xe / giao nhận
              </span>
              {filterLaiXe && (
                <button onClick={()=>setFilterLaiXe(null)} style={{
                  fontSize:11, padding:'1px 8px', borderRadius:10, border:'1px solid #fca5a5',
                  background:'#fee2e2', color:'#dc2626', cursor:'pointer', fontWeight:600,
                }}>
                  ✕ Bỏ lọc
                </button>
              )}
            </div>
            {Object.keys(stats.byLaiXe).length === 0
              ? <div style={{ fontSize:12, color:'#d1d5db' }}>Chưa có dữ liệu</div>
              : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:8 }}>
                  {Object.entries(stats.byLaiXe)
                    .sort((a,b) => b[1].total - a[1].total)
                    .map(([lx, d]) => {
                      const pct      = d.total ? Math.round(d.da / d.total * 100) : 0;
                      const selected = filterLaiXe === lx;
                      return (
                        <div key={lx}
                          onClick={() => setFilterLaiXe(selected ? null : lx)}
                          title={selected ? 'Bấm để bỏ lọc' : `Xem đơn của ${lx}`}
                          style={{
                            background: selected ? '#eff6ff' : '#f9fafb',
                            borderRadius:8, padding:'8px 12px', cursor:'pointer',
                            border: selected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                            transition:'box-shadow .15s',
                            boxShadow: selected ? '0 0 0 3px #bfdbfe' : 'none',
                          }}
                          onMouseEnter={e => { if(!selected) e.currentTarget.style.borderColor='#93c5fd'; }}
                          onMouseLeave={e => { if(!selected) e.currentTarget.style.borderColor='#e5e7eb'; }}
                        >
                          <div style={{
                            fontSize:12, fontWeight:700,
                            color: selected ? '#1d4ed8' : '#111827',
                            marginBottom:4,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          }} title={lx}>
                            {selected ? '🔍 ' : ''}{lx}
                          </div>
                          <div style={{ background:'#e5e7eb', borderRadius:99, height:5, overflow:'hidden', marginBottom:5 }}>
                            <div style={{ background: selected ? '#3b82f6' : '#059669', width:`${pct}%`, height:'100%', transition:'width .4s' }} />
                          </div>
                          <div style={{ display:'flex', gap:8, fontSize:11 }}>
                            <span style={{ color:'#2563eb' }}>⏳{d.cho}</span>
                            <span style={{ color:'#d97706' }}>🚚{d.dang}</span>
                            <span style={{ color:'#059669' }}>✅{d.da}</span>
                            <span style={{ marginLeft:'auto', color:'#9ca3af', fontWeight:600 }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* ── FILTER BAR ────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
        {/* Bộ phận */}
        <div style={{ display:'flex', gap:2, background:'#f3f4f6', borderRadius:8, padding:3 }}>
          {['TAT_CA','MT','GT','B2B'].map(bp => (
            <button key={bp} onClick={()=>setFilterBP(bp)} style={{
              padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
              background: filterBP===bp ? (BP_COLOR[bp]||'#374151') : 'transparent',
              color: filterBP===bp ? 'white' : '#6b7280',
            }}>
              {bp==='TAT_CA' ? 'Tất cả' : bp}
            </button>
          ))}
        </div>

        {/* Trạng thái */}
        <div style={{ display:'flex', gap:2, background:'#f3f4f6', borderRadius:8, padding:3 }}>
          {[
            ['TAT_CA','Tất cả',   null,     '#374151'],
            ['cho_giao','Chờ',    '#dbeafe','#2563eb'],
            ['dang_giao','Đang',  '#fef3c7','#d97706'],
            ['da_giao','Đã giao', '#d1fae5','#059669'],
          ].map(([k,l,bg,col]) => (
            <button key={k} onClick={()=>setFilterTT(k)} style={{
              padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
              background: filterTT===k ? (bg||'#374151') : 'transparent',
              color: filterTT===k ? (col||'white') : '#6b7280',
            }}>{l}</button>
          ))}
        </div>

        {/* Nhóm khu vực */}
        <button onClick={()=>setGroupByArea(g=>!g)} style={{
          padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
          border:`1px solid ${groupByArea?'#3b82f6':'#d1d5db'}`,
          background: groupByArea ? '#eff6ff' : 'white',
          color: groupByArea ? '#1d4ed8' : '#6b7280',
        }}>
          📍 Nhóm khu vực {groupByArea ? '✓' : ''}
        </button>

        {filterLaiXe && (
          <div style={{
            display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
            background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8,
          }}>
            <span style={{ fontSize:12, color:'#1d4ed8', fontWeight:600 }}>🔍 {filterLaiXe}</span>
            <button onClick={()=>setFilterLaiXe(null)} style={{
              border:'none', background:'none', cursor:'pointer', color:'#93c5fd', fontSize:14, lineHeight:1, padding:0,
            }}>✕</button>
          </div>
        )}

        <span style={{ marginLeft:'auto', fontSize:12, color:'#9ca3af', fontWeight:600 }}>
          {filtered.length} chuyến
        </span>
      </div>

      {/* ── TABLE ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'white', borderRadius:12, border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>⏳</div>
          <div>Đang tải từ Google Sheets…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#9ca3af', background:'white', borderRadius:12, border:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
          <div style={{ fontWeight:600, marginBottom:4 }}>
            Không có chuyến nào {isSingleDay ? `ngày ${fmtVN(ngayTu)}` : `${fmtVN(ngayTu)} → ${fmtVN(ngayDen)}`}
          </div>
          <div style={{ fontSize:12 }}>Kiểm tra Google Sheets hoặc chọn ngày khác</div>
        </div>
      ) : (
        grouped.map(bucket => (
          <div key={bucket.key} style={{ marginBottom: groupByArea && bucket.label ? 24 : 0 }}>

            {/* ── Loại khu vực lớn (Tp/Phường hoặc Huyện/Xã) ── */}
            {groupByArea && bucket.label && (
              <div style={{
                display:'flex', alignItems:'center', gap:10, marginBottom:12,
                padding:'8px 14px', borderRadius:10,
                background: bucket.bg, border:`2px solid ${bucket.color}22`,
              }}>
                <span style={{ fontSize:18 }}>{bucket.icon}</span>
                <span style={{ fontSize:15, fontWeight:800, color: bucket.color }}>{bucket.label}</span>
                <span style={{ fontSize:12, color: bucket.color, opacity:0.7 }}>
                  — {Object.values(bucket.subGroups).flat().length} chuyến
                  &nbsp;·&nbsp;
                  ✅ {Object.values(bucket.subGroups).flat().filter(p=>getTT(p)==='da_giao').length} xong
                </span>
              </div>
            )}

            {/* ── Các nhóm phường/xã bên trong ── */}
            {Object.entries(bucket.subGroups).map(([groupKey, rows]) => (
              <div key={groupKey} style={{ marginBottom:14, marginLeft: groupByArea && bucket.label ? 12 : 0 }}>

                {groupByArea && groupKey !== '__all' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{
                      fontSize:12, fontWeight:700, color: bucket.color,
                      background: bucket.bg, padding:'2px 10px', borderRadius:20, whiteSpace:'nowrap',
                      border:`1px solid ${bucket.color}33`,
                    }}>
                      {groupKey}
                    </span>
                    <span style={{ fontSize:11, color:'#9ca3af' }}>{rows.length} chuyến</span>
                    <div style={{ flex:1, height:1, background:'#e5e7eb' }} />
                    <span style={{ fontSize:11, color:'#9ca3af' }}>
                      ✅ {rows.filter(p=>getTT(p)==='da_giao').length}/{rows.length}
                    </span>
                  </div>
                )}

                {/* Table */}
                <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid #e5e7eb', background:'white' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#f9fafb', borderBottom:'2px solid #e5e7eb' }}>
                        {[
                          ['#',          '36px'],
                          ['BP',         '50px'],
                          ['Mã / Phiếu', '110px'],
                          ['Ngày giao',  '110px'],
                          ['Khách hàng', '160px'],
                          ['Địa chỉ',    '200px'],
                          ['Kho',        '80px'],
                          ['Hàng hóa',   '160px'],
                          ['Trạng thái', '100px'],
                          ['Cập nhật',   '80px'],
                          ['Lái xe',     '100px'],
                          ['Giao nhận',  '100px'],
                        ].map(([h, w]) => (
                          <th key={h} style={{
                            padding:'9px 10px', textAlign:'left', fontSize:11, fontWeight:700,
                            color:'#6b7280', whiteSpace:'nowrap', width:w, minWidth:w,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p, i) => {
                        const tt     = TRANG_THAI[getTT(p)] || TRANG_THAI.cho_giao;
                        const isBusy = updatingKey === p.row_key;
                        const kvInfo = groupByArea ? null : extractKhuVuc(p.dia_chi_giao, huyenMatcher);

                        return (
                          <tr key={p.row_key}
                            style={{ borderBottom:'1px solid #f3f4f6', transition:'background .1s',
                              background: getTT(p)==='da_giao' ? '#f0fdf4' : !p.ngay_can_giao ? '#fffbeb' : isBusy ? '#fafafa' : 'white' }}
                            onMouseEnter={e=>{if(!isBusy&&getTT(p)!=='da_giao') e.currentTarget.style.background=!p.ngay_can_giao?'#fef3c7':'#fafafa';}}
                            onMouseLeave={e=>{e.currentTarget.style.background=getTT(p)==='da_giao'?'#f0fdf4':!p.ngay_can_giao?'#fffbeb':isBusy?'#fafafa':'white';}}
                          >
                            <td style={{ padding:'9px 10px', color:'#9ca3af', fontSize:11, userSelect:'none' }}>{i+1}</td>

                            <td style={{ padding:'9px 10px' }}>
                              <span style={{
                                padding:'2px 7px', borderRadius:4, fontSize:11, fontWeight:700,
                                background:BP_COLOR[p.bo_phan]||'#6b7280', color:'white',
                              }}>{p.bo_phan}</span>
                            </td>

                            <td style={{ padding:'9px 10px' }}>
                              {p.ma_lenh && <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', marginBottom:1 }}>{p.ma_lenh}</div>}
                              <div style={{ fontSize:11, color:'#6b7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}
                                title={p.so_phieu}>{p.so_phieu||'—'}</div>
                            </td>

                            <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                              {p.ngay_can_giao
                                ? <span style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{fmtVN(p.ngay_can_giao)}</span>
                                : <span style={{ fontSize:11, color:'#b45309', background:'#fef3c7', padding:'2px 7px', borderRadius:5, fontWeight:700 }}>⚠️ Chưa lịch</span>
                              }
                            </td>

                            <td style={{ padding:'9px 10px' }}>
                              <div style={{ fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}
                                title={p.ten_kh}>{p.ten_kh||'—'}</div>
                              {p.sdt && <div style={{ fontSize:11, color:'#9ca3af' }}>☎ {p.sdt}</div>}
                            </td>

                            <td style={{ padding:'9px 10px' }}>
                              <div style={{ fontSize:12, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}
                                title={p.dia_chi_giao}>{p.dia_chi_giao||'—'}</div>
                              {!groupByArea && kvInfo?.name && kvInfo.name !== 'Khác' && kvInfo.name !== 'Chưa rõ' && (
                                <span style={{
                                  fontSize:10, padding:'1px 6px', borderRadius:10, marginTop:2, display:'inline-block',
                                  color: kvInfo.loai==='phường' ? '#1565C0' : '#2E7D32',
                                  background: kvInfo.loai==='phường' ? '#E3F2FD' : '#E8F5E9',
                                }}>
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
                              {p.san_pham?.length > 0 ? (
                                <div>
                                  {p.san_pham.slice(0,3).map(sp => (
                                    <div key={sp.ma_sp} style={{ fontSize:11, color:'#374151', whiteSpace:'nowrap' }}>
                                      <span style={{ color:'#6b7280' }}>{sp.ma_sp}:</span> <strong>{sp.so_luong}</strong>
                                    </div>
                                  ))}
                                  {p.san_pham.length > 3 && <div style={{ fontSize:10, color:'#9ca3af' }}>+{p.san_pham.length - 3} sp nữa</div>}
                                </div>
                              ) : p.ghi_chu ? (
                                <span style={{ fontSize:11, color:'#6b7280' }} title={p.ghi_chu}>
                                  {p.ghi_chu.length > 45 ? p.ghi_chu.slice(0,45)+'…' : p.ghi_chu}
                                </span>
                              ) : <span style={{ color:'#e5e7eb' }}>—</span>}
                            </td>

                            <td style={{ padding:'9px 10px' }}>
                              <button onClick={()=>cycleStatus(p)} disabled={isBusy}
                                title="Click để đổi trạng thái"
                                style={{
                                  padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                                  background:tt.bg, color:tt.color, fontWeight:700, fontSize:11,
                                  whiteSpace:'nowrap', minWidth:82, opacity:isBusy?0.6:1,
                                }}>
                                {isBusy ? '…' : tt.label}
                              </button>
                            </td>

                            <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                              {(() => {
                                const t = fmtTime(statusMap[p.row_key]?.updated_at);
                                return t ? <span style={{ fontSize:11, color:'#6b7280' }}>{t}</span>
                                         : <span style={{ color:'#e5e7eb' }}>—</span>;
                              })()}
                            </td>

                            {/* Lái xe — dropdown nếu có danh sách, text nếu không */}
                            <td style={{ padding:'6px 8px' }}>
                              {driverList.length > 0 ? (() => {
                                const assigned = statusMap[p.row_key]?.lai_xe_phan_cong;
                                const fromSheet = p.lai_xe;
                                const display   = assigned ?? fromSheet ?? '';
                                const isSaving  = assigningKey === p.row_key + '_lai_xe_phan_cong';
                                return (
                                  <select
                                    value={display}
                                    disabled={isSaving}
                                    onChange={e => assignLaiXe(p, 'lai_xe_phan_cong', e.target.value)}
                                    style={{
                                      fontSize:11, padding:'3px 6px', borderRadius:5,
                                      border: assigned ? '1px solid #6366f1' : '1px solid #d1d5db',
                                      background: assigned ? '#eef2ff' : 'white',
                                      color: assigned ? '#4f46e5' : '#374151',
                                      minWidth:90, cursor:'pointer', opacity: isSaving ? 0.5 : 1,
                                    }}
                                  >
                                    <option value=''>— chọn —</option>
                                    {driverList
                                      .filter(d => d.vai_tro === 'lai_xe' || d.vai_tro === 'ca_hai')
                                      .map(d => <option key={d.id} value={d.ten}>{d.ten}</option>)}
                                    {/* Giữ lại tên từ sheet nếu không có trong DB (so sánh không phân biệt unicode) */}
                                    {fromSheet && !driverList.find(d=>d.ten.normalize('NFC').trim().toUpperCase()===fromSheet.normalize('NFC').trim().toUpperCase()) && (
                                      <option value={fromSheet}>{fromSheet}</option>
                                    )}
                                  </select>
                                );
                              })() : (
                                <span style={{ fontSize:12, color:'#374151' }}>{p.lai_xe || <span style={{color:'#d1d5db'}}>—</span>}</span>
                              )}
                            </td>

                            {/* Giao nhận — dropdown */}
                            <td style={{ padding:'6px 8px' }}>
                              {driverList.length > 0 ? (() => {
                                const assigned = statusMap[p.row_key]?.giao_nhan_phan_cong;
                                const fromSheet = p.giao_nhan;
                                const display   = assigned ?? fromSheet ?? '';
                                const isSaving  = assigningKey === p.row_key + '_giao_nhan_phan_cong';
                                return (
                                  <select
                                    value={display}
                                    disabled={isSaving}
                                    onChange={e => assignLaiXe(p, 'giao_nhan_phan_cong', e.target.value)}
                                    style={{
                                      fontSize:11, padding:'3px 6px', borderRadius:5,
                                      border: assigned ? '1px solid #6366f1' : '1px solid #d1d5db',
                                      background: assigned ? '#eef2ff' : 'white',
                                      color: assigned ? '#4f46e5' : '#374151',
                                      minWidth:90, cursor:'pointer', opacity: isSaving ? 0.5 : 1,
                                    }}
                                  >
                                    <option value=''>— chọn —</option>
                                    {driverList
                                      .filter(d => d.vai_tro === 'giao_nhan' || d.vai_tro === 'ca_hai')
                                      .map(d => <option key={d.id} value={d.ten}>{d.ten}</option>)}
                                    {fromSheet && !driverList.find(d=>d.ten.normalize('NFC').trim().toUpperCase()===fromSheet.normalize('NFC').trim().toUpperCase()) && (
                                      <option value={fromSheet}>{fromSheet}</option>
                                    )}
                                  </select>
                                );
                              })() : (
                                <span style={{ fontSize:12, color:'#374151' }}>{p.giao_nhan || <span style={{color:'#d1d5db'}}>—</span>}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {/* Footer summary */}
      {!loading && filtered.length > 0 && (
        <div style={{ marginTop:10, padding:'8px 14px', background:'#f9fafb', borderRadius:8, fontSize:11, color:'#6b7280', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
          <span>📋 <b>{filtered.length}</b> chuyến</span>
          {filtered.filter(p=>!p.ngay_can_giao).length > 0 && (
            <span style={{ color:'#b45309', fontWeight:700 }}>
              ⚠️ Chưa lịch: <b>{filtered.filter(p=>!p.ngay_can_giao).length}</b>
            </span>
          )}
          <span>⏳ Chờ: <b>{filtered.filter(p=>getTT(p)==='cho_giao').length}</b></span>
          <span>🚚 Đang: <b>{filtered.filter(p=>getTT(p)==='dang_giao').length}</b></span>
          <span>✅ Xong: <b>{filtered.filter(p=>getTT(p)==='da_giao').length}</b></span>
          {groupByArea && (
            <span>📍 {grouped.reduce((n, b) => n + Object.keys(b.subGroups).length, 0)} khu vực</span>
          )}
          <span style={{ marginLeft:'auto' }}>Dữ liệu realtime từ Google Sheets</span>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding:'6px 12px', border:'1px solid #d1d5db', borderRadius:6,
  background:'white', cursor:'pointer', fontSize:15,
};
