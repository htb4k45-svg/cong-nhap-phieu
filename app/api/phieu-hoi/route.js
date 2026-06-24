import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// GET /api/phieu-hoi?date=YYYY-MM-DD&driver=NAME
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date   = searchParams.get('date');
    const driver = searchParams.get('driver');

    const pending = searchParams.get('pending');

    const supabase = createAdminClient();
    let q = supabase.from('phieu_hoi').select('*');
    if (pending) {
      // Tất cả phiếu chờ lấy chưa gán lái xe
      q = q.eq('trang_thai', 'cho_lay').is('lai_xe', null);
    } else {
      if (date)   q = q.eq('ngay_lay', date);
      if (driver) q = q.eq('lai_xe', driver);
    }
    q = q.order('created_at', { ascending: false });

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ phieu_hoi: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/phieu-hoi — tạo phiếu hồi mới
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      so_phieu_hoi, bo_phan, nguon_ten, nguon_dia_chi, nguon_sdt,
      loai_hang, so_luong_thung, so_kg, ghi_chu,
      kho_nhan, nguoi_nhan,
      lai_xe, ngay_lay,
    } = body;

    if (!nguon_ten || !ngay_lay) {
      return NextResponse.json({ error: 'Thiếu nguon_ten hoặc ngay_lay' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('phieu_hoi')
      .insert({
        so_phieu_hoi:   so_phieu_hoi || null,
        bo_phan:        bo_phan || null,
        nguon_ten:      nguon_ten.trim(),
        nguon_dia_chi:  nguon_dia_chi || null,
        nguon_sdt:      nguon_sdt || null,
        loai_hang:      loai_hang || null,
        so_luong_thung: so_luong_thung ? parseInt(so_luong_thung) : 0,
        so_kg:          so_kg ? parseFloat(so_kg) : null,
        ghi_chu:        ghi_chu || null,
        kho_nhan:       kho_nhan || null,
        nguoi_nhan:     nguoi_nhan || null,
        lai_xe:         lai_xe || null,
        ngay_lay,
        trang_thai:     'cho_lay',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ phieu: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/phieu-hoi — cập nhật trạng thái / thông tin
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, trang_thai, ghi_chu, lai_xe, so_luong_thung, so_kg } = body;

    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const supabase = createAdminClient();
    const payload = {};
    if (trang_thai     !== undefined) payload.trang_thai     = trang_thai;
    if (ghi_chu        !== undefined) payload.ghi_chu        = ghi_chu || null;
    if (lai_xe         !== undefined) payload.lai_xe         = lai_xe || null;
    if (so_luong_thung !== undefined) payload.so_luong_thung = parseInt(so_luong_thung) || 0;
    if (so_kg          !== undefined) payload.so_kg          = so_kg ? parseFloat(so_kg) : null;

    const { data, error } = await supabase
      .from('phieu_hoi')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ phieu: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/phieu-hoi?id=X
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase.from('phieu_hoi').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
