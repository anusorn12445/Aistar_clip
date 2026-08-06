import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AffiliateClipsService } from './affiliate-clips.service';
import {
  CreateClipJobDto,
  ListClipJobsQuery,
  PatchClipShotDto,
  PlanClipJobDto,
  ReplaceClipShotsDto,
  UpdateClipJobDto,
} from './dto/clip-job.dto';

// UGC Studio v2 — Clip Jobs (สินค้า/สถานที่/อาหาร)
// perm `product` (V ดู / C แก้) — โมดูลเดียวกับ Products + Affiliate Content
@Controller('clip-jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AffiliateClipsController {
  constructor(private clips: AffiliateClipsService) {}

  @Get('status')
  @RequirePermission('product', 'V')
  status() {
    return this.clips.status();
  }

  @Post()
  @RequirePermission('product', 'C')
  create(@Body() dto: CreateClipJobDto, @CurrentUser() user: AuthUser) {
    return this.clips.create(dto, user);
  }

  @Get()
  @RequirePermission('product', 'V')
  list(@Query() query: ListClipJobsQuery) {
    return this.clips.list(query);
  }

  // ═══ Base Prompt Recipes — สูตรรีวิวแก้ได้ (Veo Builder style) ═══
  // GET เปิดให้ทุกคนที่มีสิทธิ์ดู product / แก้ต้อง setting (กันมือใหม่แก้สูตรกลางพัง)
  @Get('recipes')
  @RequirePermission('product', 'V')
  listRecipes() {
    return this.clips.listRecipes();
  }

  // 📊 สถิติผลเจนรวมทุก job — ต้องอยู่ก่อน route ':id'
  @Get('gen-stats')
  @RequirePermission('product', 'V')
  genStats() {
    return this.clips.genStats();
  }

  @Put('recipes/:type/:slug')
  @RequirePermission('setting', 'C')
  saveRecipe(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.saveRecipe(`${type}/${slug}`, dto as never, user);
  }

  // 🚫 ซ่อน/กู้สูตรติดระบบ — ปุ่มลบสำหรับ builtin
  @Post('recipes/:type/:slug/hide')
  @RequirePermission('setting', 'C')
  hideRecipe(@Param('type') type: string, @Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.clips.hideRecipe(`${type}/${slug}`, user);
  }

  @Post('recipes/:type/:slug/unhide')
  @RequirePermission('setting', 'C')
  unhideRecipe(@Param('type') type: string, @Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.clips.unhideRecipe(`${type}/${slug}`, user);
  }

  @Delete('recipes/:type/:slug')
  @RequirePermission('setting', 'C')
  resetRecipe(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.resetRecipe(`${type}/${slug}`, user);
  }

  // ═══ Scene Type Blocks — บล็อกพรอมป์ต่อประเภทฉาก (มีตัวละคร/เห็นแค่มือ/ไม่มีคน) ═══
  @Get('scene-blocks')
  @RequirePermission('product', 'V')
  listSceneBlocks() {
    return this.clips.listSceneBlocks();
  }

  @Put('scene-blocks')
  @RequirePermission('setting', 'C')
  saveSceneBlocks(@Body() dto: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.clips.saveSceneBlocks(dto as never, user);
  }

  @Delete('scene-blocks')
  @RequirePermission('setting', 'C')
  resetSceneBlocks(@CurrentUser() user: AuthUser) {
    return this.clips.resetSceneBlocks(user);
  }

  // ═══ พรอมเนื้อสัมผัส (Texture Prompts) ═══
  @Get('texture-prompts')
  @RequirePermission('product', 'V')
  listTexturePrompts() {
    return this.clips.listTexturePrompts();
  }

  // ═══ Prompt ประเภทสินค้า (Packaging Prompts) ═══
  @Get('packaging-prompts')
  @RequirePermission('product', 'V')
  listPackagingPrompts() {
    return this.clips.listPackagingPrompts();
  }

  @Put('packaging-prompts/:key')
  @RequirePermission('setting', 'C')
  savePackagingPrompt(
    @Param('key') key: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.savePackagingPrompt(key, dto as never, user);
  }

  @Delete('packaging-prompts/:key')
  @RequirePermission('setting', 'C')
  resetPackagingPrompt(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.clips.resetPackagingPrompt(key, user);
  }

  // ═══ Domain Prompt (Section Prompts: hook/reveal/demo/result/cta) ═══
  @Get('section-prompts')
  @RequirePermission('product', 'V')
  getSectionPrompts() {
    return this.clips.getSectionPrompts();
  }

  @Put('section-prompts')
  @RequirePermission('setting', 'C')
  saveSectionPrompts(@Body() dto: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.clips.saveSectionPrompts(dto as never, user);
  }

  @Delete('section-prompts')
  @RequirePermission('setting', 'C')
  resetSectionPrompts(@CurrentUser() user: AuthUser) {
    return this.clips.resetSectionPrompts(user);
  }

  // ⚙️ พรอมระบบถูกถอดออก — บรรทัดฝังใน motion prompt เป็นค่าตายตัวในโค้ด (ไม่มี endpoint ให้แก้แล้ว)

  @Get(':id')
  @RequirePermission('product', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clips.get(id);
  }

  @Patch(':id')
  @RequirePermission('product', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClipJobDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.update(id, dto, user);
  }

  @Post(':id/archive')
  @RequirePermission('product', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.clips.archive(id, user);
  }

  // ① AI เสนอคอนเซปต์ 3 แบบ (มี emoji) — เรียกซ้ำ = ขอแนวใหม่ (append set, cap 5)
  @Post(':id/concepts')
  @RequirePermission('product', 'C')
  concepts(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.clips.concepts(id, user);
  }

  // ② แตก storyboard จากคอนเซปต์ที่เลือก (v2: scenes + sceneType + Voice/Dialogue prompt)
  @Post(':id/plan')
  @RequirePermission('product', 'C')
  plan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlanClipJobDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.plan(id, dto, user);
  }

  @Put(':id/shots')
  @RequirePermission('product', 'C')
  replaceShots(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceClipShotsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.replaceShots(id, dto, user);
  }

  @Patch(':id/shots/:sid')
  @RequirePermission('product', 'C')
  patchShot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: PatchClipShotDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.patchShot(id, sid, dto, user);
  }

  @Get(':id/shots/:sid/policy')
  @RequirePermission('product', 'V')
  checkShotPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.clips.checkShotPolicy(id, sid);
  }

  @Post(':id/shots/:sid/policy-autofix')
  @RequirePermission('product', 'C')
  autoFixShotPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.autoFixShotPolicy(id, sid, user);
  }

  @Post(':id/shots/:sid/recompose')
  @RequirePermission('product', 'C')
  recomposeShot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.recomposeShot(id, sid, user);
  }

  // 🧪 QC พรอมป์ของ shot — body { fix?: boolean } = ปรับอัตโนมัติ (recompose) เมื่อเจอปัญหาที่แก้ได้
  @Post(':id/shots/:sid/prompt-qc')
  @RequirePermission('product', 'C')
  qcShotPrompt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: { fix?: boolean; deep?: boolean } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.qcShotPrompt(id, sid, Boolean(dto?.fix), user, Boolean(dto?.deep));
  }

  // 🔍 Vision QC — เทียบภาพนิ่งกับรูปสินค้าจริง
  @Post(':id/shots/:sid/still-qc')
  @RequirePermission('product', 'C')
  stillQcShot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.stillQcShot(id, sid, user);
  }

  // 🪄 แก้ทั้ง shot ด้วย AI คลิกเดียว — เขียนบทไทย+action+เฟรมแรกใหม่ให้ตรงชนิดสินค้า
  @Post(':id/shots/:sid/ai-fix')
  @RequirePermission('product', 'C')
  aiFixShot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.aiFixShot(id, sid, user);
  }

  // 🩹 ใช้คำแนะนำ Deep QC เป็น override ถาวรของ shot + recompose ทันที
  @Post(':id/shots/:sid/apply-deep-fix')
  @RequirePermission('product', 'C')
  applyDeepFix(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: { actionEn?: string; firstFrameEn?: string; speechFixEn?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.applyDeepFix(id, sid, dto ?? {}, user);
  }

  // ✂️ AI ตัดบทให้ลงงบ
  @Post(':id/shots/:sid/trim-dialogue')
  @RequirePermission('product', 'C')
  trimShotDialogue(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.trimShotDialogue(id, sid, user);
  }

  // 📊 บันทึก/อ่านผลเจนจริงต่อ shot
  @Post(':id/shots/:sid/gen-result')
  @RequirePermission('product', 'C')
  setShotGenResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: { ok: boolean; reasons?: string[] },
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.setShotGenResult(id, sid, dto, user);
  }

  @Get(':id/gen-log')
  @RequirePermission('product', 'V')
  getShotGenLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.clips.getShotGenLog(id);
  }

  // 🧪 QC ทุก shot คลิกเดียว
  @Post(':id/prompt-qc-all')
  @RequirePermission('product', 'C')
  qcAllShots(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { fix?: boolean; deep?: boolean } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clips.qcAllShots(id, Boolean(dto?.fix), user, Boolean(dto?.deep));
  }

  @Get(':id/package')
  @RequirePermission('product', 'V')
  pack(@Param('id', ParseUUIDPipe) id: string) {
    return this.clips.pack(id);
  }
}
