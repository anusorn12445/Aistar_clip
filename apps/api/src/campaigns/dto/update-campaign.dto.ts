import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {
  // optimistic locking (§F.1 ข้อ 6)
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
