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
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ProductsService } from './products.service';
import { AffiliateImportService } from './affiliate-import.service';
import { ReviewBriefAiService } from './review-brief-ai.service';
import { AnalyzeProductSheetDto, ProductSheetAiService } from './product-sheet-ai.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ExtractReviewBriefDto } from './dto/review-brief.dto';

class ChangeProductStatusDto {
  @IsIn(['active', 'paused', 'discontinued'])
  status!: string;
}

// bulk ทุก endpoint จำกัด 100 ids ต่อครั้ง — กันยิงถล่ม DB ก้อนเดียว
class BulkIdsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องเลือกอย่างน้อย 1 รายการ' })
  @ArrayMaxSize(100, { message: 'เลือกได้สูงสุด 100 รายการต่อครั้ง' })
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

class BulkSetCategoryDto extends BulkIdsDto {
  @IsString()
  @IsNotEmpty()
  category!: string;
}

class BulkSetBrandDto extends BulkIdsDto {
  // brandId ไม่ส่ง/ส่ง null = ล้างแบรนด์ออก
  @IsOptional()
  @IsUUID()
  brandId?: string | null;
}

class AffiliateImportDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'ต้องวางอย่างน้อย 1 ลิงก์' })
  @ArrayMaxSize(50, { message: 'วางได้สูงสุด 50 ลิงก์ต่อครั้ง' })
  @IsString({ each: true })
  urls!: string[];

  @IsOptional()
  @IsString()
  categoryKey?: string;
}

@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(
    private products: ProductsService,
    private affiliateImport: AffiliateImportService,
    private reviewBriefAi: ReviewBriefAiService,
    private productSheetAi: ProductSheetAiService,
  ) {}

  // วางลิงก์ affiliate หลายตัว (สูงสุด 50) → ดึง OG สร้างสินค้าให้เอง (best-effort)
  @Post('affiliate-import')
  @RequirePermission('product', 'C')
  importAffiliateLinks(@Body() dto: AffiliateImportDto, @CurrentUser() user: AuthUser) {
    return this.affiliateImport.importLinks(dto.urls, dto.categoryKey, user);
  }

  @Get()
  @RequirePermission('product', 'V')
  list(
    @Query('q') q?: string,
    @Query('brandId') brandId?: string,
    @Query('category') category?: string,
    @Query('claimRiskLevel') claimRiskLevel?: string,
    @Query('status') status?: string,
    @Query('isAffiliate') isAffiliate?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('archived') archived?: string,
  ) {
    return this.products.list({
      q,
      brandId,
      category,
      claimRiskLevel,
      status,
      // isAffiliate=1|0 (string) → boolean; ไม่ส่ง = ไม่กรอง
      isAffiliate: isAffiliate == null ? undefined : isAffiliate === '1' || isAffiliate === 'true',
      priceMin: priceMin ? parseFloat(priceMin) : undefined,
      priceMax: priceMax ? parseFloat(priceMax) : undefined,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      // archived=1 → มุมมองกรุ (เฉพาะที่เก็บถาวร); ไม่ส่ง = ซ่อนที่เก็บถาวร (เดิม)
      archived: archived === '1' || archived === 'true',
    });
  }

  // ── Bulk operations (ต้องมาก่อน route ':id/...' — กัน 'bulk' โดน parse เป็น uuid) ──

  @Post('bulk/archive')
  @RequirePermission('product', 'C')
  bulkArchive(@Body() dto: BulkIdsDto, @CurrentUser() user: AuthUser) {
    return this.products.bulkArchive(dto.ids, user);
  }

  @Post('bulk/restore')
  @RequirePermission('product', 'C')
  bulkRestore(@Body() dto: BulkIdsDto, @CurrentUser() user: AuthUser) {
    return this.products.bulkRestore(dto.ids, user);
  }

  @Post('bulk/set-category')
  @RequirePermission('product', 'C')
  bulkSetCategory(@Body() dto: BulkSetCategoryDto, @CurrentUser() user: AuthUser) {
    return this.products.bulkSetCategory(dto.ids, dto.category, user);
  }

  @Post('bulk/set-brand')
  @RequirePermission('product', 'C')
  bulkSetBrand(@Body() dto: BulkSetBrandDto, @CurrentUser() user: AuthUser) {
    return this.products.bulkSetBrand(dto.ids, dto.brandId ?? null, user);
  }

  @Get(':id')
  @RequirePermission('product', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  @RequirePermission('product', 'C')
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('product', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.update(id, dto, user);
  }

  // AI แตกฟิลด์ Review Brief จากข้อความหน้า Shopee (+รูปในคลังสูงสุด 4 รูป)
  // ไม่ auto-save — frontend โชว์ preview แล้วค่อย PATCH { reviewBrief } กลับมา
  // 🧩 Product Sheet — AI แตกสินค้าจากรูปเป็นส่วนประกอบ+สถานะ (Flow-ready) — วิเคราะห์แล้วบันทึกทันที
  @Get(':id/sheet')
  @RequirePermission('product', 'V')
  getProductSheet(@Param('id', ParseUUIDPipe) id: string) {
    return this.productSheetAi.getSheet(id);
  }

  @Post(':id/sheet/analyze')
  @RequirePermission('product', 'C')
  analyzeProductSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnalyzeProductSheetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productSheetAi.analyze(id, dto, user);
  }

  @Post(':id/review-brief/extract')
  @RequirePermission('product', 'C')
  extractReviewBrief(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtractReviewBriefDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviewBriefAi.extract(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('product', 'C')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeProductStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.changeStatus(id, dto.status, user);
  }

  @Post(':id/archive')
  @RequirePermission('product', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.archive(id, user);
  }

  @Post(':id/restore')
  @RequirePermission('product', 'C')
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.restore(id, user);
  }

  // ลบถาวร — admin (X) เท่านั้น; มีงานอ้างอิง → 409 พร้อมรายการนับต่อประเภท
  @Delete(':id')
  @RequirePermission('product', 'X')
  hardDelete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.hardDelete(id, user);
  }
}
