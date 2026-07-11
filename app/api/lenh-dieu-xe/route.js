import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// POST /api/lenh-dieu-xe
// Body: { driver, bien_so, giao_nhan, date, orders: [{so_phieu, ten_kh, dia_chi_giao, san_pham, ghi_chu}] }
export async function POST(request) {
  try {
    const body = await request.json();
    const { driver, bien_so, giao_nhan, date, orders = [] } = body;

    // Parse date
    const d = date ? new Date(date + 'T00:00:00') : new Date();
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();

    // Collect all unique product codes (only from orders that have san_pham)
    const spMap = {}; // ma_sp → ten_sp
    for (const ord of orders) {
      if (ord.san_pham && ord.san_pham.length > 0) {
        for (const sp of ord.san_pham) {
          if (!spMap[sp.ma_sp]) spMap[sp.ma_sp] = sp.ten_sp || sp.ma_sp;
        }
      }
    }
    const spCodes = Object.keys(spMap);

    // Column layout:
    // A=STT, B=Thứ tự, C=Số phiếu, D=Tên Công ty, E=Địa chỉ, F...(F+n-1)=SP cols, last=Ghi chú/Tổng
    const SP_START   = 6; // col index (1-based) where SP cols start
    const SP_END     = SP_START + Math.max(spCodes.length - 1, 0);
    const COL_GHI    = spCodes.length > 0 ? SP_END + 1 : SP_START;
    const TOTAL_COLS = Math.max(COL_GHI, 8); // tối thiểu 8 cột

    const wb = XLSX.utils.book_new();
    const ws = {};

    // Helper: set cell
    const c = (r, col, v, s) => {
      const addr = XLSX.utils.encode_cell({ r: r - 1, c: col - 1 });
      if (v && typeof v === 'object' && v.f) {
        ws[addr] = { f: v.f, t: 'n', ...(s ? { s } : {}) };
      } else {
        ws[addr] = { v, t: typeof v === 'number' ? 'n' : 's', ...(s ? { s } : {}) };
      }
    };

    // ── HEADER INFO ──────────────────────────────────────
    c(1, 3, 'Lái xe:');
    c(1, 4, driver || '');

    c(2, 3, 'Giao nhận:');
    c(2, 4, giao_nhan || '');

    c(3, 3, 'Số km xuất phát:');
    c(4, 3, 'Số km kết thúc:');
    c(5, 3, 'Số lít xăng:');

    // Tel/Email — đặt vào cột 1-2 để luôn tồn tại
    c(3, 1, 'Tel: 024 36524250');
    c(4, 1, 'Email: dvkh@vpphongha.com.vn');

    // ── TITLE ─────────────────────────────────────────────
    c(6, 1, 'LỆNH ĐIỀU XE');
    c(7, 1, `Ngày  ${day} tháng   ${month}   năm ${year}`);
    c(8, 1, `Biển số: ${bien_so || ''}`);

    // ── TABLE HEADERS (row 9 + 10) ────────────────────────
    c(9, 1, 'Stt');
    c(9, 2, 'Thứ tự\ngiao hàng');
    c(9, 3, 'Số phiếu');
    c(9, 4, 'Tên Công ty');
    c(9, 5, 'Địa chỉ');
    if (spCodes.length > 0) {
      c(9, SP_START, 'GIẤY PHOTO & VĂN PHÒNG PHẨM');
      // Row 10: individual product codes
      spCodes.forEach((code, i) => { c(10, SP_START + i, code); });
    }
    c(9, COL_GHI, 'Ghi chú / Tổng');

    // ── DATA ROWS ─────────────────────────────────────────
    let ROW = 11;
    for (let i = 0; i < orders.length; i++) {
      const ord = orders[i];
      c(ROW, 1, i + 1);
      c(ROW, 2, '');  // thứ tự giao - điền tay
      c(ROW, 3, ord.so_phieu || '');
      c(ROW, 4, ord.ten_kh || '');
      c(ROW, 5, ord.dia_chi_giao || '');

      // SP quantities
      if (spCodes.length > 0) {
        spCodes.forEach((code, idx) => {
          const sp = (ord.san_pham || []).find(s => s.ma_sp === code);
          const qty = sp ? sp.so_luong : '';
          if (qty !== '') c(ROW, SP_START + idx, qty);
        });
      }

      // Ghi chú / tổng thùng
      c(ROW, COL_GHI, ord.ghi_chu || '');
      ROW++;
    }

    // ── TOTALS ROW ────────────────────────────────────────
    c(ROW, 1, 'TỔNG');
    if (spCodes.length > 0) {
      spCodes.forEach((_, idx) => {
        const col = SP_START + idx;
        const colLetter = XLSX.utils.encode_col(col - 1);
        c(ROW, col, { f: `SUM(${colLetter}11:${colLetter}${ROW - 1})` });
      });
    }
    ROW++;
    ROW++;

    // Ký tên
    c(ROW, 3, 'Người lập');
    c(ROW, 6, 'Lái xe');
    c(ROW, 9, 'Giao nhận');
    c(ROW, 12, 'Kho');

    // ── MERGES ────────────────────────────────────────────
    const merges = [
      // Title rows
      { s:{r:5,c:0}, e:{r:5,c:TOTAL_COLS-1} },  // row 6 LỆNH ĐIỀU XE
      { s:{r:6,c:0}, e:{r:6,c:TOTAL_COLS-1} },  // row 7 Ngày
      { s:{r:7,c:0}, e:{r:7,c:TOTAL_COLS-1} },  // row 8 Biển số
      // Header fixed cols: merge row 9+10
      { s:{r:8,c:0}, e:{r:9,c:0} },   // STT
      { s:{r:8,c:1}, e:{r:9,c:1} },   // Thứ tự
      { s:{r:8,c:2}, e:{r:9,c:2} },   // Số phiếu
      { s:{r:8,c:3}, e:{r:9,c:3} },   // Tên Công ty
      { s:{r:8,c:4}, e:{r:9,c:4} },   // Địa chỉ
      { s:{r:8,c:COL_GHI-1}, e:{r:9,c:COL_GHI-1} }, // Ghi chú
    ];

    // Merge SP group header if there are SP cols
    if (spCodes.length > 0) {
      merges.push({ s:{r:8,c:SP_START-1}, e:{r:8,c:SP_END-1} });
    }

    ws['!merges'] = merges;

    // ── COLUMN WIDTHS ─────────────────────────────────────
    const cols = [
      { wch: 5  },   // A STT
      { wch: 7  },   // B Thứ tự
      { wch: 22 },   // C Số phiếu
      { wch: 28 },   // D Tên Công ty
      { wch: 40 },   // E Địa chỉ
    ];
    for (let i = 0; i < spCodes.length; i++) cols.push({ wch: 8 });
    cols.push({ wch: 18 }); // Ghi chú
    ws['!cols'] = cols;

    // ── ROW HEIGHTS ───────────────────────────────────────
    ws['!rows'] = Array(ROW + 2).fill(null).map((_, i) => {
      if (i === 5) return { hpt: 22 };   // LỆNH ĐIỀU XE
      if (i === 8 || i === 9) return { hpt: 24 };
      if (i >= 10 && i < 10 + orders.length) return { hpt: 30 };
      return { hpt: 16 };
    });

    // ── REF ───────────────────────────────────────────────
    ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:ROW+1,c:TOTAL_COLS-1} });

    const sheetName = (bien_so || driver || 'Xe').replace(/[\/\[\]\*\?:]/g, '-').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `LenhDieuXe_${(bien_so || driver).replace(/\s/g,'_')}_${day}${month}${year}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
