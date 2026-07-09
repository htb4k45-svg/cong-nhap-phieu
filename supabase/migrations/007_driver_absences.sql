-- ============================================================
-- Bảng lịch nghỉ / hỏng xe của lái xe & phụ xe
-- Khác với drivers.active (vô hiệu hoá vĩnh viễn): đây là tạm
-- ngừng theo khoảng ngày, tự động hết hiệu lực sau ngay_den.
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_absences (
  id          BIGSERIAL PRIMARY KEY,
  driver_id   BIGINT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ngay_tu     DATE NOT NULL,                 -- ngày bắt đầu nghỉ
  ngay_den    DATE NOT NULL,                 -- ngày kết thúc nghỉ (>= ngay_tu)
  ly_do       TEXT,                          -- "Hỏng xe", "Nghỉ phép", ...
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CHECK (ngay_den >= ngay_tu)
);

CREATE INDEX IF NOT EXISTS idx_driver_absences_driver ON driver_absences(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_absences_range  ON driver_absences(ngay_tu, ngay_den);

ALTER TABLE driver_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON driver_absences
  FOR ALL USING (true) WITH CHECK (true);
