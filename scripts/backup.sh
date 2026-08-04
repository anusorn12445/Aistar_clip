#!/bin/bash
# AISTAR Talent OS — daily backup
# สำรอง: PostgreSQL (aistar) + ไฟล์ asset (apps/api/storage) + git bundle
# เก็บที่ ~/Backups/aistar/ ลบของเก่าเกิน 30 วันอัตโนมัติ
set -euo pipefail

PROJECT_DIR="/Users/thuspawat/Sites/localhost/aistar"
BACKUP_ROOT="$HOME/Backups/aistar"
STAMP="$(date +%Y%m%d_%H%M)"
DEST="$BACKUP_ROOT/$STAMP"
# path ของ Homebrew Postgres (cron ไม่มี PATH ของ user)
export PATH="/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

mkdir -p "$DEST"

# 1. Database
pg_dump -d aistar | gzip > "$DEST/aistar_db.sql.gz"

# 2. Asset files (รูป/วิดีโอ/export ที่อัปโหลดเข้าระบบ)
if [ -d "$PROJECT_DIR/apps/api/storage" ]; then
  tar -czf "$DEST/storage.tar.gz" -C "$PROJECT_DIR/apps/api" storage
fi

# 3. Git bundle (โค้ดทั้ง repo รวม history — กู้ได้แม้ .git พัง)
git -C "$PROJECT_DIR" bundle create "$DEST/repo.bundle" --all 2>/dev/null || true

# 4. ลบ backup เก่าเกิน 30 วัน
find "$BACKUP_ROOT" -maxdepth 1 -type d -name "20*" -mtime +30 -exec rm -rf {} +

echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup OK → $DEST ($(du -sh "$DEST" | cut -f1))"
