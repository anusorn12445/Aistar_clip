import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AssetStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CreateAssetLinkDto } from './dto/create-asset-link.dto';
import { ChangeAssetStatusDto } from './dto/change-asset-status.dto';
import { ImportAssetUrlDto } from './dto/import-asset-url.dto';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB (AC-3)

@Controller('assets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssetsController {
  constructor(private assets: AssetsService) {}

  @Post()
  @RequirePermission('asset', 'C')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }),
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.create(file, dto, user);
  }

  // ลากรูปจากเว็บอื่น (ได้ URL) → server fetch แล้วเก็บเหมือน upload — https เท่านั้น,
  // บล็อก private host (SSRF), image/* ≤10MB, default linkRole 'review_image'
  @Post('import-url')
  @RequirePermission('asset', 'C')
  importUrl(@Body() dto: ImportAssetUrlDto, @CurrentUser() user: AuthUser) {
    return this.assets.importFromUrl(dto, user);
  }

  // ย้ายไฟล์เดิม local → R2 (admin-only, permission asset X) — รันครั้งเดียวหลังตั้งค่า R2
  @Post('migrate-to-r2')
  @RequirePermission('asset', 'X')
  migrateToR2(@CurrentUser() user: AuthUser) {
    return this.assets.migrateToR2(user);
  }

  @Get()
  @RequirePermission('asset', 'V')
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('assetType') assetType?: string,
    @Query('status') status?: AssetStatus,
    @Query('page') page?: string,
  ) {
    return this.assets.list({
      entityType,
      entityId,
      assetType,
      status,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // batch thumbnail lookup — ต้องประกาศก่อน :id ไม่งั้น "thumbnails" โดน ParseUUIDPipe ตีตก
  // TODO(security): enforce parent row-scope on asset stream — phase 2
  // (asset ที่ผูกกับ content/image-request ที่ scope ยังเข้าถึงได้โดยไม่เช็ค scope ของ parent row)
  @Get('thumbnails')
  @RequirePermission('asset', 'V')
  thumbnails(@Query('entityType') entityType?: string, @Query('ids') ids?: string) {
    const idList = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.assets.thumbnails(entityType ?? '', idList);
  }

  // ⬇️ โหลดทุกไฟล์ของ entity เป็น zip เดียว (เช่น Asset Gallery ของตัวละคร) — stream ไม่กินแรม
  @Get('zip/:entityType/:entityId')
  @RequirePermission('asset', 'V')
  async downloadZip(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Res() res: Response,
  ) {
    const { archive } = await this.assets.createEntityZip(entityType, entityId);
    const filename = `${entityType}_${entityId.slice(0, 8)}_assets.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    archive.pipe(res);
    await archive.finalize();
  }

  @Get(':id')
  @RequirePermission('asset', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(id);
  }

  // TODO(security): enforce parent row-scope on asset stream — phase 2
  // (asset ที่ผูกกับ content/image-request ที่ scope ยังสตรีมได้โดยไม่เช็ค scope ของ parent row)
  @Get(':id/file')
  @RequirePermission('asset', 'V')
  async file(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { stream, mimeType, originalFilename, fileSize } = await this.assets.getFileStream(id);
    // filename อาจเป็นไทย — ใช้ RFC 5987 filename* กัน header พัง
    const encoded = encodeURIComponent(originalFilename).replace(/['()]/g, escape);
    return new StreamableFile(stream, {
      type: mimeType,
      length: fileSize,
      disposition: `inline; filename*=UTF-8''${encoded}`,
    });
  }

  @Post(':id/links')
  @RequirePermission('asset', 'C')
  addLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAssetLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.addLink(id, dto, user);
  }

  @Delete(':id/links/:linkId')
  @RequirePermission('asset', 'C')
  removeLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.removeLink(id, linkId, user);
  }

  @Patch(':id/status')
  @RequirePermission('asset', 'V') // สิทธิ์ A เช็คละเอียดใน service ตาม state machine
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAssetStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.changeStatus(id, dto.status, user);
  }
}
