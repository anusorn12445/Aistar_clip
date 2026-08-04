import { IsString, IsUUID } from 'class-validator';

export class ContinuityCheckDto {
  @IsUUID()
  episodeId!: string;
}

export class NextEpisodeDto {
  @IsString()
  season!: string;
}
