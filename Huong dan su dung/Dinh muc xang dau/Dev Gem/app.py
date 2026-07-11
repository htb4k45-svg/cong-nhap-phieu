import os
import subprocess
import re
from pypdf import PdfReader
from flask import Flask, render_template_string, redirect, url_for

app = Flask(__name__)

DATA_DIR = "/app/data"
OUTPUT_DIR = "/app/extracted_files" # Thư mục chứa thành phẩm cuối cùng

def giai_nen_file(file_path, target_dir):
    """Gọi 7z giải nén trực tiếp vào thư mục chỉ định"""
    try:
        subprocess.run(["7z", "x", "-y", "-aoa", file_path, f"-o{target_dir}"], check=True)
        return True
    except Exception as e:
        print(f"Lỗi khi giải nén {file_path}: {e}")
        return False

def xu_ly_kho_hoa_don():
    """Thuật toán quét an toàn: Không lo lặp vô hạn, không lo treo server"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    # Bước 1: Quét tìm tất cả file nén hiện có trong data đem đi giải nén tầng 1
    for root, dirs, files in os.walk(DATA_DIR):
        for file in files:
            file_lower = file.lower()
            if file_lower.endswith('.rar') or file_lower.endswith('.zip'):
                full_path = os.path.join(root, file)
                giai_nen_file(full_path, OUTPUT_DIR)
                try:
                    os.remove(full_path) # Xóa file gốc trong data để dọn dẹp
                except:
                    pass

    # Bước 2: Quét thư mục thành phẩm, nếu phát hiện có file zip/rar con lồng bên trong thì bóc tiếp tầng 2
    quet_tiep = True
    while quet_tiep:
        quet_tiep = False
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for file in files:
                file_lower = file.lower()
                if file_lower.endswith('.rar') or file_lower.endswith('.zip'):
                    full_path = os.path.join(root, file)
                    giai_nen_file(full_path, OUTPUT_DIR) # Giải nén bung tiếp ra cùng thư mục
                    try:
                        os.remove(full_path) # Xóa vỏ nén con
                    except:
                        pass
                    quet_tiep = True # Nếu còn file nén con thì lặp lại để lột tiếp

def trich_xuat_mst_tu_pdf(pdf_path):
    try:
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        
        mst_match = re.search(r'(?:Mã số thuế|MST)[:\s]+([0-9]{10}(?:-[0-9]{3})?)', text, re.IGNORECASE)
        if mst_match:
            return mst_match.group(1)
        
        numbers = re.findall(r'\b[0-9]{10}\b', text)
        if numbers:
            return numbers[0]
        return "Không tìm thấy"
    except:
        return "Lỗi đọc PDF"

@app.route('/')
def index():
    danh_sach_hoa_don = []
    
    # Quét thư mục thành phẩm cuối cùng để hiển thị lên bảng
    if os.path.exists(OUTPUT_DIR):
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for f in files:
                f_lower = f.lower()
                if f_lower.endswith('.pdf') or f_lower.endswith('.xml'):
                    full_path = os.path.join(root, f)
                    relative_path = os.path.relpath(full_path, OUTPUT_DIR)
                    mst = trich_xuat_mst_tu_pdf(full_path) if f_lower.endswith('.pdf') else "Dữ liệu XML"
                    
                    danh_sach_hoa_don.append({
                        "file_name": relative_path,
                        "loai_file": f_lower.split('.')[-1].upper(),
                        "mst": mst
                    })
            
    html_template = """
    <!DOCTYPE html>
    <html>
        <head>
            <title>Xăng Xe Local Server</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; margin: 40px; background: #f4f6f9; }
                .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); max-width: 1000px; margin: 0 auto; }
                h2 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
                .btn { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; font-weight: bold; border: none; cursor: pointer; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { background-color: #f8fafc; }
                .text-mono { font-family: monospace; font-weight: bold; }
                .badge-pdf { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
                .badge-xml { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Hệ thống giải nén & Trích xuất Hóa đơn - Xăng Xe</h2>
                <p><b>Trạng thái:</b> <span style="color: green; font-weight: bold;">Docker Local vận hành an toàn</span></p>
                <p><b>Tổng số file bóc tách thành công:</b> <span style="color: #2563eb; font-weight: bold; font-size: 18px;">{{ data|length }} file</span></p>
                
                <a href="/scan" class="btn" onclick="this.innerHTML='🔄 Đang xử lý bóc tách đa tầng... Xin vui lòng đợi...';">⚡ BẤM VÀO ĐÂY ĐỂ GIẢI NÉN VÀ QUÉT LẠI</a>
                
                <table>
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Định dạng</th>
                            <th>Tên File Thành Phẩm</th>
                            <th>Thông tin trích xuất (MST)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% if data %}
                            {% for item in data %}
                            <tr>
                                <td>{{ loop.index }}</td>
                                <td>
                                    <span class="badge-{{ item.loai_file.lower() }}">{{ item.loai_file }}</span>
                                </td>
                                <td>{{ item.file_name }}</td>
                                <td class="text-mono">{{ item.mst }}</td>
                            </tr>
                            {% endfor %}
                        {% else %}
                            <tr>
                                <td colspan="4" style="text-align: center; color: #94a3b8; padding: 30px;">
                                    Chưa có dữ liệu thành phẩm. Anh hãy ném file .rar/.zip vào thư mục data rồi bấm nút xanh ở trên nhé!
                                </td>
                            </tr>
                        {% endif %}
                    </tbody>
                </table>
            </div>
        </body>
    </html>
    """
    return render_template_string(html_template, data=danh_sach_hoa_don)

@app.route('/scan')
def scan():
    xu_ly_kho_hoa_don()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)