import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SettingsService } from '../settings/settings.service';

// interface กลาง — สลับ backend (local disk / R2) ได้โดยไม่แตะ service อื่น
// read เป็น async เพราะ S3/R2 อ่านแบบ network (คืน stream.Readable)
export interface StorageDriver {
  save(buffer: Buffer, key: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

// เลือก backend ใหม่ทุก ๆ TTL — ให้แก้ค่าในหน้า Settings แล้วมีผลไว (align กับ SettingsService cache 30s)
const DRIVER_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Local-disk driver — เก็บใต้ STORAGE_DIR (default ./storage), กัน path traversal
// ---------------------------------------------------------------------------
export class LocalStorageDriver implements StorageDriver {
  private readonly baseDir = process.env.STORAGE_DIR ?? './storage';

  private resolve(key: string): string {
    // key ต้องอยู่ใต้ baseDir เสมอ
    const path = normalize(join(this.baseDir, key));
    if (!path.startsWith(normalize(this.baseDir))) {
      throw new Error(`storage key ไม่ถูกต้อง: ${key}`);
    }
    return path;
  }

  async save(buffer: Buffer, key: string): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
  }

  async getStream(key: string): Promise<Readable> {
    // fs.ReadStream เป็น Readable อยู่แล้ว — ห่อใน promise ให้เข้ากับ interface
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key));
  }

  /** อ่านทั้งไฟล์เป็น Buffer — คืน null ถ้าไฟล์หาย (ใช้ตอน migrate) */
  async readBuffer(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Cloudflare R2 driver (S3-compatible)
// ---------------------------------------------------------------------------
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2StorageDriver implements StorageDriver {
  private readonly client: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async save(buffer: Buffer, key: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: buffer }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
    // ใน Node runtime Body เป็น stream.Readable เสมอ
    return res.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
  }
}

// ---------------------------------------------------------------------------
// Facade — resolve active driver ต่อ operation: R2 ถ้าตั้งค่าครบ, ไม่งั้น local
// assets.service เรียก save/getStream/delete เหมือนเดิม (facade dispatch ให้)
// ---------------------------------------------------------------------------
@Injectable()
export class StorageService implements StorageDriver {
  private readonly logger = new Logger(StorageService.name);
  private readonly local = new LocalStorageDriver();

  // cache การเลือก driver สั้น ๆ กันการ resolve config ทุก request
  private cached?: { driver: StorageDriver; backend: 'r2' | 'local'; at: number };
  // cache S3 client ตาม signature ของ config — สร้างใหม่เฉพาะตอน config เปลี่ยน (rotate key/bucket)
  private r2Cache?: { driver: R2StorageDriver; signature: string };
  private loggedBackend?: 'r2' | 'local';

  constructor(
    // optional เผื่อ SettingsModule ยังไม่ถูก register — fallback ไป process.env
    @Optional() private settings?: SettingsService,
  ) {}

  // ---- StorageDriver dispatch --------------------------------------------
  async save(buffer: Buffer, key: string): Promise<void> {
    return (await this.activeDriver()).save(buffer, key);
  }

  async getStream(key: string): Promise<Readable> {
    return (await this.activeDriver()).getStream(key);
  }

  async delete(key: string): Promise<void> {
    return (await this.activeDriver()).delete(key);
  }

  // ---- driver selection ---------------------------------------------------
  private async activeDriver(): Promise<StorageDriver> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < DRIVER_TTL_MS) {
      return this.cached.driver;
    }

    const cfg = await this.resolveR2Config();
    let entry: { driver: StorageDriver; backend: 'r2' | 'local'; at: number };
    if (cfg) {
      entry = { driver: this.buildOrGetR2(cfg), backend: 'r2', at: now };
    } else {
      entry = { driver: this.local, backend: 'local', at: now };
    }
    this.cached = entry;

    if (this.loggedBackend !== entry.backend) {
      // log ครั้งเดียวตอนเปลี่ยน backend — ไม่ log secret ใด ๆ
      this.logger.log(`active storage backend: ${entry.backend}`);
      this.loggedBackend = entry.backend;
    }
    return entry.driver;
  }

  private buildOrGetR2(cfg: R2Config): R2StorageDriver {
    // signature = hash ของ config (รวม secret) → rotate แล้วสร้าง client ใหม่ แต่ไม่เก็บ secret เป็น plain
    const signature = createHash('sha256')
      .update([cfg.accountId, cfg.accessKeyId, cfg.secretAccessKey, cfg.bucket].join('|'))
      .digest('hex');
    if (this.r2Cache && this.r2Cache.signature === signature) {
      return this.r2Cache.driver;
    }
    const driver = new R2StorageDriver(cfg);
    this.r2Cache = { driver, signature };
    return driver;
  }

  /** อ่านค่า setting (DB→env) — ถ้าไม่มี SettingsService ให้ fallback process.env ตรง ๆ */
  private async setting(key: string): Promise<string | undefined> {
    if (this.settings) return this.settings.get(key);
    const v = process.env[key];
    return v && v.trim() ? v : undefined;
  }

  /** คืน R2 config ถ้าตั้งค่าครบทั้ง 4 ตัว (account/access/secret/bucket) ไม่งั้น null */
  private async resolveR2Config(): Promise<R2Config | null> {
    const [accountId, accessKeyId, secretAccessKey, bucket] = await Promise.all([
      this.setting('R2_ACCOUNT_ID'),
      this.setting('R2_ACCESS_KEY_ID'),
      this.setting('R2_SECRET_ACCESS_KEY'),
      this.setting('R2_BUCKET'),
    ]);
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
    return {
      accountId: accountId.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucket: bucket.trim(),
    };
  }

  // ---- helpers ใช้ตอน migrate --------------------------------------------
  /** true ถ้า R2 ตั้งค่าครบ (พร้อมใช้งาน) */
  async isR2Configured(): Promise<boolean> {
    return (await this.resolveR2Config()) !== null;
  }

  /** คืน R2 driver ตรง ๆ (bypass การเลือก backend) — null ถ้ายังไม่ตั้งค่า R2 */
  async getR2Driver(): Promise<R2StorageDriver | null> {
    const cfg = await this.resolveR2Config();
    return cfg ? this.buildOrGetR2(cfg) : null;
  }

  /** คืน local driver ตรง ๆ — ใช้อ่านไฟล์เดิมจาก disk ตอน migrate */
  getLocalDriver(): LocalStorageDriver {
    return this.local;
  }
}
