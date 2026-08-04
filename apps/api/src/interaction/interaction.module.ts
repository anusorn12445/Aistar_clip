import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { HandProfilesController } from './hand-profiles/hand-profiles.controller';
import { HandProfilesService } from './hand-profiles/hand-profiles.service';
import { GesturesController } from './gestures/gestures.controller';
import { GesturesService } from './gestures/gestures.service';
import { ProductStatesController } from './product-states/product-states.controller';
import { ProductStatesService } from './product-states/product-states.service';
import { InteractionTemplatesController } from './interaction-templates/interaction-templates.controller';
import { InteractionTemplatesService } from './interaction-templates/interaction-templates.service';
import { CameraPresetsController } from './camera-presets/camera-presets.controller';
import { CameraPresetsService } from './camera-presets/camera-presets.service';
import { LightingPresetsController } from './lighting-presets/lighting-presets.controller';
import { LightingPresetsService } from './lighting-presets/lighting-presets.service';
import { DirectorController } from './director/director.controller';
import { DirectorService } from './director/director.service';

// Product Interaction Library — Slice 1: Hand/Gesture/ProductState + Slice 2: Interaction Templates
//                                + Slice 3: Camera & Lighting Library + Slice 4: AI Director (§3.13)
// AiModule → AiClaudeService (Claude client) · ProductsModule → BrandKnowledgeService/product lookup (Director)
@Module({
  imports: [AuthModule, AiModule, ProductsModule],
  controllers: [
    HandProfilesController,
    GesturesController,
    ProductStatesController,
    InteractionTemplatesController,
    CameraPresetsController,
    LightingPresetsController,
    DirectorController,
  ],
  providers: [
    HandProfilesService,
    GesturesService,
    ProductStatesService,
    InteractionTemplatesService,
    CameraPresetsService,
    LightingPresetsService,
    DirectorService,
  ],
  // additive export — Affiliate Clip Jobs reuse DirectorService.recommend + composePromptPackageFor
  exports: [DirectorService, InteractionTemplatesService],
})
export class InteractionModule {}
