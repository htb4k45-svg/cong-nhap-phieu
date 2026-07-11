"""
Giải nén toàn bộ hóa đơn PDF từ archive (ZIP / RAR / 7z / v.v.)
Dùng patoolib — tự động tìm WinRAR, 7-Zip, unrar trên máy.

Cách dùng:
  python giai-nen-hoadon.py "HD HH 062026.zip"
  python giai-nen-hoadon.py "D:\\Downloads\\HD HH 062026.zip"

Yêu cầu:
  pip install patoolib

Kết quả:
  output_pdf/          <- thư mục chứa toàn bộ file PDF
  output_pdf.zip       <- ZIP sạch để upload lên web app (tạo cạnh file gốc)
"""

import sys, os, shutil, zipfile
try:
    import patoolib
except ImportError:
    print("Thiếu thư viện patoolib. Chạy: pip install patoolib")
    sys.exit(1)


def recursive_extract(folder_path):
    """Giải nén đệ quy giống app.py — lặp cho đến khi không còn archive nào."""
    changed = False
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            file_path = os.path.join(root, file)
            if file.lower().endswith(('.zip', '.rar', '.7z', '.tar', '.gz', '.bz2')):
                try:
                    print(f"  → Giải nén: {file}")
                    patoolib.extract_archive(file_path, outdir=root, verbosity=-1)
                    os.remove(file_path)
                    changed = True
                except Exception as e:
                    print(f"  ⚠ Lỗi giải nén {file}: {e}")
    if changed:
        recursive_extract(folder_path)


def collect_pdfs(src_dir, dest_dir):
    """Thu thập tất cả PDF vào thư mục phẳng, tránh trùng tên."""
    count = 0
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.lower().endswith('.pdf'):
                src_path = os.path.join(root, file)
                dest_path = os.path.join(dest_dir, file)
                # Tránh trùng tên
                if os.path.exists(dest_path):
                    base, ext = os.path.splitext(file)
                    i = 1
                    while os.path.exists(dest_path):
                        dest_path = os.path.join(dest_dir, f"{base}_{i}{ext}")
                        i += 1
                shutil.copy2(src_path, dest_path)
                count += 1
    return count


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    src = sys.argv[1]
    if not os.path.exists(src):
        print(f"Không tìm thấy file: {src}")
        sys.exit(1)

    src_abs  = os.path.abspath(src)
    base_dir = os.path.dirname(src_abs)
    temp_dir = os.path.join(base_dir, '__tmp_extract__')
    out_dir  = os.path.join(base_dir, 'output_pdf')
    out_zip  = os.path.join(base_dir, 'output_pdf.zip')

    # Dọn temp
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    print(f"Đang giải nén: {src_abs}")

    # Bước 1: giải nén archive gốc vào temp
    try:
        patoolib.extract_archive(src_abs, outdir=temp_dir, verbosity=-1)
    except Exception as e:
        print(f"Lỗi giải nén tệp đầu vào: {e}")
        sys.exit(1)

    # Bước 2: giải nén đệ quy tất cả archive bên trong
    print("Đang giải nén các archive lồng nhau...")
    recursive_extract(temp_dir)

    # Bước 3: thu thập PDF
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)

    print("Đang thu thập PDF...")
    n = collect_pdfs(temp_dir, out_dir)

    # Bước 4: tạo ZIP sạch
    if os.path.exists(out_zip):
        os.remove(out_zip)
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file in os.listdir(out_dir):
            if file.lower().endswith('.pdf'):
                zf.write(os.path.join(out_dir, file), file)

    # Dọn temp
    shutil.rmtree(temp_dir, ignore_errors=True)

    print()
    print(f"✅ {n} file PDF")
    print(f"   Thư mục: {out_dir}")
    print(f"   ZIP upload: {out_zip}")
    print()
    print("👉 Upload file output_pdf.zip lên web app để đối chiếu hóa đơn.")
