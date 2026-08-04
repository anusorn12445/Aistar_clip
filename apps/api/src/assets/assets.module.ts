import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { StorageService } from './storage.service';

@Module({
  imports: [AuthModule],
  controllers: [AssetsController],
  providers: [AssetsService, StorageService],
  exports: [AssetsService, StorageService],
})
export class AssetsModule {}
