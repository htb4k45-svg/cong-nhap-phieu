-- ============================================================
-- CỔNG NHẬP PHIẾU - HH VAN HANH
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================

-- Bảng khách hàng (import từ Excel hoặc thêm tay)
CREATE TABLE IF NOT EXISTS khach_hang (
  ma_kh       TEXT PRIMARY KEY,
  ten_kh      TEXT NOT NULL,
  dia_chi     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng kho
CREATE TABLE IF NOT EXISTS kho (
  ma_kho      TEXT PRIMARY KEY,
  ten_kho     TEXT NOT NULL,
  active      BOOLEAN DEFAULT TRUE
);

-- Dữ liệu kho mặc định
INSERT INTO kho (ma_kho, ten_kho) VALUES
  ('KHO-01', 'Kho Hà Nội'),
  ('KHO-02', 'Kho Hồ Chí Minh'),
  ('KHO-03', 'Kho Đà Nẵng'),
  ('KHO-04', 'Kho Bình Dương')
ON CONFLICT (ma_kho) DO NOTHING;

-- Bảng sản phẩm nặng (danh sách có sẵn + thêm mới)
CREATE TABLE IF NOT EXISTS san_pham (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_sp                 TEXT UNIQUE NOT NULL,
  ten_sp                TEXT NOT NULL,
  khoi_luong_quy_doi    DECIMAL(10, 3) NOT NULL DEFAULT 1,  -- kg/đơn vị
  don_vi                TEXT DEFAULT 'thùng',
  active                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Dữ liệu sản phẩm mẫu (thay bằng sản phẩm thực tế)
INSERT INTO san_pham (ma_sp, ten_sp, khoi_luong_quy_doi, don_vi) VALUES
  ('SP-001', 'Sản phẩm A (nặng)', 15.5, 'thùng'),
  ('SP-002', 'Sản phẩm B (nặng)', 22.0, 'thùng'),
  ('SP-003', 'Sản phẩm C (nặng)', 8.75, 'thùng')
ON CONFLICT (ma_sp) DO NOTHING;

-- Bảng phiếu xuất
CREATE TABLE IF NOT EXISTS phieu (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ngay_nhap       DATE NOT NULL,
  so_phieu        TEXT UNIQUE NOT NULL,
  ma_kh           TEXT REFERENCES khach_hang(ma_kh),
  ten_kh          TEXT NOT NULL,
  dia_chi_giao    TEXT,
  bo_phan         TEXT NOT NULL CHECK (bo_phan IN ('MT', 'GT', 'B2B')),
  ma_kho          TEXT,
  ten_kho         TEXT,
  ngay_can_giao   DATE,
  dac_diem        TEXT NOT NULL CHECK (dac_diem IN ('xuat_moi', 'xuat_gui', 'xuat_thieu')),
  so_phieu_goc    TEXT,    -- Dùng cho xuat_gui và xuat_thieu
  ghi_chu         TEXT,
  trang_thai      TEXT DEFAULT 'draft' CHECK (trang_thai IN ('draft', 'confirmed', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng người nhận hàng (nhiều người nhận / phiếu)
CREATE TABLE IF NOT EXISTS nguoi_nhan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phieu_id    UUID NOT NULL REFERENCES phieu(id) ON DELETE CASCADE,
  ho_ten      TEXT NOT NULL,
  so_dt       TEXT,
  thu_tu      INTEGER DEFAULT 1
);

-- Bảng sản phẩm trong phiếu
CREATE TABLE IF NOT EXISTS phieu_san_pham (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phieu_id              UUID NOT NULL REFERENCES phieu(id) ON DELETE CASCADE,
  san_pham_id           UUID REFERENCES san_pham(id),
  ma_sp                 TEXT NOT NULL,
  ten_sp                TEXT NOT NULL,
  so_luong              INTEGER NOT NULL DEFAULT 1,
  khoi_luong_quy_doi    DECIMAL(10, 3) NOT NULL,
  khoi_luong_tong       DECIMAL(10, 3) GENERATED ALWAYS AS (so_luong * khoi_luong_quy_doi) STORED,
  don_vi                TEXT DEFAULT 'thùng'
);

-- Index để tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_phieu_so_phieu ON phieu(so_phieu);
CREATE INDEX IF NOT EXISTS idx_phieu_ma_kh ON phieu(ma_kh);
CREATE INDEX IF NOT EXISTS idx_phieu_ngay_nhap ON phieu(ngay_nhap);
CREATE INDEX IF NOT EXISTS idx_phieu_san_pham_phieu_id ON phieu_san_pham(phieu_id);

-- Trigger tự cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phieu_updated_at
  BEFORE UPDATE ON phieu
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (bật khi cần kiểm soát truy cập theo user)
ALTER TABLE phieu ENABLE ROW LEVEL SECURITY;
ALTER TABLE nguoi_nhan ENABLE ROW LEVEL SECURITY;
ALTER TABLE phieu_san_pham ENABLE ROW LEVEL SECURITY;
ALTER TABLE khach_hang ENABLE ROW LEVEL SECURITY;
ALTER TABLE san_pham ENABLE ROW LEVEL SECURITY;
ALTER TABLE kho ENABLE ROW LEVEL SECURITY;

-- Policy mở (tất cả đều đọc/ghi được) - thay bằng auth khi cần
CREATE POLICY "Allow all" ON phieu FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON nguoi_nhan FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON phieu_san_pham FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON khach_hang FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON san_pham FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON kho FOR ALL USING (true) WITH CHECK (true);
