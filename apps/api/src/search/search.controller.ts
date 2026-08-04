import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { SearchService } from './search.service';

// สิทธิ์เช็คต่อ type ใน service (แต่ละกลุ่มต้องมี V ของ module นั้น)
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  run(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('types') types?: string,
  ) {
    const typeList = types
      ? types
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    return this.search.search(q ?? '', typeList, user);
  }
}
