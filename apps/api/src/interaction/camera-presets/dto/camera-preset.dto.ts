import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

// Camera Library (SRS §3.6) — คลังมุมกล้อง reference สำหรับประกอบ prompt (human-curated, ไม่มี AI)
export class CreateCameraPresetDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() shotSize?: string;
  @IsOptional() @IsString() angle?: string;
  @IsOptional() @IsString() lens?: string;
  @IsOptional() @IsString() focalLength?: string;
  @IsOptional() @IsString() cameraMovement?: string;
  @IsOptional() @IsString() movementSpeed?: string;
  @IsOptional() @IsString() distance?: string;
  @IsOptional() @IsString() focusTarget?: string;
  @IsOptional() @IsString() depthOfField?: string;
  @IsOptional() @IsString() stabilization?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsString() safeArea?: string;
  @IsOptional() @IsIn(['required', 'optional', 'hero']) productVisibility?: string;
  @IsOptional() @IsIn(['required', 'optional', 'hidden']) handVisibility?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) compatiblePackaging?: string[];
  @IsOptional() @IsString() promptTemplate?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}

export class UpdateCameraPresetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() shotSize?: string;
  @IsOptional() @IsString() angle?: string;
  @IsOptional() @IsString() lens?: string;
  @IsOptional() @IsString() focalLength?: string;
  @IsOptional() @IsString() cameraMovement?: string;
  @IsOptional() @IsString() movementSpeed?: string;
  @IsOptional() @IsString() distance?: string;
  @IsOptional() @IsString() focusTarget?: string;
  @IsOptional() @IsString() depthOfField?: string;
  @IsOptional() @IsString() stabilization?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsString() safeArea?: string;
  @IsOptional() @IsIn(['required', 'optional', 'hero']) productVisibility?: string;
  @IsOptional() @IsIn(['required', 'optional', 'hidden']) handVisibility?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) compatiblePackaging?: string[];
  @IsOptional() @IsString() promptTemplate?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}
