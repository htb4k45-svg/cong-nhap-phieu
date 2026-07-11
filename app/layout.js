import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Cổng Nhập Phiếu – Văn Phòng Phẩm Hồng Hà',
  description: 'Hệ thống nhập và quản lý phiếu xuất hàng',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center gap-3">
            <div style={{width:40,height:40,background:'#E8151B',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{color:'white',fontWeight:'900',fontSize:14,letterSpacing:1}}>HH</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Cổng Nhập Phiếu</h1>
              <p className="text-xs text-gray-500">Văn Phòng Phẩm Hồng Hà</p>
            </div>
            <nav className="ml-auto flex gap-4 text-sm">
              <Link href="/" className="text-gray-600 hover:text-blue-600 font-medium">📋 Nhập phiếu</Link>
              <Link href="/dieu-xe" className="text-gray-600 hover:text-blue-600 font-medium">🚚 Điều xe</Link>
              <Link href="/lich-su-dieu-xe" className="text-gray-600 hover:text-blue-600 font-medium">🗂 Lịch sử</Link>
              <Link href="/nhien-lieu" className="text-gray-600 hover:text-blue-600 font-medium">⛽ Nhiên liệu</Link>
              <Link href="/import" className="text-gray-600 hover:text-blue-600 font-medium">📤 Import Excel</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-[1800px] mx-auto px-6 py-6">
          {children}
        </main>
        <footer className="mt-12 border-t border-gray-200 py-4 text-center text-xs text-gray-400">
          Văn Phòng Phẩm Hồng Hà © {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
