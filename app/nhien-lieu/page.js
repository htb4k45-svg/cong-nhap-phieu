'use client';
import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normSo  = s => { if (!s) return ''; const n = parseInt(String(s), 10); return isNaN(n) ? String(s) : String(n); };
const normKy  = ky => ky ? ky.replace(/^\d+[\/]?/, '').trim().toUpperCase() : '';
const fmtNum  = n  => n != null ? Number(n).toLocaleString('vi-VN') : '';
const fmtDate = d  => { if (!d) return ''; try { return new Date(d).toLocaleDateString('vi-VN'); } catch { return String(d); } };

function excelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length === 4) return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`;
    return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
  }
  return null;
}

function normalizeBienSo(raw) {
  if (!raw) return raw;
  const s = String(raw).trim().toUpperCase();
  if (!/[-.]/.test(s) && /^[0-9]{2}[A-Z]{1,2}\d+$/.test(s)) {
    const m = s.match(/^(\d{2}[A-Z]{1,2})(\d+)$/);
    if (m) {
      const nums = m[2];
      if (nums.length === 5) return `${m[1]}-${nums.slice(0,2)}.${nums.slice(2)}`;
      if (nums.length === 6) return `${m[1]}-${nums.slice(0,3)}.${nums.slice(3)}`;
      return `${m[1]}-${nums}`;
    }
  }
  return s;
}

// ─── Excel parsers ────────────────────────────────────────────────────────────

function sheetToRows(sheet, XLSX) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

function findHeader(rows, minCols = 4) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i];
    if (r && r.filter(c => c != null && String(c).trim() !== '').length >= minCols) return i;
  }
  return 0;
}

function parsePvoilExcel(wb, XLSX) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(ws, XLSX);
  const hi = findHeader(rows);
  const hdr = (rows[hi] || []).map(c => c == null ? '' : String(c));

  const C = {
    ngay_gd:        hdr.findIndex(h => /ng[aà]y\s*g[dt]/i.test(h)),
    so_gd:          hdr.findIndex(h => /s[ốo]\s*g[dt]/i.test(h)),
    tai_khoan:      hdr.findIndex(h => /t[àa]i\s*kho[aả]n/i.test(h)),
    tai_xe:         hdr.findIndex(h => /t[àa]i\s*x[eế]/i.test(h) || /t[àa]i\s*x[eê]/i.test(h)),
    bien_so:        hdr.findIndex(h => /bi[eê]n/i.test(h)),
    don_vi_kd:      hdr.findIndex(h => /[đd]v\s*k[đd]/i.test(h) || /[đd]v\s*kinh/i.test(h)),
    chxd:           hdr.findIndex(h => /chxd/i.test(h) || /tr[aạ]m/i.test(h)),
    mat_hang:       hdr.findIndex(h => /m[aặ]t\s*h[àa]ng/i.test(h)),
    so_luong:       hdr.findIndex(h => /s[ốo]\s*l[uư][oơ]ng/i.test(h)),
    tong_dt:        hdr.findIndex(h => /t[oổ]ng\s*dt/i.test(h) || /t[oổ]ng\s*doanh/i.test(h)),
    tien_hang:      hdr.findIndex(h => /ti[eề]n\s*h[àa]ng/i.test(h)),
    ky_hieu:        hdr.findIndex(h => /k[yý]\s*hi[eệ]u/i.test(h)),
    so_hd:          hdr.findIndex(h => /s[ốo]\s*h[đd]/i.test(h)),
    ngay_hd:        hdr.findIndex(h => /ng[àa]y\s*h[đd]/i.test(h)),
    dvbh:           hdr.findIndex(h => /t[eê]n.*[đd]v.*b[aá]n/i.test(h) || /[đd]v.*b[aá]n/i.test(h)),
    mst:            hdr.findIndex(h => /m[aã][\s]*s[ốo]/i.test(h) || /\bmst\b/i.test(h)),
    khu_vuc:        hdr.findIndex(h => /khu\s*v[uư]c/i.test(h)),
    trang_thai:     hdr.findIndex(h => /tr[aạ]ng\s*th[aá]i/i.test(h)),
  };

  // Fallback: nếu không tìm đc tong_dt thì dùng cột có "tổng" cuối cùng
  if (C.tong_dt < 0) C.tong_dt = hdr.reduce((acc, h, i) => /t[oổ]ng/i.test(h) ? i : acc, -1);

  const result = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const bsRaw = r[C.bien_so] != null ? String(r[C.bien_so]).trim() : '';
    if (!bsRaw) continue;
    const kyHieu = r[C.ky_hieu] != null ? String(r[C.ky_hieu]).trim() : null;
    const soHD   = r[C.so_hd]   != null ? String(r[C.so_hd]).trim()   : null;
    if (!kyHieu && !soHD) continue;

    result.push({
      bien_so:     normalizeBienSo(bsRaw),
      bien_so_raw: bsRaw,
      ten_tai_xe:  r[C.tai_xe]   != null ? String(r[C.tai_xe]).trim()   : null,
      ngay_gd:     excelDate(r[C.ngay_gd]),
      so_gd:       r[C.so_gd]    != null ? String(r[C.so_gd]).trim()    : null,
      tai_khoan:   r[C.tai_khoan]!= null ? String(r[C.tai_khoan]).trim(): null,
      don_vi_kd:   r[C.don_vi_kd]!= null ? String(r[C.don_vi_kd]).trim(): null,
      chxd:        r[C.chxd]     != null ? String(r[C.chxd]).trim()     : null,
      mat_hang:    r[C.mat_hang] != null ? String(r[C.mat_hang]).trim() : null,
      so_luong:    r[C.so_luong] != null ? Number(r[C.so_luong])        : null,
      tien_hang:   r[C.tien_hang]!= null ? Number(r[C.tien_hang])       : null,
      tong_dt:     r[C.tong_dt]  != null ? Number(r[C.tong_dt])         : null,
      ky_hieu_hd:  kyHieu ? normKy(kyHieu) : null,
      so_hd:       soHD,
      ngay_hd:     excelDate(r[C.ngay_hd]),
      ten_dv_ban:  r[C.dvbh]     != null ? String(r[C.dvbh]).trim()     : null,
      mst_dv_ban:  r[C.mst]      != null ? String(r[C.mst]).trim()      : null,
      khu_vuc:     r[C.khu_vuc]  != null ? String(r[C.khu_vuc]).trim()  : null,
      trang_thai:  r[C.trang_thai]!=null  ? String(r[C.trang_thai]).trim():null,
    });
  }
  return result;
}

function parseDinhMucExcel(wb, XLSX) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(ws, XLSX);
  const hi = findHeader(rows, 2);
  const hdr = (rows[hi] || []).map(c => c == null ? '' : String(c));

  const C = {
    bien_so:     hdr.findIndex(h => /bi[eê]n/i.test(h)),
    tai_trong:   hdr.findIndex(h => /t[aả]i\s*tr[oọ]ng/i.test(h)),
    km_dau:      hdr.findIndex(h => /km.*[đd][aầ]u/i.test(h) || /[đd][aầ]u.*km/i.test(h)),
    km_cuoi:     hdr.findIndex(h => /km.*cu[oố]i/i.test(h) || /cu[oố]i.*km/i.test(h)),
    dinh_muc:    hdr.findIndex(h => /[đd][iị]nh.*m[uứ]c/i.test(h) || /m[uứ]c.*l[ítí]/i.test(h) || /l[ítí].*100/i.test(h)),
    ton_dau:     hdr.findIndex(h => /t[oồ]n.*[đd][aầ]u/i.test(h)),
    ton_cuoi:    hdr.findIndex(h => /t[oồ]n.*cu[oố]i/i.test(h)),
  };

  const result = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const bsRaw = r[C.bien_so] != null ? String(r[C.bien_so]).trim() : '';
    if (!bsRaw || !/\d/.test(bsRaw)) continue;
    result.push({
      bien_so:          normalizeBienSo(bsRaw),
      tai_trong:        r[C.tai_trong] != null ? String(r[C.tai_trong]).trim() : null,
      km_dau:           r[C.km_dau]    != null ? Number(r[C.km_dau])           : null,
      km_cuoi:          r[C.km_cuoi]   != null ? Number(r[C.km_cuoi])          : null,
      dinh_muc_l_100km: r[C.dinh_muc]  != null ? Number(r[C.dinh_muc])         : null,
      ton_dau_lit:      r[C.ton_dau]   != null ? Number(r[C.ton_dau])          : null,
      ton_cuoi_lit:     r[C.ton_cuoi]  != null ? Number(r[C.ton_cuoi])         : null,
    });
  }
  return result;
}

function parseChiPhiExcel(wb, XLSX) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(ws, XLSX);
  const hi = findHeader(rows, 2);
  const hdr = (rows[hi] || []).map(c => c == null ? '' : String(c));

  const C = {
    bien_so: hdr.findIndex(h => /bi[eê]n/i.test(h)),
    loai_cp: hdr.findIndex(h => /lo[aạ]i/i.test(h) || /chi\s*ph[iíì]/i.test(h) || /n[oộ]i\s*dung/i.test(h)),
    so_tien: hdr.findIndex(h => /s[ốo]\s*ti[eề]n/i.test(h) || /gi[aá]\s*tr[iị]/i.test(h) || /ti[eề]n/i.test(h)),
    ghi_chu: hdr.findIndex(h => /ghi\s*ch[uú]/i.test(h)),
  };

  const result = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const st = r[C.so_tien];
    if (st == null || st === '') continue;
    const bsRaw = r[C.bien_so] != null ? String(r[C.bien_so]).trim() : '';
    result.push({
      bien_so: bsRaw ? normalizeBienSo(bsRaw) : null,
      loai_cp: r[C.loai_cp] != null ? String(r[C.loai_cp]).trim() : null,
      so_tien: Number(st),
      ghi_chu: r[C.ghi_chu] != null ? String(r[C.ghi_chu]).trim() : null,
    });
  }
  return result;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const tdS = { padding: '6px 10px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' };
const thS = { padding: '8px 10px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };

function openPdf(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── FileInput ────────────────────────────────────────────────────────────────
const FileInput = forwardRef(function FileInput({ label, accept, hint, required }, ref) {
  const [name, setName] = useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 14, fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      <input type="file" accept={accept} ref={ref}
        onChange={e => setName(e.target.files[0]?.name || null)}
        style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
      />
      <span style={{ fontSize: 12, color: name ? '#16a34a' : '#9ca3af' }}>
        {name ? `✓ ${name}` : hint}
      </span>
    </div>
  );
});

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: color ?? '#111' }}>{value}</div>
    </div>
  );
}

// ─── DanhSachTab ─────────────────────────────────────────────────────────────
function DanhSachTab({ invoices, pdfMap }) {
  const [filterXe, setFilterXe] = useState('');
  const byXe = invoices.reduce((acc, inv) => {
    const bs = inv.bien_so || '(không rõ)';
    if (!acc[bs]) acc[bs] = [];
    acc[bs].push(inv);
    return acc;
  }, {});
  const xeList = Object.keys(byXe).sort();
  const filtered = filterXe ? xeList.filter(x => x.includes(filterXe.toUpperCase())) : xeList;

  if (!invoices.length) return <p style={{ color: '#9ca3af', marginTop: 40, textAlign: 'center' }}>Chưa có dữ liệu. Upload file ở tab đầu tiên.</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <input placeholder="Lọc biển số..." value={filterXe} onChange={e => setFilterXe(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: 180 }} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>{xeList.length} xe · {invoices.length} hóa đơn</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filtered.map(bs => {
          const rows = byXe[bs];
          const totalLit  = rows.reduce((s, r) => s + (r.so_luong || 0), 0);
          const totalTien = rows.reduce((s, r) => s + (r.tong_dt || r.tien_hang || 0), 0);
          const coPDF = rows.filter(r => r.co_pdf || pdfMap[normKy(r.ky_hieu_hd||'')+`|`+normSo(r.so_hd)]).length;
          return (
            <div key={bs} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f8fafc', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>🚗 {bs}</span>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555' }}>
                  <span>{rows.length} HĐ</span>
                  <span>⛽ {totalLit.toFixed(2)} lít</span>
                  <span>💰 {fmtNum(Math.round(totalTien))} đ</span>
                  <span style={{ color: coPDF === rows.length ? '#16a34a' : '#dc2626' }}>PDF: {coPDF}/{rows.length}</span>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      {['Ngày GD','Tài xế','Mặt hàng','Số lít','Tổng tiền','Ký hiệu HĐ','Số HĐ','Ngày HĐ','PDF'].map(h =>
                        <th key={h} style={thS}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const key = normKy(r.ky_hieu_hd||'')+`|`+normSo(r.so_hd);
                      const pdf = pdfMap[key];
                      return (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#fafafa' }}>
                          <td style={tdS}>{fmtDate(r.ngay_gd)}</td>
                          <td style={tdS}>{r.ten_tai_xe}</td>
                          <td style={tdS}>{r.mat_hang}</td>
                          <td style={{ ...tdS, textAlign: 'right' }}>{r.so_luong?.toFixed(2)}</td>
                          <td style={{ ...tdS, textAlign: 'right' }}>{fmtNum(Math.round(r.tong_dt||r.tien_hang||0))}</td>
                          <td style={tdS}>{r.ky_hieu_hd}</td>
                          <td style={tdS}>{r.so_hd}</td>
                          <td style={tdS}>{fmtDate(r.ngay_hd)}</td>
                          <td style={tdS}>
                            {pdf ? (
                              <button onClick={() => openPdf(pdf.pdfBase64)}
                                style={{ background:'none',border:'none',cursor:'pointer',color:'#2563eb',fontSize:18 }}>📄</button>
                            ) : r.co_pdf ? (
                              <span style={{ fontSize:11,color:'#9ca3af' }}>Có (reload)</span>
                            ) : (
                              <span style={{ fontSize:11,color:'#dc2626' }}>Thiếu</span>
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
    </div>
  );
}

// ─── DoiChieuTab ─────────────────────────────────────────────────────────────
function DoiChieuTab({ invoices }) {
  const [filter, setFilter] = useState('all');
  if (!invoices.length) return <p style={{ color:'#9ca3af',marginTop:40,textAlign:'center' }}>Chưa có dữ liệu.</p>;

  const counts = {
    all:    invoices.length,
    khop:   invoices.filter(i => i.co_pdf && !i.lenh_canh_bao).length,
    lech:   invoices.filter(i => i.co_pdf && i.lenh_canh_bao && i.lenh_canh_bao !== 'Không tìm thấy PDF').length,
    thieu:  invoices.filter(i => !i.co_pdf).length,
  };
  const rows = invoices.filter(inv => {
    if (filter === 'khop')  return inv.co_pdf && !inv.lenh_canh_bao;
    if (filter === 'lech')  return inv.co_pdf && inv.lenh_canh_bao && inv.lenh_canh_bao !== 'Không tìm thấy PDF';
    if (filter === 'thieu') return !inv.co_pdf;
    return true;
  });

  return (
    <div>
      <div style={{ display:'flex',gap:8,marginBottom:16,flexWrap:'wrap' }}>
        {[
          { id:'all',   label:`Tất cả (${counts.all})`,                  c:'#374151' },
          { id:'khop',  label:`✅ Khớp (${counts.khop})`,                 c:'#16a34a' },
          { id:'lech',  label:`⚠️ Lệch thông tin (${counts.lech})`,       c:'#d97706' },
          { id:'thieu', label:`❌ Thiếu PDF (${counts.thieu})`,            c:'#dc2626' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ padding:'6px 14px',borderRadius:20,border:'1px solid',cursor:'pointer',fontSize:13,fontWeight:filter===f.id?600:400,
              background:filter===f.id?f.c:'#fff',color:filter===f.id?'#fff':f.c,borderColor:f.c }}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f1f5f9' }}>
              {['Biển số','Ký hiệu','Số HĐ','Ngày HĐ','DVbh Excel','MST Excel','DVbh PDF','MST PDF','Trạng thái'].map(h =>
                <th key={h} style={thS}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = !r.co_pdf ? 'thieu'
                : (r.lenh_canh_bao && r.lenh_canh_bao !== 'Không tìm thấy PDF') ? 'lech' : 'khop';
              const rowBg = st==='thieu'?'#fef2f2':st==='lech'?'#fffbeb':'#f0fdf4';
              const mstLech = r.pdf_mst && r.mst_dv_ban &&
                r.pdf_mst.replace(/\D/g,'') !== r.mst_dv_ban.replace(/\D/g,'');
              return (
                <tr key={i} style={{ background:i%2===0?rowBg:'#fff' }}>
                  <td style={tdS}>{r.bien_so}</td>
                  <td style={tdS}>{r.ky_hieu_hd}</td>
                  <td style={tdS}>{r.so_hd}</td>
                  <td style={tdS}>{fmtDate(r.ngay_hd)}</td>
                  <td style={{ ...tdS,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis' }}>{r.ten_dv_ban}</td>
                  <td style={tdS}>{r.mst_dv_ban}</td>
                  <td style={{ ...tdS,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis' }}>{r.pdf_dvbh}</td>
                  <td style={{ ...tdS,color:mstLech?'#dc2626':undefined }}>{r.pdf_mst}</td>
                  <td style={tdS}>
                    {st==='khop'  && <span style={{ color:'#16a34a',fontWeight:500 }}>✅ Khớp</span>}
                    {st==='lech'  && <span style={{ color:'#d97706',fontWeight:500,fontSize:12 }}>⚠️ {r.lenh_canh_bao}</span>}
                    {st==='thieu' && <span style={{ color:'#dc2626',fontWeight:500 }}>❌ Thiếu PDF</span>}
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

// ─── DinhMucTab ───────────────────────────────────────────────────────────────
function DinhMucTab({ quotas, litByXe }) {
  if (!quotas.length) return <p style={{ color:'#9ca3af',marginTop:40,textAlign:'center' }}>Chưa có dữ liệu định mức.</p>;

  const rows = quotas.map(q => {
    const km = (q.km_cuoi ?? 0) - (q.km_dau ?? 0);
    const dm = q.dinh_muc_l_100km && km > 0 ? km * q.dinh_muc_l_100km / 100 : null;
    const mua = litByXe[q.bien_so] || 0;
    const tieuThu = (q.ton_dau_lit||0) + mua - (q.ton_cuoi_lit||0);
    return { ...q, km_di: km, dm_lit: dm, thuc_mua: mua, tieu_thu: tieuThu, chenh: dm != null ? tieuThu - dm : null };
  }).sort((a, b) => (b.chenh ?? -999) - (a.chenh ?? -999));

  const xeKhongDM = Object.keys(litByXe).filter(bs => !quotas.find(q => q.bien_so === bs));
  const overCount = rows.filter(r => (r.chenh??0) > 0).length;
  const totalMua  = Object.values(litByXe).reduce((a,b)=>a+b,0);

  return (
    <div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20 }}>
        <StatCard label="Tổng xe có định mức" value={quotas.length} />
        <StatCard label="Xe quá định mức" value={overCount} color="#dc2626" />
        <StatCard label="Tổng lít đã mua" value={totalMua.toFixed(1)+' lít'} />
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f1f5f9' }}>
              {['Biển số','Km đầu','Km cuối','Km đi','lít/100km','Định mức (lít)','Tồn đầu','Tồn cuối','Đã mua','Tiêu thụ','Chênh lệch'].map(h =>
                <th key={h} style={thS}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => {
              const qua = (r.chenh??0) > 0;
              return (
                <tr key={i} style={{ background:qua?'#fef2f2':i%2===0?'#fff':'#fafafa' }}>
                  <td style={{ ...tdS,fontWeight:600 }}>{r.bien_so}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{fmtNum(r.km_dau)}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{fmtNum(r.km_cuoi)}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{fmtNum(r.km_di)}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{r.dinh_muc_l_100km}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{r.dm_lit?.toFixed(2) ?? '—'}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{r.ton_dau_lit?.toFixed(2)}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{r.ton_cuoi_lit?.toFixed(2)}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{r.thuc_mua.toFixed(2)}</td>
                  <td style={{ ...tdS,textAlign:'right' }}>{r.tieu_thu.toFixed(2)}</td>
                  <td style={{ ...tdS,textAlign:'right',fontWeight:600,color:qua?'#dc2626':'#16a34a' }}>
                    {r.chenh!=null ? (qua?'+':'')+r.chenh.toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {xeKhongDM.length > 0 && (
        <div style={{ marginTop:16,padding:'12px 16px',background:'#fef3c7',borderRadius:8,fontSize:13 }}>
          ⚠️ Có hóa đơn nhưng không có định mức: <strong>{xeKhongDM.join(', ')}</strong>
        </div>
      )}
    </div>
  );
}

// ─── InTab ────────────────────────────────────────────────────────────────────
function InTab({ invoices, pdfMap }) {
  const [selXe, setSelXe]     = useState('');
  const [merging, setMerging] = useState(false);
  const [status, setStatus]   = useState('');

  const byXe = invoices.reduce((acc, inv) => {
    const bs = inv.bien_so || '(không rõ)';
    if (!acc[bs]) acc[bs] = [];
    acc[bs].push(inv);
    return acc;
  }, {});
  const xeList = Object.keys(byXe).sort();
  const rows = selXe ? (byXe[selXe] || []) : [];
  const hasPdf = rows.filter(r => pdfMap[normKy(r.ky_hieu_hd||'')+`|`+normSo(r.so_hd)]);

  async function handleMerge() {
    setMerging(true);
    setStatus('Đang tải pdf-lib...');
    try {
      const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js');
      const merged = await PDFDocument.create();
      let count = 0;
      for (const r of rows) {
        const key = normKy(r.ky_hieu_hd||'')+`|`+normSo(r.so_hd);
        const pdf = pdfMap[key];
        if (!pdf?.pdfBase64) continue;
        try {
          const bytes = Uint8Array.from(atob(pdf.pdfBase64), c => c.charCodeAt(0));
          const doc   = await PDFDocument.load(bytes, { ignoreEncryption:true });
          const pages = await merged.copyPages(doc, doc.getPageIndices());
          pages.forEach(p => merged.addPage(p));
          count++;
        } catch (e) { console.warn('skip PDF:', e.message); }
      }
      setStatus(`Đã gộp ${count} PDF...`);
      const bytes = await merged.save();
      const url   = URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const a = document.createElement('a');
      a.href = url;
      a.download = `HoaDon_${selXe.replace(/[^a-zA-Z0-9]/g,'-')}.pdf`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      setStatus(`✅ Đã tạo file PDF với ${count} hóa đơn`);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    } finally { setMerging(false); }
  }

  return (
    <div>
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap' }}>
        <label style={{ fontSize:14,fontWeight:500 }}>Chọn xe:</label>
        <select value={selXe} onChange={e => setSelXe(e.target.value)}
          style={{ border:'1px solid #d1d5db',borderRadius:6,padding:'6px 10px',fontSize:14,minWidth:200 }}>
          <option value="">-- Chọn biển số --</option>
          {xeList.map(bs => <option key={bs} value={bs}>{bs} ({byXe[bs].length} HĐ)</option>)}
        </select>
        {selXe && (
          <button onClick={handleMerge} disabled={merging || hasPdf.length===0}
            style={{ padding:'8px 20px',background:merging?'#9ca3af':'#2563eb',color:'#fff',
              border:'none',borderRadius:6,cursor:'pointer',fontSize:14,fontWeight:600 }}>
            {merging ? '⏳ Đang gộp...' : `🖨️ Gộp & tải PDF (${hasPdf.length} file)`}
          </button>
        )}
        {status && <span style={{ fontSize:13,color:'#555' }}>{status}</span>}
      </div>

      {selXe && rows.length > 0 && (
        <div>
          <p style={{ fontSize:13,color:'#6b7280',marginBottom:12 }}>
            {hasPdf.length}/{rows.length} hóa đơn có PDF trong phiên này
            {hasPdf.length < rows.length && <span style={{ color:'#d97706' }}> — upload lại archive để đủ PDF</span>}
          </p>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f1f5f9' }}>
                {['Ngày GD','Ký hiệu','Số HĐ','Số lít','PDF'].map(h=><th key={h} style={thS}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i) => {
                const key = normKy(r.ky_hieu_hd||'')+`|`+normSo(r.so_hd);
                const pdf = pdfMap[key];
                return (
                  <tr key={i} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                    <td style={tdS}>{fmtDate(r.ngay_gd)}</td>
                    <td style={tdS}>{r.ky_hieu_hd}</td>
                    <td style={tdS}>{r.so_hd}</td>
                    <td style={{ ...tdS,textAlign:'right' }}>{r.so_luong?.toFixed(2)}</td>
                    <td style={tdS}>
                      {pdf
                        ? <button onClick={()=>openPdf(pdf.pdfBase64)}
                            style={{ background:'none',border:'none',cursor:'pointer',color:'#2563eb',fontSize:20 }}>📄</button>
                        : <span style={{ fontSize:11,color:'#9ca3af' }}>—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NhienLieuPage() {
  const [thang, setThang]       = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  });
  const [tab, setTab]           = useState('upload');
  const [logs, setLogs]         = useState([]);
  const [processing, setProc]   = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [quotas, setQuotas]     = useState([]);
  const [chiPhi, setChiPhi]     = useState([]);
  const [pdfMap, setPdfMap]     = useState({});

  const refArchive = useRef(null);
  const refDinhMuc = useRef(null);
  const refChiPhi  = useRef(null);
  const refPvoil   = useRef(null);

  const log = useCallback(msg => setLogs(p => [...p, msg]), []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/nhien-lieu/bao-cao?thang=${thang}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.invoices?.length) {
          setInvoices(data.invoices);
          setQuotas(data.quotas || []);
          setChiPhi(data.chiPhi || []);
          setTab('danh-sach');
        } else {
          setInvoices([]); setQuotas([]); setChiPhi([]);
          setTab('upload');
        }
      } catch (_) {}
    }
    load();
  }, [thang]);

  async function handleProcess() {
    setProc(true);
    setLogs([]);
    const newPdfMap = {};
    try {
      const _xlsxMod = await import('xlsx');
      const XLSX = _xlsxMod.default ?? _xlsxMod;

      // 1. PVoil Excel
      if (!refPvoil.current?.files[0]) throw new Error('Chưa chọn file Danh sách hóa đơn (PVoil) *');
      const pvoilWb = XLSX.read(new Uint8Array(await refPvoil.current.files[0].arrayBuffer()));
      const invoiceList = parsePvoilExcel(pvoilWb, XLSX);
      log(`✅ Danh sách HĐ PVoil: ${invoiceList.length} dòng`);

      // 2. Định mức
      let quotaList = [];
      if (refDinhMuc.current?.files[0]) {
        const dmWb = XLSX.read(new Uint8Array(await refDinhMuc.current.files[0].arrayBuffer()));
        quotaList = parseDinhMucExcel(dmWb, XLSX);
        log(`✅ Định mức: ${quotaList.length} xe`);
      }

      // 3. Chi phí
      let cpList = [];
      if (refChiPhi.current?.files[0]) {
        const cpWb = XLSX.read(new Uint8Array(await refChiPhi.current.files[0].arrayBuffer()));
        cpList = parseChiPhiExcel(cpWb, XLSX);
        log(`✅ Chi phí phát sinh: ${cpList.length} khoản`);
      }

      // 4. Archive → PDF stream
      if (refArchive.current?.files[0]) {
        const archFile = refArchive.current.files[0];
        log(`📦 Tải archive (${(archFile.size/1024/1024).toFixed(1)} MB)...`);
        const fd = new FormData();
        fd.append('archive', new Blob([await archFile.arrayBuffer()]), archFile.name);
        const res = await fetch('/api/nhien-lieu/unrar', { method:'POST', body:fd });
        if (!res.ok) throw new Error('Lỗi API giải nén');

        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let partial  = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          partial += dec.decode(value, { stream:true });
          const lines = partial.split('\n');
          partial = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.progress) { log(`⏳ ${obj.progress}`); continue; }
              if (obj.error)    { log(`⚠️ ${obj.error}`);   continue; }
              if (obj.done)     {
                const matched   = Object.keys(newPdfMap).filter(k => !k.startsWith('__')).length;
                const unmatched = Object.keys(newPdfMap).filter(k => k.startsWith('__')).length;
                log(`✅ Giải nén xong: ${obj.total} file PDF | nhận dạng được ${matched} | không đọc được ${unmatched}`);
                continue;
              }
              if (obj.pdfBase64) {
                if (obj.ky_hieu_hd && obj.so_hd) {
                  // PDF nhận dạng được → dùng ký hiệu|số làm key để đối chiếu Excel
                  const key = normKy(obj.ky_hieu_hd)+'|'+normSo(obj.so_hd);
                  newPdfMap[key] = { dvbh:obj.dvbh, mst:obj.mst, pdfBase64:obj.pdfBase64, name:obj.name };
                } else {
                  // PDF không đọc được ký hiệu/số → lưu theo tên file
                  newPdfMap['__unmatched__|'+obj.name] = { pdfBase64:obj.pdfBase64, name:obj.name };
                }
              }
            } catch (_) {}
          }
        }
        const matchedCnt   = Object.keys(newPdfMap).filter(k => !k.startsWith('__')).length;
        const unmatchedCnt = Object.keys(newPdfMap).filter(k => k.startsWith('__')).length;
        log(`📄 Tổng: ${matchedCnt + unmatchedCnt} PDF | đối chiếu được: ${matchedCnt} | không đọc được: ${unmatchedCnt}`);
        setPdfMap(newPdfMap);
      } else {
        log('ℹ️ Không có file nén — bỏ qua bước đọc PDF');
      }

      // 5. Merge PDF data vào danh sách Excel
      const merged = invoiceList.map(inv => {
        const key = normKy(inv.ky_hieu_hd||'')+`|`+normSo(inv.so_hd);
        const pdf = newPdfMap[key];
        let canh_bao = null;
        if (!pdf) {
          canh_bao = 'Không tìm thấy PDF';
        } else {
          const warns = [];
          const exMST = (inv.mst_dv_ban||'').replace(/\D/g,'');
          const pdMST = (pdf.mst||'').replace(/\D/g,'');
          if (exMST && pdMST && exMST !== pdMST)
            warns.push(`MST lệch (PDF: ${pdf.mst}, Excel: ${inv.mst_dv_ban})`);
          if (warns.length) canh_bao = warns.join('; ');
        }
        return { ...inv, co_pdf:!!pdf, pdf_dvbh:pdf?.dvbh??null, pdf_mst:pdf?.mst??null, lenh_canh_bao:canh_bao };
      });

      const coPDF  = merged.filter(m=>m.co_pdf).length;
      const lech   = merged.filter(m=>m.lenh_canh_bao&&m.lenh_canh_bao!=='Không tìm thấy PDF').length;
      log(`🔗 Đối chiếu: ${coPDF}/${merged.length} có PDF | ${merged.length-coPDF} thiếu PDF | ${lech} lệch thông tin`);

      // 6. Lưu Supabase
      log('💾 Đang lưu vào Supabase...');
      const upRes = await fetch('/api/nhien-lieu/upload', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ thang, invoices:merged, quotas:quotaList, chiPhi:cpList }),
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error||'Lỗi lưu Supabase');
      log(`✅ Đã lưu: ${upData.saved.invoices} HĐ · ${upData.saved.quotas} xe · ${upData.saved.chiPhi} chi phí`);

      setInvoices(merged);
      setQuotas(quotaList);
      setChiPhi(cpList);
      setTab('danh-sach');

    } catch (err) {
      log(`❌ Lỗi: ${err.message}`);
    } finally {
      setProc(false);
    }
  }

  const litByXe = invoices.reduce((acc, inv) => {
    if (inv.bien_so && inv.so_luong) acc[inv.bien_so] = (acc[inv.bien_so]||0) + inv.so_luong;
    return acc;
  }, {});

  const TABS = [
    { id:'upload',    label:'📤 Upload' },
    { id:'danh-sach', label:'📋 Danh sách HĐ' },
    { id:'doi-chieu', label:'🔍 Đối chiếu' },
    { id:'dinh-muc',  label:'⛽ Định mức' },
    { id:'in',        label:'🖨️ In HĐ' },
  ];

  return (
    <div style={{ fontFamily:'system-ui,sans-serif',maxWidth:1280,margin:'0 auto',padding:16 }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:16,marginBottom:20,flexWrap:'wrap' }}>
        <h1 style={{ margin:0,fontSize:22,fontWeight:600 }}>Quản lý nhiên liệu</h1>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <label style={{ fontSize:13,color:'#666' }}>Tháng:</label>
          <input type="month" value={thang} onChange={e => setThang(e.target.value)}
            style={{ border:'1px solid #ccc',borderRadius:6,padding:'4px 8px',fontSize:14 }} />
        </div>
        {invoices.length > 0 && (
          <span style={{ fontSize:13,color:'#555',background:'#f0f0f0',padding:'4px 10px',borderRadius:12 }}>
            {invoices.length} hóa đơn · {Object.keys(litByXe).length} xe
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex',gap:4,borderBottom:'2px solid #e5e7eb',marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'8px 16px',border:'none',background:'none',cursor:'pointer',fontSize:14,
              fontWeight:tab===t.id?600:400,color:tab===t.id?'#2563eb':'#555',
              borderBottom:tab===t.id?'2px solid #2563eb':'2px solid transparent',marginBottom:-2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload tab */}
      {tab === 'upload' && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
          <div>
            <h2 style={{ fontSize:16,fontWeight:600,marginBottom:16 }}>Chọn file upload</h2>
            <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
              <FileInput label="📦 File nén (ZIP / RAR)" accept=".zip,.rar,.7z" ref={refArchive}
                hint="Chứa tất cả hóa đơn PDF (có thể nhiều cấp nén)" />
              <FileInput label="📊 Danh sách hóa đơn PVoil" accept=".xlsx,.xls" ref={refPvoil}
                hint="File Excel do PVoil gửi — biển số, ký hiệu, số HĐ" required />
              <FileInput label="📏 Định mức xăng dầu" accept=".xlsx,.xls" ref={refDinhMuc}
                hint="Km đầu/cuối, định mức lít/100km, tồn đầu/cuối" />
              <FileInput label="💰 Chi phí phát sinh" accept=".xlsx,.xls" ref={refChiPhi}
                hint="Chi phí phát sinh theo biển số xe" />
            </div>
            <button onClick={handleProcess} disabled={processing}
              style={{ marginTop:20,width:'100%',padding:'12px 0',
                background:processing?'#9ca3af':'#2563eb',color:'#fff',
                border:'none',borderRadius:8,fontSize:15,fontWeight:600,
                cursor:processing?'not-allowed':'pointer' }}>
              {processing ? '⏳ Đang xử lý...' : '🚀 Xử lý dữ liệu'}
            </button>
          </div>
          <div>
            <h2 style={{ fontSize:16,fontWeight:600,marginBottom:16 }}>Tiến trình</h2>
            <div style={{ background:'#0f172a',color:'#e2e8f0',borderRadius:8,padding:'12px 16px',
              minHeight:300,fontFamily:'monospace',fontSize:13,overflowY:'auto',maxHeight:500 }}>
              {logs.length === 0
                ? <span style={{ color:'#64748b' }}>Chọn file và nhấn "Xử lý dữ liệu"...</span>
                : logs.map((l,i) => <div key={i} style={{ marginBottom:4 }}>{l}</div>)}
            </div>
          </div>
        </div>
      )}

      {tab === 'danh-sach' && <DanhSachTab invoices={invoices} pdfMap={pdfMap} />}
      {tab === 'doi-chieu' && <DoiChieuTab invoices={invoices} />}
      {tab === 'dinh-muc'  && <DinhMucTab  quotas={quotas} litByXe={litByXe} />}
      {tab === 'in'        && <InTab        invoices={invoices} pdfMap={pdfMap} />}
    </div>
  );
}
