import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ProductImportService } from './import/product-import.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// override โปรไฟล์ (ผู้ใช้ยืนยันเครื่องมือ/variant เอง) — ไม่ส่ง = auto-detect
class ImportOverrideDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}

@Controller('products/import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductImportController {
  constructor(private importer: ProductImportService) {}

  // preview: parse + detect + map ~10 แถวแรก (ไม่บันทึกลงฐาน)
  @Post('preview')
  @RequirePermission('product', 'C')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }),
  )
  preview(@UploadedFile() file: Express.Multer.File) {
    return this.importer.preview(file);
  }

  // import: parse ทั้งไฟล์ → upsert by externalItemId
  @Post()
  @RequirePermission('product', 'C')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }),
  )
  import(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportOverrideDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.importer.import(file, { platform: dto.platform, sourceType: dto.sourceType }, user);
  }
}
