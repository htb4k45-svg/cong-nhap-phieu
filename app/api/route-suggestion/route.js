import { NextResponse } from 'next/server';

// ── Normalize Vietnamese text ─────────────────────────────────────────────────
function normVN(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

// ── Map tỉnh/thành normalize → tên hiển thị ──────────────────────────────────
const PROVINCE_MAP = [
  ['ha noi',        'Hà Nội'],
  ['ho chi minh',   'HCM'],
  ['tphcm',         'HCM'],
  ['hai phong',     'Hải Phòng'],
  ['da nang',       'Đà Nẵng'],
  ['quang ninh',    'Quảng Ninh'],
  ['hai duong',     'Hải Dương'],
  ['hung yen',      'Hưng Yên'],
  ['bac ninh',      'Bắc Ninh'],
  ['bac giang',     'Bắc Giang'],
  ['thai nguyen',   'Thái Nguyên'],
  ['vinh phuc',     'Vĩnh Phúc'],
  ['phu tho',       'Phú Thọ'],
  ['nam dinh',      'Nam Định'],
  ['ninh binh',     'Ninh Bình'],
  ['thanh hoa',     'Thanh Hóa'],
  ['nghe an',       'Nghệ An'],
  ['ha tinh',       'Hà Tĩnh'],
  ['binh duong',    'Bình Dương'],
  ['dong nai',      'Đồng Nai'],
  ['long an',       'Long An'],
  ['tp thu duc',    'TP Thủ Đức'],
  ['thu duc',       'TP Thủ Đức'],
];

function matchProvince(normAddr) {
  for (const [key, name] of PROVINCE_MAP) {
    if (normAddr.includes(key)) return name;
  }
  return null;
}

// ── Extract khu_vuc từ địa chỉ (mirror logic từ dieu-xe) ─────────────────────
function extractKhuVuc(diaChi) {
  if (!diaChi) return 'Chưa rõ';
  const addr = normVN(diaChi);

  // 0. Địa chỉ có ghi rõ "Tỉnh X" ở cuối → ưu tiên tỉnh (tránh match nhầm phường trùng tên)
  //    Ví dụ: "Phường Việt Hưng, Tỉnh Quảng Ninh" → Quảng Ninh (không phải Việt Hưng - HN)
  const tinhSuffix = addr.match(/,?\s*(?:tinh|tp\.?|thanh pho)\s+(.{3,30})$/);
  if (tinhSuffix) {
    const p = matchProvince(tinhSuffix[1]);
    if (p) return p;
  }
  // Cũng check "tỉnh" xuất hiện bất kỳ đâu trong địa chỉ
  if (/\btinh\b/.test(addr)) {
    const p = matchProvince(addr);
    if (p && p !== 'Hà Nội' && p !== 'HCM') return p; // HN/HCM không cần ghi "tỉnh"
  }

  // 1. Quận số
  let m = addr.match(/\bquan\s*(\d{1,2})\b/);
  if (m) return `Quận ${m[1]}`;
  m = addr.match(/\bq\.?\s*(\d{1,2})\b/);
  if (m) return `Quận ${m[1]}`;

  // 2. Tỉnh/thành đặc biệt không cần từ khoá "tỉnh"
  const p = matchProvince(addr);
  if (p) return p;

  // 3. Fallback: phần cuối địa chỉ
  const parts = diaChi.split(',');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].trim()
      .replace(/^(tỉnh|thành phố|tp\.?)\s*/i, '');
    if (last.length >= 3 && last.length <= 30) return last;
  }
  return 'Khác';
}

// ── Hệ số quy đổi sang thùng A4 (đồng bộ sheets.js) ─────────────────────────
const A4_EQUIV = { A3: 2, A4: 1, VO: 2, GVS: 1/3 };

// ── Get tổng thùng A4 quy đổi (MT) ──────────────────────────────────────────
function getTongThung(p) {
  if (p.tong_thung != null) return Number(p.tong_thung) || 0; // đã là A4-equiv từ parser
  if (p.san_pham && p.san_pham.length) {
    const raw = p.san_pham.reduce((acc, sp) => {
      const thung = sp.so_luong_thung != null ? Number(sp.so_luong_thung) : Number(sp.so_luong || 0);
      const factor = A4_EQUIV[sp.ma_sp] || 1;
      return acc + thung * factor;
    }, 0);
    return Math.ceil(raw);
  }
  return 0;
}

// B2B: tải tính trực tiếp theo kg (đồng bộ với app/dieu-xe/page.js) — MT vẫn theo thùng.
function getLoadOf(p) {
  if (p.bo_phan === 'B2B') return { kind: 'kg', value: Number(p.khoi_luong_kg) || 0 };
  return { kind: 'thung', value: getTongThung(p) };
}

// ── Greedy VRP: group-by-area → bin-pack vào drivers ─────────────────────────
//
// soXe: số xe muốn dùng (0 = auto = dùng tất cả)
//   - Nếu driver có suc_tai_thung = 0 (unlimited) và soXe > 1:
//     áp "virtual capacity" = ceil(totalA4 / soXe) × 1.1 để buộc chia đều
//
function greedyVRP(phieuList, drivers, soXe) {
  // Chỉ lấy lái xe (vai_tro: lai_xe hoặc ca_hai)
  const laiXeList = drivers.filter(d =>
    d.vai_tro === 'lai_xe' || d.vai_tro === 'ca_hai'
  );

  if (laiXeList.length === 0) {
    return { assignments: [], unassigned: phieuList };
  }

  // Annotate phieu với khu_vuc + tải (thùng cho MT, kg cho B2B — xem getLoadOf)
  // Ưu tiên dùng p.khu_vuc nếu client đã tính sẵn (dùng ward-matcher đầy đủ)
  const annotated = phieuList.map(p => {
    const load = getLoadOf(p);
    return {
      ...p,
      _khu_vuc: p.khu_vuc || extractKhuVuc(p.dia_chi_giao),
      _thung:   load.kind === 'thung' ? load.value : 0,
      _kg:      load.kind === 'kg'    ? load.value : 0,
    };
  });

  // Tổng theo từng đơn vị để tính virtual capacity
  const totalThung = annotated.reduce((s, p) => s + p._thung, 0);
  const totalKg    = annotated.reduce((s, p) => s + p._kg, 0);

  // Số xe thực dùng
  const numVehicles = (soXe && soXe > 0)
    ? Math.min(soXe, laiXeList.length)
    : laiXeList.length;

  // Lấy numVehicles xe đầu tiên (đã sort từ /api/drivers: theo vai_tro + ten)
  const selectedDrivers = laiXeList.slice(0, numVehicles);

  // Virtual capacity cho xe unlimited khi chia nhiều xe
  // = ceil(total / numVehicles) × 1.15 (buffer 15% để nhóm khu_vuc không bị cắt đôi)
  const virtualCapThung = numVehicles > 1 ? Math.ceil(totalThung / numVehicles * 1.15) : 0;
  const virtualCapKg    = numVehicles > 1 ? Math.ceil(totalKg    / numVehicles * 1.15) : 0;

  // Group by khu_vuc
  const groupMap = {};
  for (const p of annotated) {
    if (!groupMap[p._khu_vuc]) groupMap[p._khu_vuc] = [];
    groupMap[p._khu_vuc].push(p);
  }

  // Sort groups: tổng tải desc (thùng + kg coi như cùng "điểm tải" để ưu tiên nhóm nặng trước)
  const groups = Object.entries(groupMap)
    .map(([area, items]) => ({
      area,
      items,
      totalThung: items.reduce((s, p) => s + p._thung, 0),
      totalKg:    items.reduce((s, p) => s + p._kg, 0),
      assigned: false,
    }))
    .sort((a, b) => (b.totalThung + b.totalKg) - (a.totalThung + a.totalKg));

  // Init driver buckets — mỗi bucket theo dõi riêng usedThung (MT) và usedKg (B2B)
  // Khi soXe > 1: giới hạn mỗi xe bằng virtualCap để buộc chia đều
  //   cap = min(suc_tai_*, virtualCap) — nếu xe có giới hạn thực thì lấy cái nhỏ hơn
  //   virtualCap = 0 chỉ khi numVehicles === 1 (1 xe = không cần giới hạn)
  const buckets = selectedDrivers.map(d => ({
    driver: d,
    orders: [],
    usedThung: 0,
    usedKg: 0,
    capThung: numVehicles > 1
      ? (d.suc_tai_thung > 0 ? Math.min(d.suc_tai_thung, virtualCapThung) : virtualCapThung)
      : (d.suc_tai_thung > 0 ? d.suc_tai_thung : 0),
    capKg: numVehicles > 1
      ? (d.suc_tai_kg > 0 ? Math.min(d.suc_tai_kg, virtualCapKg) : virtualCapKg)
      : (d.suc_tai_kg > 0 ? d.suc_tai_kg : 0),
  }));

  const fitsBucket = (b, thung, kg) => {
    const okThung = b.capThung === 0 || (b.usedThung + thung) <= b.capThung;
    const okKg    = b.capKg === 0    || (b.usedKg    + kg)    <= b.capKg;
    return okThung && okKg;
  };
  const remCap = (b) => {
    const remThung = b.capThung === 0 ? Infinity : b.capThung - b.usedThung;
    const remKg    = b.capKg    === 0 ? Infinity : b.capKg    - b.usedKg;
    return Math.min(remThung, remKg);
  };

  const assignedKeys = new Set();

  // Vòng 1: gán cả nhóm (giữ đơn cùng khu_vuc trên 1 xe)
  for (const grp of groups) {
    if (grp.totalThung === 0 && grp.totalKg === 0 && grp.items.length === 0) continue;

    // Tìm bucket phù hợp: còn đủ chỗ cho cả nhóm (cả thùng và kg) hoặc unlimited
    const bucket = buckets
      .filter(b => fitsBucket(b, grp.totalThung, grp.totalKg))
      .sort((a, b) => {
        // Ưu tiên bucket đã có đơn của khu_vuc này
        const aHas = a.orders.some(o => o._khu_vuc === grp.area) ? 1 : 0;
        const bHas = b.orders.some(o => o._khu_vuc === grp.area) ? 1 : 0;
        if (bHas !== aHas) return bHas - aHas;
        // Sau đó: remaining capacity nhỏ nhất (first-fit decreasing)
        return remCap(a) - remCap(b);
      })[0];

    if (!bucket) continue; // nhóm quá lớn, xử lý ở vòng 2

    for (const item of grp.items) {
      bucket.orders.push(item);
      bucket.usedThung += item._thung;
      bucket.usedKg    += item._kg;
      assignedKeys.add(item.row_key);
    }
  }

  // Vòng 2: đơn chưa được gán (nhóm quá lớn) → gán lẻ từng đơn
  const overflow = annotated.filter(p => !assignedKeys.has(p.row_key));
  // Sắp xếp đơn lớn nhất trước
  overflow.sort((a, b) => (b._thung + b._kg) - (a._thung + a._kg));

  for (const item of overflow) {
    const bucket = buckets
      .filter(b => fitsBucket(b, item._thung, item._kg))
      .sort((a, b) => {
        // Ưu tiên cùng khu_vuc
        const aHas = a.orders.some(o => o._khu_vuc === item._khu_vuc) ? 1 : 0;
        const bHas = b.orders.some(o => o._khu_vuc === item._khu_vuc) ? 1 : 0;
        if (bHas !== aHas) return bHas - aHas;
        return remCap(a) - remCap(b);
      })[0];

    if (bucket) {
      bucket.orders.push(item);
      bucket.usedThung += item._thung;
      bucket.usedKg    += item._kg;
      assignedKeys.add(item.row_key);
    }
  }

  // Build kết quả
  const assignments = buckets.map(b => {
    const areaMap = {};
    for (const o of b.orders) {
      if (!areaMap[o._khu_vuc]) areaMap[o._khu_vuc] = 0;
      areaMap[o._khu_vuc]++;
    }
    const pctThung = b.capThung > 0 ? Math.round(b.usedThung / b.capThung * 100) : null;
    const pctKg    = b.capKg    > 0 ? Math.round(b.usedKg    / b.capKg    * 100) : null;
    const loadPct  = [pctThung, pctKg].filter(x => x !== null).reduce((m, x) => Math.max(m, x), 0) || null;
    return {
      driver: {
        id:           b.driver.id,
        ten:          b.driver.ten,
        vai_tro:      b.driver.vai_tro,
        bien_so:      b.driver.bien_so || null,
        suc_tai_thung: b.driver.suc_tai_thung || 0,
        suc_tai_kg:   b.driver.suc_tai_kg    || 0,
      },
      orders:     b.orders.map(o => ({
        row_key:     o.row_key,
        ten_kh:      o.ten_kh,
        dia_chi_giao: o.dia_chi_giao,
        khu_vuc:     o._khu_vuc,
        thung:       o._thung,
        khoi_luong_kg: o._kg,
        bo_phan:     o.bo_phan,
        ngay_can_giao: o.ngay_can_giao || null,
      })),
      usedThung:  b.usedThung,
      usedKg:     b.usedKg,
      cap:        b.capThung, // giữ tên cũ để tương thích UI hiện có (thùng)
      capKg:      b.capKg,
      loadPct,
      areas:      areaMap,
    };
  });

  const unassigned = annotated
    .filter(p => !assignedKeys.has(p.row_key))
    .map(p => ({
      row_key:     p.row_key,
      ten_kh:      p.ten_kh,
      dia_chi_giao: p.dia_chi_giao,
      khu_vuc:     p._khu_vuc,
      thung:       p._thung,
      khoi_luong_kg: p._kg,
      bo_phan:     p.bo_phan,
    }));

  return { assignments, unassigned };
}

// ── POST /api/route-suggestion ────────────────────────────────────────────────
// Body: { phieu: [...], drivers: [...], statusMap?: {...} }
//   phieu    = danh sách phiếu (từ sheets-data)
//   drivers  = danh sách lái xe (từ /api/drivers)
//   statusMap= trạng thái hiện tại (để loại đơn đã được phân công)
//
export async function POST(request) {
  try {
    const body = await request.json();
    const { phieu = [], drivers = [], statusMap = {}, includeAssigned = false, soXe = 0 } = body;

    if (!phieu.length) {
      return NextResponse.json({ assignments: [], unassigned: [], info: 'Không có đơn nào để phân.' });
    }
    if (!drivers.length) {
      return NextResponse.json({ assignments: [], unassigned: phieu, info: 'Không có lái xe nào.' });
    }

    // Lọc đơn chưa được phân công (trừ khi includeAssigned = true)
    const toAssign = includeAssigned
      ? phieu
      : phieu.filter(p => {
          const s = statusMap[p.row_key];
          const lx = s ? s.lai_xe_phan_cong : p.lai_xe;
          return !lx; // chưa có lái xe
        });

    if (!toAssign.length) {
      return NextResponse.json({
        assignments: [],
        unassigned: [],
        info: 'Tất cả đơn đã được phân công rồi.',
      });
    }

    const result = greedyVRP(toAssign, drivers, soXe);

    return NextResponse.json({
      ...result,
      meta: {
        total:      toAssign.length,
        assigned:   toAssign.length - result.unassigned.length,
        unassigned: result.unassigned.length,
        drivers:    result.assignments.filter(a => a.orders.length > 0).length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
