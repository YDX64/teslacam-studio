#!/bin/bash
# TeslaCam Viewer - Tek tıkla başlat
# Bu dosyayı Finder'dan çift tıkla çalıştırabilirsiniz.

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/viewer" || exit 1

echo ""
echo "  🚗  TeslaCam Viewer başlatılıyor..."
echo "  ────────────────────────────────────"
echo "  Klasör: $DIR"
echo ""

# Python kontrolü
if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display alert "Python 3 bulunamadı" message "Lütfen python3 yükleyin:\nbrew install python3\nveya https://python.org adresinden indirin." as critical'
  exit 1
fi

python3 server.py

echo ""
echo "Pencereyi kapatabilirsiniz."
read -p "Çıkmak için Enter'a basın..."
