// Export พรอมป์/สูตรคลิปที่แก้เอง จาก system_settings (postgres) → prompt-overrides/ugc-settings.json
// ใช้: node scripts/export-prompt-overrides.js [outDir=prompt-overrides]
// ต้องมี: postgres รันที่ localhost:5432 + `npm i pg` (หรือใช้ pg จาก apps/api)
// อ่าน DATABASE_URL จาก env, ไม่งั้น fallback ค่า dev เดิม
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const OUT_DIR = process.argv[2] || 'prompt-overrides';
const DB = process.env.DATABASE_URL || 'postgresql://aistar:aistar@localhost:5432/aistar';
const SENSITIVE = /(key|secret|token|password|apikey|api_key|credential)/i;

(async () => {
  const c = new Client({ connectionString: DB });
  await c.connect();
  const r = await c.query(
    `SELECT key, value FROM system_settings
     WHERE key LIKE 'ugc.%' AND ("isSecret" IS NULL OR "isSecret" = false)
     ORDER BY key`,
  );
  await c.end();

  const rows = r.rows.filter((row) => !SENSITIVE.test(row.key));
  const parseVal = (v) => { try { return JSON.parse(v); } catch { return v; } };

  const groups = { templates: {}, perJob: {}, other: {} };
  for (const row of rows) {
    const val = parseVal(row.value);
    if (/\.overrides$|\.hidden$/.test(row.key)) groups.templates[row.key] = val;
    else if (/^ugc\.(scenelen|shotfix)\./.test(row.key)) groups.perJob[row.key] = val;
    else groups.other[row.key] = val;
  }

  const out = {
    _meta: {
      exportedFrom: 'system_settings (postgres)',
      note: 'พรอมป์/สูตรคลิปที่แก้เองผ่านหน้าแอป — backup จาก database (ไม่รวม secret)',
      counts: {
        templates: Object.keys(groups.templates).length,
        perJob: Object.keys(groups.perJob).length,
        other: Object.keys(groups.other).length,
      },
    },
    templateOverrides: groups.templates,
    perJobOverrides: groups.perJob,
    otherUgcSettings: groups.other,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'ugc-settings.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', file, JSON.stringify(out._meta.counts));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
