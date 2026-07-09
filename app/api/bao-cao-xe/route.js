import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/bao-cao-xe?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to') || from;

    if (!from) return NextResponse.json({ error: 'Thiếu tham số from' }, { status: 400 });

    const supabase = createAdminClient();

    // ── 1. Lấy danh sách drivers ──────────────────────────────────────────────
    const { data: drivers } = await supabase
      .from('drivers')
      .select('ten, bien_so, vai_tro, active')
      .eq('active', true)
      .order('ten');

    const driverInfo = {};
    (drivers || []).forEach(d => { driverInfo[d.ten] = d; });

    // ── 2. Lấy delivery_runs trong khoảng ngày ────────────────────────────────
    const { data: runs, error: runsErr } = await supabase
      .from('delivery_runs')
      .select('*')
      .gte('ngay_chay', from)
      .lte('ngay_chay', to)
      .order('ngay_chay', { ascending: true });

    if (runsErr) throw runsErr;

    // ── 3. Lấy dispatch_status có ghi_chu_giao (thiếu hàng) ──────────────────
    const { data: dispatches } = await supabase
      .from('dispatch_status')
      .select('row_key, ngay_giao, lai_xe_phan_cong, giao_nhan_phan_cong, trang_thai, ghi_chu_giao')
      .gte('ngay_giao', from)
      .lte('ngay_giao', to)
      .not('ghi_chu_giao', 'is', null);

    // Group missing-item notes by driver+date
    const thieuMap = {}; // driver → [{ ngay, row_key, ghi_chu_giao }]
    for (const d of (dispatches || [])) {
      const names = [d.lai_xe_phan_cong, d.giao_nhan_phan_cong].filter(Boolean);
      for (const name of names) {
        if (!thieuMap[name]) thieuMap[name] = [];
        thieuMap[name].push({
          ngay:        d.ngay_giao,
          row_key:     d.row_key,
          ghi_chu_giao: d.ghi_chu_giao,
        });
      }
    }

    // ── 4. Aggregate theo lái xe ──────────────────────────────────────────────
    const byDriver = {}; // driver_name → { runs: [], agg }

    for (const run of (runs || [])) {
      const name = run.driver_name;
      if (!byDriver[name]) {
        byDriver[name] = {
          driver_name: name,
          bien_so:     driverInfo[name]?.bien_so || '',
          vai_tro:     driverInfo[name]?.vai_tro || '',
          runs:        [],
          // aggregates
          tong_km:       0,
          tong_chuyen:   0,
          tong_don_giao: 0,
          tong_don_hoan: 0,
          ngay_chay_list: [],
        };
      }
      const dr = byDriver[name];
      dr.runs.push(run);
      dr.tong_km       += (run.km_thuc_te || 0);
      dr.tong_chuyen   += 1;
      dr.tong_don_giao += (run.so_don_giao || 0);
      dr.tong_don_hoan += (run.so_don_hoan || 0);
      dr.ngay_chay_list.push(run.ngay_chay);
    }

    // Gắn thiếu hàng
    for (const [name, items] of Object.entries(thieuMap)) {
      if (!byDriver[name]) {
        byDriver[name] = {
          driver_name: name,
          bien_so:     driverInfo[name]?.bien_so || '',
          vai_tro:     driverInfo[name]?.vai_tro || '',
          runs:        [],
          tong_km: 0, tong_chuyen: 0, tong_don_giao: 0, tong_don_hoan: 0,
          ngay_chay_list: [],
        };
      }
      byDriver[name].thieu_hang = items;
    }

    // ── 5. Summary tổng ───────────────────────────────────────────────────────
    const driverList = Object.values(byDriver).sort((a, b) =>
      a.driver_name.localeCompare(b.driver_name, 'vi')
    );

    const summary = {
      tong_chuyen:   driverList.reduce((s, d) => s + d.tong_chuyen, 0),
      tong_km:       driverList.reduce((s, d) => s + d.tong_km, 0),
      tong_don_giao: driverList.reduce((s, d) => s + d.tong_don_giao, 0),
      tong_don_hoan: driverList.reduce((s, d) => s + d.tong_don_hoan, 0),
      tong_thieu:    Object.values(thieuMap).reduce((s, arr) => s + arr.length, 0),
      so_tai_xe:     driverList.filter(d => d.tong_chuyen > 0).length,
    };

    return NextResponse.json({ from, to, summary, drivers: driverList });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
