import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// POST /api/phieu  → Lưu phiếu mới
export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const {
      ngay_nhap, so_phieu, ma_lenh, ma_kh, ten_kh, dia_chi_giao,
      bo_phan, ma_kho, ten_kho, ngay_can_giao,
      dac_diem, so_phieu_goc, ghi_chu,
      nguoi_nhan, san_pham,
    } = body;

    // Upsert khách hàng nếu có mã KH mới
    if (ma_kh && ten_kh) {
      await supabase.from('khach_hang').upsert({ ma_kh, ten_kh, dia_chi: dia_chi_giao || null }, {
        onConflict: 'ma_kh',
        ignoreDuplicates: true,
      });
    }

    // Insert phiếu
    const { data: phieu, error: phieuErr } = await supabase
      .from('phieu')
      .insert({
        ngay_nhap, so_phieu, ma_lenh: ma_lenh || null, ma_kh: ma_kh || null, ten_kh,
        dia_chi_giao, bo_phan, ma_kho, ten_kho,
        ngay_can_giao: ngay_can_giao || null,
        dac_diem, so_phieu_goc: so_phieu_goc || null,
        ghi_chu: ghi_chu || null,
        trang_thai: 'confirmed',
      })
      .select()
      .single();

    if (phieuErr) throw new Error(phieuErr.message);

    // Insert người nhận
    if (nguoi_nhan?.length) {
      const nnRows = nguoi_nhan.map((n, i) => ({
        phieu_id: phieu.id,
        ho_ten: n.ho_ten,
        so_dt: n.so_dt || null,
        thu_tu: i + 1,
      }));
      const { error: nnErr } = await supabase.from('nguoi_nhan').insert(nnRows);
      if (nnErr) throw new Error(nnErr.message);
    }

    // Insert sản phẩm
    if (san_pham?.length) {
      const spRows = san_pham.map(s => ({
        phieu_id: phieu.id,
        san_pham_id: s.san_pham_id || null,
        ma_sp: s.ma_sp || '',
        ten_sp: s.ten_sp,
        so_luong: parseInt(s.so_luong) || 1,
        khoi_luong_quy_doi: parseFloat(s.khoi_luong_quy_doi) || 0,
        don_vi: s.don_vi || 'thùng',
      }));
      const { error: spErr } = await supabase.from('phieu_san_pham').insert(spRows);
      if (spErr) throw new Error(spErr.message);
    }

    return NextResponse.json({ data: phieu }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/phieu  → Lấy danh sách phiếu (có filter)
export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const page  = parseInt(searchParams.get('page')  || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const from  = (page - 1) * limit;

    let query = supabase
      .from('phieu')
      .select('*, nguoi_nhan(*), phieu_san_pham(*)', { count: 'exact' })
      .order('ngay_nhap', { ascending: false })
      .range(from, from + limit - 1);

    if (searchParams.get('so_phieu')) {
      query = query.ilike('so_phieu', `%${searchParams.get('so_phieu')}%`);
    }
    if (searchParams.get('ma_kh')) {
      query = query.eq('ma_kh', searchParams.get('ma_kh'));
    }
    if (searchParams.get('ngay_giao')) {
      query = query.eq('ngay_can_giao', searchParams.get('ngay_giao'));
    }
    if (searchParams.get('bo_phan')) {
      query = query.eq('bo_phan', searchParams.get('bo_phan'));
    }
    if (searchParams.get('trang_thai_giao')) {
      query = query.eq('trang_thai_giao', searchParams.get('trang_thai_giao'));
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ data, count, page, limit });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
