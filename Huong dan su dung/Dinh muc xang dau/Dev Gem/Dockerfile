FROM python:3.9-slim

# Cài đặt unrar và các công cụ hệ thống cần thiết từ kho non-free của Debian
RUN apt-get update && apt-get install -y \
    unrar-free \
    p7zip-full \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Sử dụng Gunicorn làm máy chủ Production bền bỉ
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]