'use client';
import { useState, useEffect, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function mapTT(tt) {
  return { pending: 'Chờ giao', in_transit: 'Đang giao', done: 'Hoàn thành', failed: 'Thất bại', cancelled: 'Hủy' }[tt] || tt || 'Chờ giao';
}

// ── Components ────────────────────────────────────────────────────────────────

function Card({ label, value, sub, color = '#1d4ed8', bg = '#eff6ff' }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 10, padding: '14px 18px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Th({ children, onClick, sorted, dir, style }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: '8px 10px', background: '#1d4ed8', color: '#fff',
        fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        borderRight: '1px solid #2563eb', ...style,
      }}
    >
      {children}{sorted ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

function Td({ children, style }) {
  return (
    <td style={{ padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f3f4f6', ...style }}>
      {children}
    </td>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaoCaoPage() {
  const [from, setFrom]       = useState(firstOfMonth());
  const [to, setTo]           = useState(today());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState('driver');   // 'driver' | 'tonDong' | 'chitiet'
  const [sort, setSort]       = useState({ key: 'so_don', dir: 'desc' });
  const [filterBp, setFilterBp]     = useState('');
  const [filterLaiXe, setFilterLaiXe] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bao-cao?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleExport() {
    setExportLoading(true);
    try {
      const url = `/api/bao-cao/export?from=${from}&to=${to}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export thất bại');
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `BaoCao_DieuXe_${from}${from !== to ? '_den_' + to : ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert('Lỗi xuất Excel: ' + e.message);
    } finally {
      setExportLoading(false);
    }
  }

  // Quick range buttons
  function setRange(preset) {
    const d = new Date();
    if (preset === 'today') {
      setFrom(today()); setTo(today());
    } else if (preset === 'week') {
      const mon = new Date(d);
      mon.setDate(d.getDate() - d.getDay() + 1);
      setFrom(mon.toISOString().slice(0, 10)); setTo(today());
    } else if (preset === 'month') {
      setFrom(firstOfMonth()); setTo(today());
    } else if (preset === 'lastmonth') {
      const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
      const m = d.getMonth() === 0 ? 12 : d.getMonth();
      const last = new Date(y, m, 0);
      setFrom(`${y}-${String(m).padStart(2,'0')}-01`);
      setTo(last.toISOString().slice(0,10));
    }
  }

  // Sorted driver table
  const sortedDrivers = data?.by_driver ? [...data.by_driver].sort((a, b) => {
    if (a.lai_xe === '(Chưa phân xe)') return 1;
    if (b.lai_xe === '(Chưa phân xe)') return -1;
    const va = a[sort.key] ?? 0;
    const vb = b[sort.key] ?? 0;
    return sort.dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  }) : [];

  function toggleSort(key) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  }

  // Filtered chi tiết
  const filteredOrders = (data?.orders || []).filter(o => {
    if (filterBp && o.bo_phan !== filterBp) return false;
    if (filterLaiXe && !(o.lai_xe || '').toLowerCase().includes(filterLaiXe.toLowerCase())) return false;
    return true;
  });

  const s = data?.summary;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f9fafb' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1d4ed8', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>📊 Báo cáo điều xe</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Hồng Hà Văn Phòng Phẩm</div>
        </div>
        <a href="/dieu-xe" style={{ color: '#93c5fd', fontSize: 13, textDecoration: 'none' }}>← Về điều xe</a>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Bộ lọc thời gian ── */}
        <div style={{ background: '#fff', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Từ ngày</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Đến ngày</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Hôm nay', key: 'today' },
              { label: 'Tuần này', key: 'week' },
              { label: 'Tháng này', key: 'month' },
              { label: 'Tháng trước', key: 'lastmonth' },
            ].map(({ label, key }) => (
              <button key={key} onClick={() => setRange(key)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 13, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={handleExport} disabled={exportLoading || !data}
            style={{
              marginLeft: 'auto', padding: '8px 16px', borderRadius: 6,
              background: exportLoading ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: exportLoading ? 'wait' : 'pointer',
            }}>
            {exportLoading ? '⏳ Đang xuất...' : '⬇ Xuất Excel'}
          </button>
        </div>

        {/* ── Trạng thái load ── */}
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>⏳ Đang tải dữ liệu...</div>}
        {error   && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, color: '#b91c1c', marginBottom: 16 }}>Lỗi: {error}</div>}

        {data && !loading && (
          <>
            {/* ── Summary cards ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <Card label="Tổng số đơn"       value={s.tong_don}         color="#1d4ed8" bg="#eff6ff" />
              <Card label="Đã phân xe"         value={s.da_phan_xe}       color="#15803d" bg="#f0fdf4"
                sub={`${Math.round(s.da_phan_xe / (s.tong_don || 1) * 100)}%`} />
              <Card label="Chưa phân xe"       value={s.chua_phan_xe}     color="#b45309" bg="#fffbeb" />
              <Card label="Quá hạn"            value={s.qua_han}          color="#b91c1c" bg="#fef2f2" />
              <Card label="Chưa có ngày giao"  value={s.chua_co_ngay}     color="#6b7280" bg="#f9fafb" />
              <Card label="Tổng thùng hàng"    value={s.tong_thung_tat_ca.toLocaleString('vi-VN')} color="#7c3aed" bg="#f5f3ff"
                sub={`${fmtDate(from)} – ${fmtDate(to)}`} />
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #e5e7eb' }}>
              {[
                { key: 'driver',  label: `🚗 Theo lái xe (${data.by_driver.length})` },
                { key: 'tonDong', label: `⚠ Tồn đọng (${data.ton_dong.length})` },
                { key: 'chitiet', label: `📋 Chi tiết (${data.orders.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{
                    padding: '10px 18px', border: 'none', background: 'none', fontSize: 13,
                    fontWeight: tab === t.key ? 700 : 400,
                    color: tab === t.key ? '#1d4ed8' : '#6b7280',
                    borderBottom: tab === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
                    marginBottom: -2, cursor: 'pointer',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 16 }}>

              {/* ── Tab: Theo lái xe ── */}
              {tab === 'driver' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <Th>Lái xe</Th>
                        <Th onClick={() => toggleSort('so_don')} sorted={sort.key==='so_don'} dir={sort.dir}>Số đơn</Th>
                        <Th onClick={() => toggleSort('tong_thung')} sorted={sort.key==='tong_thung'} dir={sort.dir}>Tổng thùng</Th>
                        <Th onClick={() => toggleSort('b2b')} sorted={sort.key==='b2b'} dir={sort.dir}>B2B</Th>
                        <Th onClick={() => toggleSort('gt')} sorted={sort.key==='gt'} dir={sort.dir}>GT</Th>
                        <Th onClick={() => toggleSort('mt')} sorted={sort.key==='mt'} dir={sort.dir}>MT</Th>
                        <Th onClick={() => toggleSort('qua_han')} sorted={sort.key==='qua_han'} dir={sort.dir}>Quá hạn</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDrivers.map((d, i) => (
                        <tr key={d.lai_xe} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                          <Td style={{ fontWeight: 600, color: d.lai_xe === '(Chưa phân xe)' ? '#9ca3af' : '#111827' }}>
                            {d.lai_xe === '(Chưa phân xe)' ? '⚠ ' : '🚗 '}{d.lai_xe}
                          </Td>
                          <Td style={{ textAlign: 'center', fontWeight: 700, color: '#1d4ed8' }}>{d.so_don}</Td>
                          <Td style={{ textAlign: 'center' }}>{d.tong_thung}</Td>
                          <Td style={{ textAlign: 'center', color: d.b2b ? '#1d4ed8' : '#d1d5db' }}>{d.b2b || '–'}</Td>
                          <Td style={{ textAlign: 'center', color: d.gt  ? '#15803d' : '#d1d5db' }}>{d.gt  || '–'}</Td>
                          <Td style={{ textAlign: 'center', color: d.mt  ? '#7c3aed' : '#d1d5db' }}>{d.mt  || '–'}</Td>
                          <Td style={{ textAlign: 'center', color: d.qua_han > 0 ? '#b91c1c' : '#d1d5db', fontWeight: d.qua_han > 0 ? 700 : 400 }}>
                            {d.qua_han > 0 ? d.qua_han : '–'}
                          </Td>
                        </tr>
                      ))}
                      {/* Tổng hàng */}
                      <tr style={{ background: '#eff6ff', borderTop: '2px solid #1d4ed8' }}>
                        <Td style={{ fontWeight: 700 }}>TỔNG CỘNG</Td>
                        <Td style={{ textAlign: 'center', fontWeight: 700 }}>{s.tong_don}</Td>
                        <Td style={{ textAlign: 'center', fontWeight: 700 }}>{s.tong_thung_tat_ca}</Td>
                        <Td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {data.orders.filter(o => o.bo_phan === 'B2B').length}
                        </Td>
                        <Td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {data.orders.filter(o => o.bo_phan === 'GT').length}
                        </Td>
                        <Td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {data.orders.filter(o => o.bo_phan === 'MT').length}
                        </Td>
                        <Td style={{ textAlign: 'center', fontWeight: 700, color: '#b91c1c' }}>{s.qua_han || '–'}</Td>
                      </tr>
                    </tbody>
                  </table>
                  {sortedDrivers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Không có dữ liệu</div>
                  )}
                </div>
              )}

              {/* ── Tab: Tồn đọng ── */}
              {tab === 'tonDong' && (
                <div style={{ overflowX: 'auto' }}>
                  {data.ton_dong.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#16a34a' }}>
                      ✅ Không có đơn tồn đọng trong kỳ này
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <Th>STT</Th>
                          <Th>Lý do</Th>
                          <Th>BP</Th>
                          <Th>Số phiếu</Th>
                          <Th>Khách hàng</Th>
                          <Th>Địa chỉ</Th>
                          <Th>Ngày giao</Th>
                          <Th>Lái xe</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ton_dong.map((o, i) => (
                          <tr key={o.row_key} style={{ background: i % 2 === 0 ? '#fff' : '#fef2f2' }}>
                            <Td style={{ color: '#9ca3af' }}>{i + 1}</Td>
                            <Td>
                              <span style={{
                                background: o.ton_dong_ly_do === 'Quá hạn giao' ? '#fef2f2' : '#fffbeb',
                                color:      o.ton_dong_ly_do === 'Quá hạn giao' ? '#b91c1c' : '#b45309',
                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              }}>{o.ton_dong_ly_do}</span>
                            </Td>
                            <Td>{o.bo_phan}</Td>
                            <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.so_phieu}</Td>
                            <Td style={{ maxWidth: 200 }}>{o.ten_kh}</Td>
                            <Td style={{ maxWidth: 260, fontSize: 12, color: '#6b7280' }}>{o.dia_chi_giao}</Td>
                            <Td style={{ color: o.ngay_giao && o.ngay_giao < today() ? '#b91c1c' : '#374151' }}>
                              {o.ngay_giao ? fmtDate(o.ngay_giao) : <span style={{ color: '#9ca3af' }}>Chưa có</span>}
                            </Td>
                            <Td style={{ color: o.lai_xe ? '#15803d' : '#b45309' }}>
                              {o.lai_xe || <span style={{ color: '#9ca3af' }}>Chưa phân</span>}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── Tab: Chi tiết ── */}
              {tab === 'chitiet' && (
                <>
                  {/* Filter bar */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <select value={filterBp} onChange={e => setFilterBp(e.target.value)}
                      style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}>
                      <option value="">Tất cả bộ phận</option>
                      <option value="B2B">B2B</option>
                      <option value="GT">GT</option>
                      <option value="MT">MT</option>
                    </select>
                    <input placeholder="Tìm lái xe..." value={filterLaiXe} onChange={e => setFilterLaiXe(e.target.value)}
                      style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 13, width: 160 }} />
                    <span style={{ alignSelf: 'center', fontSize: 12, color: '#6b7280' }}>
                      {filteredOrders.length} đơn
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          <Th>STT</Th>
                          <Th>BP</Th>
                          <Th>Số phiếu</Th>
                          <Th>Khách hàng</Th>
                          <Th>Địa chỉ</Th>
                          <Th>Kho</Th>
                          <Th>Ngày giao</Th>
                          <Th>Lái xe</Th>
                          <Th>Phụ xe</Th>
                          <Th>Thùng</Th>
                          <Th>Trạng thái</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((o, i) => (
                          <tr key={o.row_key} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <Td style={{ color: '#9ca3af' }}>{i + 1}</Td>
                            <Td>
                              <span style={{
                                background: { B2B: '#dbeafe', GT: '#dcfce7', MT: '#ede9fe' }[o.bo_phan] || '#f3f4f6',
                                color:      { B2B: '#1d4ed8', GT: '#15803d', MT: '#7c3aed' }[o.bo_phan] || '#374151',
                                padding: '1px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              }}>{o.bo_phan}</span>
                            </Td>
                            <Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.so_phieu}</Td>
                            <Td style={{ maxWidth: 180 }}>{o.ten_kh}</Td>
                            <Td style={{ maxWidth: 240, fontSize: 11, color: '#6b7280' }}>{o.dia_chi_giao}</Td>
                            <Td style={{ textAlign: 'center' }}>{o.ten_kho || '–'}</Td>
                            <Td style={{ color: o.ngay_giao && o.ngay_giao < today() && o.trang_thai === 'pending' ? '#b91c1c' : '#374151' }}>
                              {o.ngay_giao ? fmtDate(o.ngay_giao) : <span style={{ color: '#9ca3af' }}>–</span>}
                            </Td>
                            <Td style={{ color: o.lai_xe ? '#15803d' : '#9ca3af' }}>{o.lai_xe || '–'}</Td>
                            <Td style={{ color: o.giao_nhan ? '#374151' : '#9ca3af' }}>{o.giao_nhan || '–'}</Td>
                            <Td style={{ textAlign: 'center' }}>{o.tong_thung || '–'}</Td>
                            <Td>
                              <span style={{
                                background: { done: '#dcfce7', in_transit: '#dbeafe', failed: '#fef2f2', cancelled: '#f3f4f6' }[o.trang_thai] || '#fffbeb',
                                color:      { done: '#15803d', in_transit: '#1d4ed8', failed: '#b91c1c', cancelled: '#9ca3af' }[o.trang_thai] || '#b45309',
                                padding: '1px 8px', borderRadius: 20, fontSize: 11,
                              }}>{mapTT(o.trang_thai)}</span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredOrders.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Không có dữ liệu</div>
                    )}
                  </div>
                </>
              )}

            </div>

            {/* ── Lỗi từ sheets ── */}
            {data.errors?.length > 0 && (
              <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠ {data.errors.join(' • ')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
