import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CharacterVisionService } from './character-vision.service';

@Controller('characters')
export class CharacterVisionController {
  constructor(private readonly vision: CharacterVisionService) {}

  /**
   * POST /api/characters/analyze-image
   * multipart/form-data — field "image" (jpg/png/webp, สูงสุด 10MB)
   */
  @Post('analyze-image')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async analyzeImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์รูป');
    if (!file.mimetype.startsWith('image/'))
      throw new BadRequestException('รองรับเฉพาะไฟล์รูปภาพ');

    const data = await this.vision.analyzeFromImage(
      file.buffer.toString('base64'),
      file.mimetype,
    );
    return { ok: true, data };
  }
}
