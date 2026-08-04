import { AssetStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeAssetStatusDto {
  @IsEnum(AssetStatus)
  status!: AssetStatus;
}
