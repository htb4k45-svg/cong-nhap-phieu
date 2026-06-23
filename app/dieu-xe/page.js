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
  if (p.ghi_chu) {
    const m = p.ghi_chu.match(/Tổng:\s*(\d+)/);
    if (m) return parseInt(m[1]);
  }
  if (p.san_pham && p.san_pham.length) {
    return p.san_pham.reduce(function(acc, sp) { return acc + (sp.so_luong || 0); }, 0);
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
  const [searchQ, setSearchQ]         = useState('');
  const [groupByArea, setGroupByArea] = useState(true);
  const [lastFetch, setLastFetch]     = useState(null);
  const [huyenList, setHuyenList]     = useState([]);
  const [driverList, setDriverList]   = useState([]);
  const [assigningKey, setAssigningKey] = useState(null);
  const [toast, setToast]               = useState(null);

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
    <div>
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
              { label:'🚗 Lái xe', data: stats.byLaiXe, ac:'#1d4ed8', ab:'#eff6ff', bs:'#3b82f6', showLoad:true },
              { label:'📦 Phụ xe / Giao nhận', data: stats.byGiaoNhan, ac:'#b45309', ab:'#fffbeb', bs:'#f59e0b', showLoad:false },
            ].map(function(grp) {
              return (
                <div key={grp.label}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase' }}>{grp.label}</span>
                    {filterLaiXe && (
                      <button onClick={() => setFilterLaiXe(null)} style={{ fontSize:11, padding:'1px 8px', borderRadius:10, border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', cursor:'pointer' }}>✕ Bỏ lọc</button>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:6 }}>
                    {Object.entries(grp.data)
                      .filter(function(e) { return e[0] !== 'Chua phan cong'; })
                      .sort(function(a, b) { return b[1].total - a[1].total; })
                      .map(function(entry) {
                        const name = entry[0], d = entry[1];
                        const pct     = d.total ? Math.round(d.da / d.total * 100) : 0;
                        const selected = filterLaiXe === name;
                        const cap     = grp.showLoad ? ((driverCapacity[name] && driverCapacity[name].thung) || 0) : 0;
                        const loaded  = grp.showLoad ? (driverLoad[name] || 0) : 0;
                        const lPct    = cap > 0 ? Math.min(100, Math.round(loaded / cap * 100)) : 0;
                        const lColor  = lPct >= 100 ? '#dc2626' : lPct >= 85 ? '#f59e0b' : '#10b981';
                        return (
                          <div key={name}
                            onClick={() => setFilterLaiXe(selected ? null : name)}
                            style={{
                              background: selected ? grp.ab : '#f9fafb',
                              borderRadius:8, padding:'7px 10px', cursor:'pointer',
                              border: selected ? ('2px solid ' + grp.bs) : '1px solid #e5e7eb',
                              transition:'border-color .15s',
                            }}>
                            <div style={{ fontSize:12, fontWeight:700, marginBottom:4, color: selected ? grp.ac : '#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {selected ? '🔍 ' : ''}{name}
                            </div>
                            <div style={{ background:'#e5e7eb', borderRadius:99, height:4, overflow:'hidden', marginBottom:4 }}>
                              <div style={{ background: selected ? grp.bs : '#059669', width:(pct+'%'), height:'100%' }} />
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
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(function(p, i) {
                            const ttObj  = TRANG_THAI[getTT(p)] || TRANG_THAI.cho_giao;
                            const isBusy = updatingKey === p.row_key;
                            const kvInfo = groupByArea ? null : extractKhuVuc(p.dia_chi_giao, huyenMatcher);
                            const rowBg  = getTT(p)==='da_giao' ? '#f0fdf4' : !p.ngay_can_giao ? '#fffbeb' : 'white';
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
                                      {p.san_pham.slice(0,3).map(function(sp) {
                                        return <div key={sp.ma_sp} style={{ fontSize:11, color:'#374151', whiteSpace:'nowrap' }}><span style={{ color:'#6b7280' }}>{sp.ma_sp}:</span> <strong>{sp.so_luong}</strong></div>;
                                      })}
                                      {p.san_pham.length > 3 && <div style={{ fontSize:10, color:'#9ca3af' }}>+{p.san_pham.length - 3} sp nữa</div>}
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
    </div>
  );
}

const btnStyle = { padding:'6px 12px', border:'1px solid #d1d5db', borderRadius:6, background:'white', cursor:'pointer', fontSize:15 };
