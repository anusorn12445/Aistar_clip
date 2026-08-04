import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { AiModule } from '../ai/ai.module';
import { BrandsController } from './brands.controller';
import { PublicBrandBookController } from './public-brand-book.controller';
import { BrandsService } from './brands.service';
import { BrandKnowledgeService } from './brand-knowledge.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AffiliateImportService } from './affiliate-import.service';
import { ProductImportController } from './product-import.controller';
import { ProductImportService } from './import/product-import.service';
import { ReviewBriefAiService } from './review-brief-ai.service';
import { ProductSheetAiService } from './product-sheet-ai.service';

@Module({
  // AiModule — ReviewBriefAiService ใช้ AiClaudeService (AI แตกฟิลด์ Review Brief)
  imports: [AuthModule, AssetsModule, AiModule],
  // PublicBrandBookController = ลิงก์แชร์ Brand Book (จงใจไม่มี auth guard — ดู comment ในไฟล์)
  controllers: [
    BrandsController,
    PublicBrandBookController,
    CategoriesController,
    ProductsController,
    ProductImportController,
  ],
  providers: [
    BrandsService,
    BrandKnowledgeService,
    CategoriesService,
    ProductsService,
    AffiliateImportService,
    ProductImportService,
    ReviewBriefAiService,
    ProductSheetAiService,
  ],
  // BrandKnowledgeService.buildBrandContext — Content Intelligence ระบบ 2/3/4 พึ่งตัวนี้
  exports: [ProductsService, BrandKnowledgeService],
})
export class ProductsModule {}
