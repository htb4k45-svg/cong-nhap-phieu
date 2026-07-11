-- ============================================================
-- Bảng phiếu nhận hàng hồi (hàng từ đối tác/khách về kho HH)
-- Gắn với cùng chuyến xe xuất hàng (lai_xe + ngay_lay)
-- ============================================================

CREATE TABLE IF NOT EXISTS phieu_hoi (
  id              BIGSERIAL PRIMARY KEY,

  -- Định danh
  so_phieu_hoi    TEXT,                          -- mã phiếu hồi (tùy chọn, VD: H-001)

  -- Nguồn lấy hàng
  nguon_ten       TEXT NOT NULL,                 -- tên đối tác / điểm lấy
  nguon_dia_chi   TEXT,                          -- địa chỉ điểm lấy
  nguon_sdt       TEXT,                          -- SĐT liên hệ tại điểm lấy

  -- Nội dung hàng hồi
  loai_hang       TEXT,                          -- mô tả hàng: "Giấy A4 trả lại", "Hàng lỗi", "Hàng đổi trả"...
  so_luong_thung  INTEGER DEFAULT 0,             -- số thùng nhận
  so_kg           NUMERIC(10,2),                 -- khối lượng kg (tuỳ chọn)
  ghi_chu         TEXT,

  -- Phân công
  lai_xe          TEXT,                          -- tên lái xe (khớp với drivers.ten)
  ngay_lay        DATE NOT NULL,                 -- ngày lấy hàng (= ngày chuyến)

  -- Trạng thái
  trang_thai      TEXT DEFAULT 'cho_lay'         -- cho_lay | da_lay | huy
                  CHECK (trang_thai IN ('cho_lay','da_lay','huy')),

  -- Metadata
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phieu_hoi_ngay    ON phieu_hoi(ngay_lay DESC);
CREATE INDEX IF NOT EXISTS idx_phieu_hoi_lai_xe  ON phieu_hoi(lai_xe);
CREATE INDEX IF NOT EXISTS idx_phieu_hoi_status  ON phieu_hoi(trang_thai);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_phieu_hoi_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phieu_hoi_updated_at ON phieu_hoi;
CREATE TRIGGER trg_phieu_hoi_updated_at
  BEFORE UPDATE ON phieu_hoi
  FOR EACH ROW EXECUTE FUNCTION update_phieu_hoi_updated_at();

-- RLS
ALTER TABLE phieu_hoi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON phieu_hoi
  FOR ALL USING (true) WITH CHECK (true);
