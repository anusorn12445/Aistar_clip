import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { VoicesController } from './voices/voices.controller';
import { VoicesService } from './voices/voices.service';
import { RightsController } from './rights/rights.controller';
import { RightsService } from './rights/rights.service';
import { QcController } from './qc/qc.controller';
import { QcService } from './qc/qc.service';

// Library wave: Locations (§14) / Voice Profiles (§15) / Rights (§16) / QC Reviews (§10)
@Module({
  imports: [AuthModule],
  controllers: [LocationsController, VoicesController, RightsController, QcController],
  providers: [LocationsService, VoicesService, RightsService, QcService],
})
export class LibraryModule {}
