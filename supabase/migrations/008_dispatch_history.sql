-- ============================================================
-- MIGRATION 008: Lịch sử điều xe — snapshot toàn bộ thông tin đơn hàng
-- Mục đích: lưu vĩnh viễn dữ liệu đơn hàng tại thời điểm chốt chuyến,
--           tránh mất dữ liệu khi Google Sheet được sửa/xóa cuối tháng.
-- Chạy trong Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS dispatch_history (
  id              BIGSERIAL    PRIMARY KEY,

  -- Định danh đơn hàng
  row_key         TEXT         NOT NULL,   -- ma_lenh (MT) hoặc so_phieu (B2B)
  so_phieu        TEXT,
  ma_lenh         TEXT,
  bo_phan         TEXT,                    -- 'MT' | 'B2B' | 'GT'

  -- Thời gian
  ngay_giao       DATE,                    -- ngày giao kế hoạch
  da_giao_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),  -- thời điểm chốt thực tế

  -- Phân công
  lai_xe          TEXT,
  giao_nhan       TEXT,                    -- phụ xe / giao nhận
  ghi_chu_giao    TEXT,                    -- ghi chú riêng từng đơn (VD: "thiếu 2 thùng A4")

  -- Thông tin khách hàng (snapshot từ Google Sheet)
  ma_kh           TEXT,
  ten_kh          TEXT,
  dia_chi_giao    TEXT,
  khu_vuc         TEXT,

  -- Hàng hóa
  san_pham        JSONB,                   -- array: [{ma_sp, ten_sp, so_luong, so_luong_thung}]
  tong_thung      NUMERIC      DEFAULT 0,
  tong_kg         NUMERIC      DEFAULT 0,

  -- Metadata đơn
  don_gap         BOOLEAN      DEFAULT false,
  ngay_len_don    DATE,                    -- ngày tạo đơn từ sheet

  -- Raw snapshot toàn bộ object phieu (để tra cứu bất kỳ field nào về sau)
  snapshot_data   JSONB,

  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Index tra cứu phổ biến
CREATE INDEX IF NOT EXISTS idx_dh_ngay_giao  ON dispatch_history(ngay_giao DESC);
CREATE INDEX IF NOT EXISTS idx_dh_lai_xe     ON dispatch_history(lai_xe);
CREATE INDEX IF NOT EXISTS idx_dh_row_key    ON dispatch_history(row_key);
CREATE INDEX IF NOT EXISTS idx_dh_bo_phan    ON dispatch_history(bo_phan);
CREATE INDEX IF NOT EXISTS idx_dh_ten_kh     ON dispatch_history(ten_kh);
CREATE INDEX IF NOT EXISTS idx_dh_da_giao_at ON dispatch_history(da_giao_at DESC);

-- RLS
ALTER TABLE dispatch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON dispatch_history FOR ALL USING (true) WITH CHECK (true);
