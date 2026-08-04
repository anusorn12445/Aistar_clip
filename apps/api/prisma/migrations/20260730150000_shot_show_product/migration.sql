-- shot-level product visibility toggle
ALTER TABLE "clip_shots" ADD COLUMN IF NOT EXISTS "showProduct" BOOLEAN NOT NULL DEFAULT true;
