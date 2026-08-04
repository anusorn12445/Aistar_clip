import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterBlueprintsController } from './character-blueprints.controller';
import { CharacterBlueprintsService } from './character-blueprints.service';
import { CharacterCategoriesController } from './character-categories.controller';
import { CharacterCategoriesService } from './character-categories.service';
import { CharacterSectionsController } from './character-sections.controller';
import { CharacterSectionsService } from './character-sections.service';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  imports: [AuthModule],
  controllers: [
    CharactersController,
    CharacterSectionsController,
    CharacterCategoriesController,
    CharacterBlueprintsController,
    CreatorsController,
    TagsController,
  ],
  providers: [
    CharactersService,
    CharacterCategoriesService,
    CharacterBlueprintsService,
    CharacterSectionsService,
    CreatorsService,
    TagsService,
  ],
  exports: [CharacterBlueprintsService],
})
export class CharactersModule {}
