'use client';
import { useState, useEffect, useCallback } from 'react';

const today = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function LichSuDieuXe() {
  const [from,    setFrom]    = useState(firstOfMonth());
  const [to,      setTo]      = useState(today());
  const [laiXe,   setLaiXe]   = useState('');
  const [boPhan,  setBoPhan]  = useState('');
  const [q,       setQ]       = useState('');
  const [page,    setPage]    = useState(1);
  const LIMIT = 50;

  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [expanded, setExpanded] = useState(null); // row_key đang xem chi tiết

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, page: p, limit: LIMIT });
      if (laiXe)  params.set('lai_xe',  laiXe);
      if (boPhan) params.set('bo_phan', boPhan);
      if (q)      params.set('q',       q);
      const res  = await fetch(`/api/dispatch-history?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json.data || []);
      setTotal(json.total || 0);
      setPage(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, laiXe, boPhan, q]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const totalPages = Math.ceil(total / LIMIT);

  // Export CSV đơn giản
  const exportCSV = () => {
    const headers = ['Số phiếu','Bộ phận','Ngày giao','Chốt lúc','Lái xe','Phụ xe','Tên KH','Địa chỉ','Khu vực','Tổng thùng','Tổng kg','Ghi chú'];
    const rows = data.map(r => [
      r.row_key, r.bo_phan, fmtDate(r.ngay_giao), fmtDateTime(r.da_giao_at),
      r.lai_xe || '', r.giao_nhan || '', r.ten_kh || '', r.dia_chi_giao || '',
      r.khu_vuc || '', r.tong_thung || 0, r.tong_kg || 0, r.ghi_chu_giao || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `lich-su-dieu-xe_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>📋 Lịch sử điều xe</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
              Toàn bộ đơn hàng đã giao — snapshot tại thời điểm chốt chuyến
            </p>
          </div>
          <button onClick={exportCSV} disabled={!data.length}
            style={{ padding:'8px 16px', background:'#059669', color:'white', border:'none',
              borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600, opacity: data.length ? 1 : 0.4 }}>
            ⬇ Xuất CSV
          </button>
        </div>

        {/* Bộ lọc */}
        <div style={{ background:'white', borderRadius:10, padding:16, marginBottom:16,
          boxShadow:'0 1px 3px rgba(0,0,0,.08)', display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:4 }}>Từ ngày</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px', fontSize:13 }} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:4 }}>Đến ngày</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px', fontSize:13 }} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:4 }}>Lái xe</label>
            <input value={laiXe} onChange={e => setLaiXe(e.target.value)} placeholder="Tất cả"
              style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px', fontSize:13, width:130 }} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:4 }}>Bộ phận</label>
            <select value={boPhan} onChange={e => setBoPhan(e.target.value)}
              style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px', fontSize:13 }}>
              <option value="">Tất cả</option>
              <option value="MT">MT</option>
              <option value="B2B">B2B</option>
              <option value="GT">GT</option>
            </select>
          </div>
          <div style={{ flex:1, minWidth:180 }}>
            <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:4 }}>Tìm kiếm</label>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tên KH hoặc số phiếu..."
              style={{ border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px', fontSize:13, width:'100%', boxSizing:'border-box' }} />
          </div>
          <button onClick={() => fetchData(1)}
            style={{ padding:'7px 18px', background:'#2563eb', color:'white', border:'none',
              borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600 }}>
            Tìm
          </button>
        </div>

        {/* Kết quả */}
        <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 3px rgba(0,0,0,.08)', overflow:'hidden' }}>
          {/* Thống kê nhanh */}
          <div style={{ padding:'10px 16px', borderBottom:'1px solid #f1f5f9', fontSize:13, color:'#64748b', display:'flex', gap:24 }}>
            <span>Tổng: <b style={{color:'#1e293b'}}>{total}</b> đơn</span>
            {!loading && data.length > 0 && (
              <>
                <span>Tổng thùng: <b style={{color:'#1e293b'}}>{data.reduce((s,r) => s+(r.tong_thung||0), 0)}</b></span>
                <span>Tổng kg: <b style={{color:'#1e293b'}}>{data.reduce((s,r) => s+(r.tong_kg||0), 0).toFixed(1)}</b></span>
              </>
            )}
          </div>

          {loading && (
            <div style={{ padding:40, textAlign:'center', color:'#64748b' }}>Đang tải...</div>
          )}
          {error && (
            <div style={{ padding:20, color:'#dc2626', textAlign:'center' }}>Lỗi: {error}</div>
          )}
          {!loading && !error && data.length === 0 && (
            <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
              Chưa có dữ liệu trong khoảng thời gian này
            </div>
          )}

          {!loading && data.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                  {['Số phiếu','BP','Ngày giao','Chốt lúc','Lái xe','Phụ xe','Khách hàng','Địa chỉ','Thùng','Kg',''].map((h,i) => (
                    <th key={i} style={{ padding:'8px 10px', textAlign:'left', fontWeight:600, color:'#475569', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <>
                    <tr key={r.id}
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      style={{ borderBottom:'1px solid #f1f5f9', cursor:'pointer',
                        background: expanded === r.id ? '#eff6ff' : 'white',
                        transition:'background .15s' }}>
                      <td style={{ padding:'8px 10px', fontWeight:600, color:'#2563eb' }}>{r.row_key}</td>
                      <td style={{ padding:'8px 10px' }}>
                        <span style={{ padding:'2px 7px', borderRadius:12, fontSize:11, fontWeight:700,
                          background: r.bo_phan==='MT'?'#dbeafe':r.bo_phan==='B2B'?'#fef9c3':'#d1fae5',
                          color:      r.bo_phan==='MT'?'#1d4ed8':r.bo_phan==='B2B'?'#92400e':'#065f46' }}>
                          {r.bo_phan}
                        </span>
                      </td>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{fmtDate(r.ngay_giao)}</td>
                      <td style={{ padding:'8px 10px', whiteSpace:'nowrap', color:'#64748b' }}>{fmtDateTime(r.da_giao_at)}</td>
                      <td style={{ padding:'8px 10px' }}>{r.lai_xe || <span style={{color:'#cbd5e1'}}>—</span>}</td>
                      <td style={{ padding:'8px 10px' }}>{r.giao_nhan || <span style={{color:'#cbd5e1'}}>—</span>}</td>
                      <td style={{ padding:'8px 10px', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.ten_kh || '—'}</td>
                      <td style={{ padding:'8px 10px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#64748b' }}>{r.dia_chi_giao || '—'}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right' }}>{r.tong_thung || 0}</td>
                      <td style={{ padding:'8px 10px', textAlign:'right' }}>{r.tong_kg ? Number(r.tong_kg).toFixed(1) : 0}</td>
                      <td style={{ padding:'8px 10px', color:'#94a3b8', fontSize:11 }}>{expanded===r.id?'▲':'▼'}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={r.id + '_detail'}>
                        <td colSpan={11} style={{ padding:'0', background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                          <div style={{ padding:'14px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                            {/* Hàng hóa */}
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:6, textTransform:'uppercase' }}>Hàng hóa</div>
                              {(r.san_pham || []).length > 0
                                ? (r.san_pham || []).map((sp, i) => (
                                  <div key={i} style={{ fontSize:13, color:'#334155', marginBottom:3 }}>
                                    • {sp.ten_sp} ({sp.ma_sp}): <b>{sp.so_luong}</b>
                                    {sp.so_luong_thung !== sp.so_luong && sp.so_luong_thung
                                      ? <span style={{color:'#64748b'}}> → {sp.so_luong_thung} thùng</span> : ''}
                                  </div>
                                ))
                                : <span style={{color:'#94a3b8', fontSize:13}}>Không có</span>
                              }
                            </div>
                            {/* Ghi chú & metadata */}
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:6, textTransform:'uppercase' }}>Chi tiết</div>
                              {r.ghi_chu_giao && (
                                <div style={{ fontSize:13, color:'#dc2626', marginBottom:4 }}>⚠ {r.ghi_chu_giao}</div>
                              )}
                              <div style={{ fontSize:13, color:'#64748b' }}>Khu vực: {r.khu_vuc || '—'}</div>
                              <div style={{ fontSize:13, color:'#64748b' }}>Ngày lên đơn: {fmtDate(r.ngay_len_don)}</div>
                              {r.don_gap && <div style={{ fontSize:13, color:'#d97706', fontWeight:600 }}>🔴 Đơn gấp</div>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}

          {/* Phân trang */}
          {totalPages > 1 && (
            <div style={{ padding:'12px 16px', borderTop:'1px solid #f1f5f9', display:'flex', gap:8, justifyContent:'center', alignItems:'center' }}>
              <button onClick={() => fetchData(page-1)} disabled={page===1 || loading}
                style={{ padding:'5px 12px', border:'1px solid #e2e8f0', borderRadius:6, background:'white', cursor:'pointer', disabled:page===1 }}>
                ← Trước
              </button>
              <span style={{ fontSize:13, color:'#64748b' }}>Trang {page} / {totalPages}</span>
              <button onClick={() => fetchData(page+1)} disabled={page===totalPages || loading}
                style={{ padding:'5px 12px', border:'1px solid #e2e8f0', borderRadius:6, background:'white', cursor:'pointer' }}>
                Sau →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
