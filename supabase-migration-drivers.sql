-- ============================================================
-- MIGRATION: Bảng lái xe + cập nhật dispatch_status
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- 1. Bảng danh sách lái xe / phụ xe
CREATE TABLE IF NOT EXISTS drivers (
  id          SERIAL PRIMARY KEY,
  ten         TEXT NOT NULL,          -- Tên hiển thị (VD: "BIÊN", "NHẬT ANH")
  vai_tro     TEXT NOT NULL DEFAULT 'lai_xe'
    CHECK (vai_tro IN ('lai_xe', 'giao_nhan', 'ca_hai')),
  dien_thoai  TEXT,
  ghi_chu     TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read drivers"  ON drivers FOR SELECT USING (true);
CREATE POLICY "Service write drivers" ON drivers FOR ALL USING (true) WITH CHECK (true);

-- 2. Thêm cột phân công lái xe vào dispatch_status
ALTER TABLE dispatch_status
  ADD COLUMN IF NOT EXISTS lai_xe_phan_cong   TEXT,
  ADD COLUMN IF NOT EXISTS giao_nhan_phan_cong TEXT;

-- 3. Seed dữ liệu lái xe ban đầu (điền tên thật vào đây)
-- Vai trò: 'lai_xe' | 'giao_nhan' | 'ca_hai' (vừa lái vừa giao)
INSERT INTO drivers (ten, vai_tro, dien_thoai) VALUES
  ('BIÊN',      'lai_xe',   NULL),
  ('QUANG',     'lai_xe',   NULL),
  ('HUY',       'lai_xe',   NULL),
  ('NHẬT ANH',  'lai_xe',   NULL),
  ('TUYỀN',     'lai_xe',   NULL),
  ('LONG',      'giao_nhan', NULL),
  ('A PHÚ',     'giao_nhan', NULL),
  ('HOÀNG',     'giao_nhan', NULL),
  ('LUÂN',      'giao_nhan', NULL),
  ('TÙNG',      'giao_nhan', NULL),
  ('TIẾN ANH',  'giao_nhan', NULL),
  ('NĂNG',      'giao_nhan', NULL)
ON CONFLICT DO NOTHING;
