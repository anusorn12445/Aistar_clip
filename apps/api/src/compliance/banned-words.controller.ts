import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { BannedWordsService } from './banned-words.service';
import {
  AiReviewBannedWordsDto,
  CreateBannedWordDto,
  ListBannedWordsQuery,
  ScanBannedWordsDto,
  UpdateBannedWordDto,
} from './dto/banned-word.dto';

// Banned Words Compliance — คลังคำต้องห้าม (จัดการที่ Settings)
// GET/scan: product V — ทุกคนที่ทำงานคลิป/affiliate อ่าน+สแกนได้ (mirror blueprint read semantics)
// ai-review: product C — คนที่แก้คอนเทนต์ได้ถึงจะเรียก AI ตรวจ (มีต้นทุน token)
// mutate (create/update/archive): setting C — จัดการที่ Settings เท่านั้น
@Controller('banned-words')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BannedWordsController {
  constructor(private bannedWords: BannedWordsService) {}

  @Get()
  @RequirePermission('product', 'V')
  list(@Query() query: ListBannedWordsQuery) {
    return this.bannedWords.list(query);
  }

  @Post('scan')
  @RequirePermission('product', 'V')
  scan(@Body() dto: ScanBannedWordsDto) {
    return this.bannedWords.scan(dto);
  }

  @Post('ai-review')
  @RequirePermission('product', 'C')
  aiReview(@Body() dto: AiReviewBannedWordsDto, @CurrentUser() user: AuthUser) {
    return this.bannedWords.aiReview(dto, user);
  }

  @Post()
  @RequirePermission('setting', 'C')
  create(@Body() dto: CreateBannedWordDto, @CurrentUser() user: AuthUser) {
    return this.bannedWords.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('setting', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannedWordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bannedWords.update(id, dto, user);
  }

  @Post(':id/archive')
  @RequirePermission('setting', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.bannedWords.archive(id, user);
  }
}
