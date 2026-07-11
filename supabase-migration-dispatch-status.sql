-- ============================================================
-- MIGRATION: Bảng theo dõi trạng thái giao hàng realtime
-- Dữ liệu gốc lấy từ Google Sheets, bảng này chỉ lưu trạng thái
-- Chạy trong Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS dispatch_status (
  row_key    TEXT PRIMARY KEY,  -- ma_lenh (MT) hoặc so_phieu (B2B)
  bo_phan    TEXT,
  ngay_giao  DATE,
  trang_thai TEXT DEFAULT 'cho_giao'
    CHECK (trang_thai IN ('cho_giao', 'dang_giao', 'da_giao', 'huy')),
  ghi_chu    TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dispatch_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON dispatch_status FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dispatch_ngay_giao ON dispatch_status(ngay_giao);
