import { Module } from '@nestjs/common';
import { CharacterVisionController } from './character-vision.controller';
import { CharacterVisionService } from './character-vision.service';

@Module({
  controllers: [CharacterVisionController],
  providers: [CharacterVisionService],
  exports: [CharacterVisionService],
})
export class CharacterVisionModule {}