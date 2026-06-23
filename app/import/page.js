'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import Link from 'next/link';

// ── Helper: parse ngày ──────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  // dd/mm/yyyy
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`;
  // dd/mm (thiếu năm)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) return `${new Date().getFullYear()}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  return null;
}

// ── Detect format ────────────────────────────────────────────────────────────
// MT nếu header có 'MÃ LỆNH', B2B nếu không có

function detectFormat(headers) {
  const h = headers.map(x => String(x || '').toUpperCase());
  if (h.some(x => x.includes('MÃ LỆNH'))) return 'MT';
  return 'B2B';
}

// ── Parser MT (Thị Trường / GT) ──────────────────────────────────────────────

function parseMTSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c || '').toUpperCase().includes('SỐ PHIẾU'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map(h => String(h || '').trim().toUpperCase());

  const idx = (fn) => headers.findIndex(fn);
  const soPhieuIdx  = idx(h => h.includes('SỐ PHIẾU'));
  const maLenhIdx   = idx(h => h.includes('MÃ LỆNH'));
  const ngayDonIdx  = idx(h => h.includes('NGÀY') && (h.includes('ĐƯA') || h.includes('ĐƠN')));
  const khachIdx    = idx(h => h.includes('KHÁCH'));
  const mstIdx      = idx(h => h.includes('MST'));
  const diaChiIdx   = idx(h => h.includes('ĐỊA CHỈ'));
  const sdtIdx      = idx(h => h.includes('SĐT'));
  const laiXeIdx    = idx(h => h.includes('LÁI XE'));
  const giaoNhanIdx = idx(h => h.includes('GIAO NHẬN'));
  const ngayDiIdx   = idx(h => (h.includes('NGÀY') && h.includes('ĐI')) || h === 'NGÀY ĐI');
  const ngayYcIdx   = idx(h => h.includes('YÊU CẦU'));
  const khoIdx      = idx(h => h.includes('KHO'));
  const ghiChuIdx   = idx(h => h.includes('GHI CHÚ'));
  const tongThungIdx= idx(h => h.includes('TỔNG THÙNG') || (h.includes('TỔNG') && h.includes('THÙNG')));

  const phieuList = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const soPhieu = row[soPhieuIdx];
    const maLenh  = maLenhIdx >= 0 ? row[maLenhIdx] : null;
    if (!soPhieu && !maLenh) continue;
    if (String(soPhieu || '').trim() === '' && String(maLenh || '').trim() === '') continue;

    const ngayNhap = parseDate(ngayDonIdx >= 0 ? row[ngayDonIdx] : null);
    const ngayCan  = parseDate(
      ngayDiIdx >= 0 && row[ngayDiIdx] ? row[ngayDiIdx] :
      ngayYcIdx >= 0 ? row[ngayYcIdx] : null
    );

    const tongThungVal = tongThungIdx >= 0 ? row[tongThungIdx] : null;
    const ghiChuVal    = ghiChuIdx >= 0 ? row[ghiChuIdx] : null;
    let ghiChu = '';
    if (tongThungVal) ghiChu += `Tổng thùng: ${tongThungVal}`;
    if (ghiChuVal)    ghiChu += (ghiChu ? ' | ' : '') + String(ghiChuVal).trim();

    // Kho có thể ở cột "KHO CÔNG TY" hoặc "Kho"
    const khoVal = khoIdx >= 0 && row[khoIdx] ? String(row[khoIdx]).trim() : null;

    phieuList.push({
      bo_phan:      'MT',
      ma_lenh:      maLenh ? String(maLenh).trim() : null,
      so_phieu:     soPhieu ? String(soPhieu).trim() : (maLenh ? String(maLenh).trim() : ''),
      ngay_nhap:    ngayNhap,
      ma_kh:        mstIdx >= 0 && row[mstIdx] ? String(row[mstIdx]).trim() : null,
      ten_kh:       khachIdx >= 0 && row[khachIdx] ? String(row[khachIdx]).trim() : '',
      dia_chi_giao: diaChiIdx >= 0 && row[diaChiIdx] ? String(row[diaChiIdx]).trim() : '',
      sdt_nguoi_nhan: sdtIdx >= 0 && row[sdtIdx] ? String(row[sdtIdx]).trim() : null,
      ngay_can_giao: ngayCan,
      ma_kho:        khoVal,
      ten_kho:       khoVal,
      lai_xe:        laiXeIdx >= 0 && row[laiXeIdx] ? String(row[laiXeIdx]).trim() : null,
      giao_nhan:     giaoNhanIdx >= 0 && row[giaoNhanIdx] ? String(row[giaoNhanIdx]).trim() : null,
      san_pham:      [],
      dac_diem:      'xuat_moi',
      ghi_chu:       ghiChu || null,
    });
  }

  return phieuList;
}

// ── Parser B2B ───────────────────────────────────────────────────────────────

function parseB2BSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c || '').toUpperCase().includes('SỐ PHIẾU'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map(h => String(h || '').trim().toUpperCase());

  const idx = (fn) => headers.findIndex(fn);
  const soPhieuIdx  = idx(h => h.includes('SỐ PHIẾU'));
  const ngayDonIdx  = idx(h => h.includes('NGÀY') && h.includes('ĐƠN'));
  const khachIdx    = idx(h => h.includes('KHÁCH'));
  const diaChiIdx   = idx(h => h.includes('ĐỊA CHỈ'));
  const ngayGiaoIdx = idx(h => h.includes('NGÀY GIAO') || h === 'NGÀY GIAO');
  const laiXeIdx    = idx(h => h.includes('LÁI XE'));
  const giaoNhanIdx = idx(h => h.includes('GIAO NHẬN'));
  const tongTienIdx = idx(h => h.includes('TỔNG TIỀN'));
  const khoIdx      = idx(h => h === 'KHO');

  const spStart  = diaChiIdx + 1;
  const spEnd    = tongTienIdx > 0 ? tongTienIdx : laiXeIdx > 0 ? laiXeIdx : headers.length;
  const spHeaders = headers.slice(spStart, spEnd);

  const phieuList = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const soPhieu = row[soPhieuIdx];
    if (!soPhieu || String(soPhieu).trim() === '') continue;

    const ngayNhap = parseDate(ngayDonIdx >= 0 ? row[ngayDonIdx] : null);
    const ngayCan  = ngayGiaoIdx >= 0 ? parseDate(row[ngayGiaoIdx]) : null;

    const sanPham = [];
    for (let j = 0; j < spHeaders.length; j++) {
      const qty = row[spStart + j];
      if (qty && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0) {
        sanPham.push({ ma_sp: spHeaders[j], ten_sp: spHeaders[j], so_luong: parseFloat(qty) });
      }
    }

    const diaChiStr = String(row[diaChiIdx] || '').toUpperCase();
    let dacDiem = 'xuat_moi';
    if (diaChiStr.includes('TRẢ HÀNG THIẾU') || diaChiStr.includes('HÀNG THIẾU')) dacDiem = 'xuat_thieu';
    else if (diaChiStr.includes('TRẢ HÀNG') || diaChiStr.includes('GIAO HÀNG')) dacDiem = 'xuat_gui';

    phieuList.push({
      bo_phan:      'B2B',
      so_phieu:     String(soPhieu).trim(),
      ngay_nhap:    ngayNhap,
      ten_kh:       row[khachIdx] ? String(row[khachIdx]).trim() : '',
      dia_chi_giao: row[diaChiIdx] ? String(row[diaChiIdx]).trim() : '',
      ngay_can_giao: ngayCan,
      ma_kho:       khoIdx >= 0 && row[khoIdx] ? String(row[khoIdx]).trim() : null,
      ten_kho:      khoIdx >= 0 && row[khoIdx] ? String(row[khoIdx]).trim() : null,
      lai_xe:       laiXeIdx >= 0 && row[laiXeIdx] ? String(row[laiXeIdx]).trim() : null,
      giao_nhan:    giaoNhanIdx >= 0 && row[giaoNhanIdx] ? String(row[giaoNhanIdx]).trim() : null,
      san_pham:     sanPham,
      dac_diem:     dacDiem,
    });
  }

  return phieuList;
}

// ── Auto-detect và parse ─────────────────────────────────────────────────────

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c || '').toUpperCase().includes('SỐ PHIẾU'))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return { format: null, phieu: [] };

  const format = detectFormat(rows[headerIdx]);
  const phieu  = format === 'MT' ? parseMTSheet(ws) : parseB2BSheet(ws);
  return { format, phieu };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [sheets, setSheets]       = useState([]);
  const [selected, setSelected]   = useState([]);
  const [preview, setPreview]     = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);
  const [fileName, setFileName]   = useState('');
  const [fileFormat, setFileFormat] = useState(null); // 'MT' | 'B2B' | 'mixed'

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary', cellDates: true });
      const parsed = wb.SheetNames.map(name => {
        const { format, phieu } = parseSheet(wb.Sheets[name]);
        return { name, phieu, format };
      }).filter(s => s.phieu.length > 0);

      const formats = [...new Set(parsed.map(s => s.format).filter(Boolean))];
      setFileFormat(formats.length === 1 ? formats[0] : formats.length > 1 ? 'mixed' : null);
      setSheets(parsed);
      setSelected(parsed.map(s => s.name));
      setPreview(parsed.flatMap(s => s.phieu).slice(0, 20));
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const toggleSheet = (name) => {
    setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  };

  const totalSelected = sheets
    .filter(s => selected.includes(s.name))
    .reduce((sum, s) => sum + s.phieu.length, 0);

  const handleImport = async () => {
    const allPhieu = sheets
      .filter(s => selected.includes(s.name))
      .flatMap(s => s.phieu);

    setImporting(true);
    try {
      const res = await fetch('/api/import-b2b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phieu_list: allPhieu }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setImporting(false);
    }
  };

  const formatBadge = (fmt) => {
    if (fmt === 'MT') return <span style={{background:'#dbeafe',color:'#1d4ed8',borderRadius:4,padding:'1px 6px',fontSize:10,fontWeight:600}}>MT</span>;
    if (fmt === 'B2B') return <span style={{background:'#dcfce7',color:'#15803d',borderRadius:4,padding:'1px 6px',fontSize:10,fontWeight:600}}>B2B</span>;
    return null;
  };

  const hasMaLenh = preview.some(p => p.ma_lenh);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Về form nhập phiếu</Link>
        <span className="text-gray-300">|</span>
        <h2 className="text-lg font-bold text-gray-900">Import Excel (B2B / Thị Trường)</h2>
        {fileFormat && (
          <span className="ml-2 text-xs px-2 py-1 rounded font-medium"
            style={{background: fileFormat==='MT'?'#dbeafe': fileFormat==='B2B'?'#dcfce7':'#fef9c3',
                    color: fileFormat==='MT'?'#1d4ed8': fileFormat==='B2B'?'#15803d':'#854d0e'}}>
            Định dạng: {fileFormat === 'mixed' ? 'B2B + MT' : fileFormat}
          </span>
        )}
      </div>

      {/* Upload */}
      <div className="section-card mb-6">
        <h3 className="section-title">1. Chọn file Excel</h3>
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
          <span className="text-3xl mb-2">📂</span>
          <span className="text-sm text-gray-600 font-medium">
            {fileName || 'Click để chọn file Excel'}
          </span>
          <span className="text-xs text-gray-400 mt-1">Hỗ trợ: Vận xe 2026 (B2B) và Vận đơn thị trường (MT)</span>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {/* Chọn sheet */}
      {sheets.length > 0 && (
        <div className="section-card mb-6">
          <h3 className="section-title">2. Chọn sheet cần import</h3>
          <div className="flex flex-wrap gap-3">
            {sheets.map(s => (
              <label key={s.name} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors
                ${selected.includes(s.name) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                <input type="checkbox" className="hidden"
                  checked={selected.includes(s.name)}
                  onChange={() => toggleSheet(s.name)} />
                <span className="font-medium">{s.name.trim()}</span>
                <span className={`text-xs ${selected.includes(s.name) ? 'text-blue-200' : 'text-gray-400'}`}>
                  {s.phieu.length} phiếu
                </span>
                {s.format && (
                  <span className={`text-xs font-bold ${selected.includes(s.name) ? 'text-blue-100' : s.format==='MT'?'text-blue-600':'text-green-600'}`}>
                    {s.format}
                  </span>
                )}
              </label>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-3">
            Tổng cộng: <strong>{totalSelected} phiếu</strong> sẽ được import
          </p>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="section-card mb-6">
          <h3 className="section-title">3. Xem trước (20 dòng đầu)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2">BP</th>
                  {hasMaLenh && <th className="px-3 py-2">Mã Lệnh</th>}
                  <th className="px-3 py-2">Số phiếu</th>
                  <th className="px-3 py-2">Ngày nhập</th>
                  <th className="px-3 py-2">Khách hàng</th>
                  <th className="px-3 py-2">Địa chỉ</th>
                  <th className="px-3 py-2">Người giao</th>
                  <th className="px-3 py-2">Ghi chú / SP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{formatBadge(p.bo_phan)}</td>
                    {hasMaLenh && <td className="px-3 py-2 font-medium text-purple-700">{p.ma_lenh || '—'}</td>}
                    <td className="px-3 py-2 font-medium text-blue-700 max-w-[120px] truncate" title={p.so_phieu}>{p.so_phieu}</td>
                    <td className="px-3 py-2">{p.ngay_nhap || '—'}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate" title={p.ten_kh}>{p.ten_kh}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate" title={p.dia_chi_giao}>{p.dia_chi_giao}</td>
                    <td className="px-3 py-2 text-gray-500">{[p.lai_xe, p.giao_nhan].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">
                      {p.ghi_chu || (p.san_pham?.length ? `${p.san_pham.length} SP` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nút import */}
      {totalSelected > 0 && !result && (
        <div className="flex justify-end">
          <button className="btn-primary flex items-center gap-2 text-base px-8 py-3"
            onClick={handleImport} disabled={importing}>
            {importing
              ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Đang import…</>
              : `⬆ Import ${totalSelected} phiếu vào database`}
          </button>
        </div>
      )}

      {/* Kết quả */}
      {result && (
        <div className={`section-card ${result.error ? 'border-red-200' : 'border-green-200'}`}>
          {result.error ? (
            <p className="text-red-600">❌ Lỗi: {result.error}</p>
          ) : (
            <div>
              <p className="text-green-700 font-semibold text-lg">✅ Import hoàn tất!</p>
              <div className="mt-2 flex gap-6 text-sm">
                <span className="text-green-600">✓ Thành công: <strong>{result.success}</strong></span>
                <span className="text-gray-500">⏭ Bỏ qua (trùng): <strong>{result.skipped}</strong></span>
                {result.errors?.length > 0 && (
                  <span className="text-red-500">✗ Lỗi: <strong>{result.errors.length}</strong></span>
                )}
              </div>
              {result.errors?.length > 0 && (
                <div className="mt-3 text-xs text-red-600 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => <p key={i}>{e.so_phieu}: {e.error}</p>)}
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <Link href="/" className="btn-primary inline-block text-sm">← Về form nhập phiếu</Link>
                <button className="text-sm text-blue-600 hover:underline" onClick={() => { setResult(null); setSheets([]); setFileName(''); }}>
                  Import file khác
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
