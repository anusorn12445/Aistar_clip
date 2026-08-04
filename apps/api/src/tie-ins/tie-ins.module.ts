import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TieInProductsService } from './tie-in-products.service';
import { CharacterTieInController } from './character-tie-in.controller';
import { SeriesTieInController } from './series-tie-in.controller';
import { LocationTieInController } from './location-tie-in.controller';

// Product Tie-Ins (ไม่บังคับ) — ผูกสินค้าจริงกับ character / series / location
// permission ต่อ entity: character → `character`, series → `episode`, location → `location`
@Module({
  imports: [AuthModule],
  controllers: [
    CharacterTieInController,
    SeriesTieInController,
    LocationTieInController,
  ],
  providers: [TieInProductsService],
})
export class TieInsModule {}
