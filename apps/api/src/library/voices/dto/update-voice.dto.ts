import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateVoiceDto } from './create-voice.dto';

// ห้ามย้าย voice profile ไป character อื่น
export class UpdateVoiceDto extends PartialType(OmitType(CreateVoiceDto, ['characterId'] as const)) {}
