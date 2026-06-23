import PhieuForm from '@/components/PhieuForm';

export default function HomePage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Nhập phiếu xuất hàng</h2>
        <p className="text-sm text-gray-500 mt-1">Điền đầy đủ thông tin rồi bấm Xác nhận để lưu phiếu</p>
      </div>
      <PhieuForm />
    </div>
  );
}
