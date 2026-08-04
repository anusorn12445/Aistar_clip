# AISTAR Talent OS
## SRS & PRD Document v0.1

---

# 1. Executive Summary

## 1.1 Product Name

**AISTAR Talent OS**

## 1.2 Product Concept

AISTAR Talent OS คือระบบบริหารจัดการการผลิตคอนเทนต์ AI Talent / AI Character / AI Short Drama / AI Live Commerce แบบครบวงจร

ระบบนี้ออกแบบมาเพื่อให้ทีม Creative, Content Creator, AI Video Operator, Editor, Publisher, Commerce Team และ Management ทำงานร่วมกันได้บนระบบเดียว โดยรองรับตั้งแต่

- สร้างและจัดเก็บข้อมูลตัวละคร AI
- เก็บ Character Bible / Visual DNA / Prompt / Asset / Voice / Rights
- วาง Campaign
- เขียน Episode / Script
- แตก Shot สำหรับ AI Video
- จัดเก็บ Location / Scene / Voice
- วาง Content Calendar หลายแพลตฟอร์ม
- จัดการ Live Commerce Schedule
- เก็บข้อมูลคู่แข่งจาก Social และ Marketplace
- เก็บ Idea / Reference Library
- ใช้ Team Post-it Board สำหรับ collaboration
- Export ข้อมูลเป็น ZIP / PDF / Markdown / JSON
- Sync ไป Obsidian
- เชื่อมต่อ GPT / MCP / Backend
- เก็บ Performance Data เพื่อวิเคราะห์และพัฒนาคอนเทนต์ต่อ

## 1.3 Business Goal

เป้าหมายของระบบคือเปลี่ยน AISTAR จากทีมผลิตคลิป AI ให้กลายเป็น **AI Talent Commerce Production OS** ที่สามารถผลิตคอนเทนต์ได้เร็ว คุมคุณภาพได้ ต่อเนื่อง วัดผลได้ และต่อยอดเป็น IP / SaaS / Platform ได้ในอนาคต

---

# 2. Product Vision

## 2.1 Vision Statement

สร้างระบบกลางสำหรับบริหาร **AI Talent, AI Short Drama, AI Content Production และ Live Commerce** ที่ทำให้ทีมสามารถผลิตคอนเทนต์คุณภาพสูงได้อย่างเป็นระบบ และนำข้อมูลกลับมาเรียนรู้เพื่อเพิ่มยอด Reach, Engagement, Conversion และ GMV

## 2.2 Product Positioning

**AISTAR Talent OS = Creative Intelligence + AI Talent Asset Hub + Production Workflow + Commerce Performance System**

ระบบนี้ไม่ใช่แค่ Content Calendar หรือ Character Database แต่เป็นระบบปฏิบัติการสำหรับค่ายดารา AI

---

# 3. Users & Roles

## 3.1 User Roles

| Role | รายละเอียด |
|---|---|
| Admin | จัดการระบบ ผู้ใช้ สิทธิ์ และ configuration |
| Founder / Management | ดูภาพรวม strategy, performance, character portfolio, campaign |
| Creative Lead | อนุมัติ character, story, visual direction, campaign |
| Character Designer / Artist | สร้าง brief, upload reference, comment asset |
| Script Writer | เขียน episode, script, dialogue, short drama beat |
| Prompt Engineer | สร้าง prompt, refine prompt, manage prompt library |
| AI Video Operator | สร้างภาพ/วิดีโอจาก prompt และ shot list |
| Video Editor | ตัดต่อ ใส่ subtitle, sound, logo, final export |
| Content Planner | วาง content calendar และ publishing schedule |
| Publisher | ลงคอนเทนต์ตาม platform ต่าง ๆ |
| Commerce Lead | ดู product tie-in, offer, live commerce, claim risk |
| QC Reviewer | ตรวจ character consistency, visual quality, claim, risk |
| Researcher | เก็บ competitor, trend, idea, marketplace reference |
| Dev / API User | ใช้งานผ่าน MCP/API/automation |

---

# 4. System Scope

## 4.1 In Scope

ระบบต้องรองรับ module หลักดังนี้

1. Character Asset Hub
2. Character Chart / Character Bible
3. Asset Gallery
4. Prompt Library
5. Version Control
6. QC & Approval
7. Production Handoff
8. Export Center
9. Campaign / Project Management
10. Series / Episode / Script Pipeline
11. Shot List Builder
12. Location / Scene Library
13. Voice / Sound Identity
14. Rights / License Management
15. Performance Data Loop
16. Competitor Intelligence
17. Idea & Reference Library
18. Team Post-it Board
19. Content Calendar & Publishing Management
20. Live Commerce Schedule
21. Obsidian Sync
22. MCP / GPT Integration

## 4.2 Out of Scope for First Version

ยังไม่รวม

- Direct auto-posting ไปทุก platform แบบ production-grade
- Scraping ข้อมูล platform แบบผิด ToS
- Payment / billing module
- Client Approval Portal
- Full media rendering engine
- AI model training ภายในระบบ
- Real-time live control dashboard

---

# 5. Product Modules

---

# Module 1: Character Asset Hub

## 5.1 Objective

จัดเก็บข้อมูล AI Character ทุกตัวให้เป็นระบบ เพื่อให้ทีมใช้ต่อในการสร้างภาพ วิดีโอ ละครสั้น รีวิวสินค้า ไลฟ์ขายของ และ campaign ได้อย่าง consistent

## 5.2 Key Features

- Create Character
- Character Profile
- Character Bible
- Visual DNA
- Body DNA
- Voice Profile
- Wardrobe
- Expression
- Relationship Graph
- Commerce Fit
- Legal / Rights
- Prompt Pack
- Asset Reference
- Version Control
- Export Package
- Obsidian Sync

## 5.3 Required Fields

### Basic Profile

| Field | Type |
|---|---|
| character_id | string |
| name_th | string |
| name_en | string |
| universe | string |
| series | string |
| role | string |
| age | number |
| gender | enum |
| region | string |
| status | enum |
| version | string |
| created_by | user_id |
| created_at | datetime |
| updated_at | datetime |

### Persona

| Field | Type |
|---|---|
| one_line_concept | text |
| short_bio | text |
| backstory | text |
| personality | array |
| dream | text |
| motivation | text |
| weakness | text |
| fear | text |
| humor_style | text |
| language_style | text |
| catchphrases | array |

### Visual DNA

| Field | Type |
|---|---|
| face_shape | text |
| eyes | text |
| eyebrows | text |
| nose | text |
| lips | text |
| skin_tone | text |
| distinctive_features | array |
| body_type | text |
| height_impression | text |
| posture | text |
| hair_style | text |
| makeup_style | text |
| fashion_style | text |
| color_palette | array |
| anti_clone_rules | array |
| negative_prompt | text |

### Commerce Profile

| Field | Type |
|---|---|
| suitable_product_categories | array |
| restricted_product_categories | array |
| best_selling_tone | text |
| tie_in_style | text |
| audience_fit | array |
| claim_risk_level | enum |
| brand_safety_level | enum |
| live_selling_strength | text |
| review_style | text |

---

# Module 2: Asset Gallery

## 6.1 Objective

จัดเก็บ reference asset ทั้งหมดของตัวละครและ production เพื่อให้ทีมเลือกใช้ asset ที่ approved แล้วเท่านั้น

## 6.2 Asset Types

- Face Reference
- Full Body
- Expression Sheet
- Outfit Sheet
- Pose Sheet
- Scene Test
- Product Review Image
- Live Commerce Scene
- Voice Sample
- Video Test
- Final Export
- Thumbnail
- Subtitle
- Logo Overlay
- Product Packshot

## 6.3 Asset Status

```text
uploaded
ai_generated
selected
rejected
approved_reference
production_used
archived
```

## 6.4 Required Features

- Upload asset
- Preview asset
- Tag asset
- Link asset to character / episode / shot / campaign
- Set primary reference
- Approve / reject asset
- Version asset
- Download asset
- Track asset usage

---

# Module 3: Prompt Library

## 7.1 Objective

จัดเก็บ prompt ที่ใช้กับตัวละครและ production เพื่อให้ทีม reuse ได้ และลดปัญหาหน้าหลุด / style หลุด

## 7.2 Prompt Types

- Identity Prompt
- Character Sheet Prompt
- Expression Sheet Prompt
- Outfit Sheet Prompt
- Scene Test Prompt
- Product Review Prompt
- Live Commerce Prompt
- Group Shot Prompt
- Shot Prompt
- Negative Prompt
- Anti-clone Prompt

## 7.3 Prompt Status

```text
draft
tested
approved
deprecated
archived
```

## 7.4 Required Features

- Create prompt
- Link prompt to character / shot / campaign
- Copy prompt
- Compare prompt versions
- Mark best prompt
- Prompt performance note
- Approve prompt
- Export prompt pack

---

# Module 4: Character Chart & Export Package

## 8.1 Objective

ให้ผู้ใช้ดาวน์โหลดข้อมูลตัวละครเป็น package เพื่อส่งต่อให้ทีมอื่นทำงานได้ทันที

## 8.2 Export Formats

- PDF Character Chart
- Markdown Character Bible
- JSON Character Data
- Prompt Pack
- Asset ZIP Package
- One-page Talent Card
- Production Brief
- Commerce Fit Brief

## 8.3 Character Package Structure

```text
CHR-PRAEWA-001_Praewa_v1.0_package.zip

/01_character_bible
  praewa_character_bible.md
  praewa_character_chart.pdf
  praewa_talent_card.pdf

/02_prompts
  praewa_identity_prompt.md
  praewa_character_sheet_prompt.md
  praewa_expression_prompt.md
  praewa_outfit_prompt.md
  praewa_scene_prompt.md
  praewa_negative_prompt.md

/03_reference_assets
  praewa_face_reference.png
  praewa_full_body_reference.png
  praewa_expression_sheet.png
  praewa_outfit_sheet.png

/04_production
  praewa_production_brief.md
  praewa_qc_checklist.md
  praewa_voice_profile.md

/05_commerce
  praewa_product_fit.md
  praewa_brand_safety.md

/06_data
  praewa_character_data.json
  praewa_version_history.json
```

---

# Module 5: Version Control

## 9.1 Objective

ควบคุม version ของ character, prompt, asset, script และ production data

## 9.2 Version Examples

```text
v0.1 raw idea
v0.2 AI structured draft
v0.3 revised draft
v1.0 approved identity
v1.1 outfit update
v1.2 prompt update
v2.0 rebrand
```

## 9.3 Required Features

- Create version snapshot
- View version history
- Compare versions
- Restore / rollback
- Version notes
- Audit log
- Show who changed what

---

# Module 6: QC & Approval

## 10.1 Objective

ตรวจคุณภาพก่อนนำ character, prompt, asset, content หรือ campaign ไปใช้ production

## 10.2 QC Categories

- Character Consistency
- Visual Quality
- Prompt Quality
- Asset Readiness
- Product Claim
- Brand Safety
- Rights / License
- Originality Risk
- Publishing Readiness

## 10.3 Approval Status

```text
draft
internal_review
revision_needed
approved
production_ready
rejected
archived
```

## 10.4 QC Score

| Score | ความหมาย |
|---|---|
| 5 | ดีมาก ใช้ production ได้ |
| 4 | ใช้ได้ มีจุดเล็กน้อย |
| 3 | พอใช้ ต้องระวัง |
| 2 | หลุด ต้องแก้ |
| 1 | ใช้ไม่ได้ |

---

# Module 7: Campaign / Project Management

## 11.1 Objective

บริหารงานเป็น campaign หรือ project เพื่อเชื่อมตัวละคร สินค้า episode content และ performance เข้าด้วยกัน

## 11.2 Campaign Fields

| Field | Type |
|---|---|
| campaign_id | string |
| campaign_name | string |
| client / brand | string |
| objective | enum |
| campaign_type | enum |
| start_date | date |
| end_date | date |
| characters | array |
| products | array |
| platforms | array |
| deliverables | array |
| target_kpi | object |
| owner | user_id |
| status | enum |

## 11.3 Campaign Status

```text
brief
planning
production
review
published
completed
archived
```

## 11.4 Campaign Objectives

- Awareness
- Engagement
- Follower Growth
- Product Click
- Add to Cart
- Order
- GMV
- Brand Lift
- Character Launch
- Series Launch

---

# Module 8: Series / Episode / Script Pipeline

## 12.1 Objective

จัดการละครสั้นเป็น season / episode / script เพื่อผลิตได้ต่อเนื่อง

## 12.2 Episode Fields

| Field | Type |
|---|---|
| episode_id | string |
| series | string |
| season | string |
| episode_number | number |
| episode_title | string |
| logline | text |
| characters | array |
| location | string |
| product_tie_in | array |
| campaign | string |
| script | text |
| hook | text |
| conflict | text |
| twist | text |
| CTA | text |
| status | enum |

## 12.3 Episode Status

```text
idea
script_draft
script_review
script_approved
shot_breakdown
production
edited
published
archived
```

## 12.4 Script Structure

- Hook 0–3 sec
- Setup
- Conflict
- Comedy / emotional twist
- Product tie-in
- Punchline
- CTA

---

# Module 9: Shot List Builder

## 13.1 Objective

แตก episode/script เป็น shot สำหรับทีม AI Video Production

## 13.2 Shot Fields

| Field | Type |
|---|---|
| shot_id | string |
| episode_id | string |
| shot_number | number |
| duration | number |
| character | array |
| camera | enum |
| action | text |
| dialogue | text |
| emotion | text |
| location | string |
| outfit | string |
| prompt | text |
| negative_prompt | text |
| reference_assets | array |
| status | enum |

## 13.3 Shot Status

```text
planned
prompt_ready
generating
generated
selected
rejected
edited
approved
```

## 13.4 Camera Types

- Close-up
- Medium shot
- Wide shot
- Over shoulder
- POV
- Product close-up
- Reaction shot
- Establishing shot

---

# Module 10: Location / Scene Library

## 14.1 Objective

เก็บข้อมูลฉากและสถานที่เพื่อคุม continuity ของละครสั้น

## 14.2 Location Examples

- หอพักนักศึกษา
- ร้านดนตรีสดอีสาน
- ตลาดนัดกลางคืน
- มหาวิทยาลัย
- ร้านส้มตำ
- บ้านต่างจังหวัด
- ห้องไลฟ์สด
- งานวัด / หมอลำ
- ร้านกาแฟริมทาง

## 14.3 Location Fields

| Field | Type |
|---|---|
| location_id | string |
| name | string |
| type | string |
| region_style | string |
| mood | text |
| lighting | text |
| time_of_day | text |
| visual_reference | array |
| prompt | text |
| negative_prompt | text |
| continuity_notes | text |
| episodes_used | array |
| status | enum |

---

# Module 11: Voice / Sound Identity

## 15.1 Objective

เก็บข้อมูลเสียงของตัวละคร เพื่อให้ voice, accent และ dialogue style consistent

## 15.2 Voice Fields

| Field | Type |
|---|---|
| voice_id | string |
| character_id | string |
| voice_type | text |
| tone | text |
| accent | text |
| speaking_speed | text |
| laugh_style | text |
| emotional_range | array |
| sample_dialogues | array |
| voice_sample_file | file |
| ai_voice_model | string |
| human_voice_actor | string |
| usage_rights | text |
| status | enum |

---

# Module 12: Rights / License Management

## 16.1 Objective

คุมสิทธิ์การใช้ character, asset, voice, prompt และ campaign เพื่อรองรับการใช้เชิงพาณิชย์

## 16.2 Rights Fields

| Field | Type |
|---|---|
| rights_id | string |
| entity_type | enum |
| entity_id | string |
| owner | string |
| commercial_usage | boolean |
| usage_scope | text |
| territory | string |
| duration | string |
| exclusivity | text |
| restricted_categories | array |
| disclosure_required | boolean |
| legal_status | enum |
| risk_level | enum |

## 16.3 Legal Status

```text
draft
internal_only
commercial_approved
restricted
expired
archived
```

---

# Module 13: Performance Data Loop

## 17.1 Objective

เก็บ performance ของ content เพื่อนำมาวิเคราะห์ว่า character, content angle, product, hook, platform และ posting time แบบไหนเวิร์ก

## 17.2 Metrics

| Metric | Type |
|---|---|
| views | number |
| reach | number |
| impressions | number |
| likes | number |
| comments | number |
| shares | number |
| saves | number |
| watch_time | number |
| 3_sec_retention | percentage |
| completion_rate | percentage |
| CTR | percentage |
| product_clicks | number |
| add_to_cart | number |
| orders | number |
| revenue | number |
| GMV | number |
| CVR | percentage |
| ROAS | number |

## 17.3 Performance Links

Performance ต้องเชื่อมกับ

- Character
- Episode
- Campaign
- Product
- Platform
- Content type
- Hook
- Posting time
- Prompt version
- Asset version

## 17.4 Insight Examples

- Character ไหนขายสินค้าไหนดีที่สุด
- Hook แบบไหน retention สูง
- Platform ไหนเหมาะกับ content type ไหน
- Product tie-in แบบไหนไม่โดนด่าว่าขายแข็ง
- Episode ไหนควรทำ sequel

---

# Module 14: Competitor Intelligence

## 18.1 Objective

เก็บและวิเคราะห์ข้อมูลคู่แข่งจาก Social Media และ Marketplace เช่น TikTok, Shopee, Lazada

## 18.2 Core Entities

- Competitor Profile
- Competitor Channel
- Marketplace Shop
- Marketplace Product
- Price / Offer History
- Social Content
- Live Session
- Creator / KOL
- Competitor Campaign
- Insight / Opportunity

## 18.3 Competitor Profile Fields

| Field | Type |
|---|---|
| competitor_id | string |
| name | string |
| type | enum |
| category | array |
| positioning | text |
| audience | array |
| strength | text |
| weakness | text |
| threat_level | enum |
| watch_status | enum |
| notes | text |

## 18.4 Competitor Insight Rule

ระบบต้องแยก

- Fact
- Assumption
- Recommendation

## 18.5 Guardrail

ใช้ข้อมูลคู่แข่งเพื่อวิเคราะห์ pattern เท่านั้น ห้ามลอก creative, script, visual, asset, caption หรือ character ตรง ๆ

---

# Module 15: Idea & Reference Library

## 19.1 Objective

เก็บไอเดียและ reference ที่ทีมเจอจากทุกช่องทาง เพื่อใช้เป็นวัตถุดิบในการสร้าง campaign, episode, shot, prompt หรือ content

## 19.2 Idea Types

- Hook Reference
- Story Reference
- Visual Reference
- Character Reference
- Comedy Reference
- Product Tie-in Reference
- Live Selling Reference
- Marketplace Reference
- Caption / Copy Reference
- Trend / Meme Reference
- Music / Sound Reference
- Editing Reference

## 19.3 Idea Status

```text
captured
reviewed
shortlisted
adapted
converted_to_campaign
used
archived
```

## 19.4 Required Features

- Quick add idea
- Paste URL
- Upload screenshot
- Add note
- AI summarize
- Extract reusable pattern
- Generate AISTAR adaptation
- Link to character / campaign / episode
- Convert to campaign / episode / shot
- Obsidian sync

---

# Module 16: Team Post-it Board

## 20.1 Objective

ให้ทีมแปะโน้ตเร็ว ๆ ระหว่างทำงาน และแปลงเป็น task, idea, QC issue หรือ decision ได้

## 20.2 Post-it Types

- Note
- Idea
- Todo
- Issue
- Feedback
- QC Note
- Risk
- Reference
- Decision
- Question

## 20.3 Post-it Status

```text
open
in_progress
resolved
archived
```

## 20.4 Required Features

- Create post-it
- Link to entity
- Assign owner
- Set priority
- Comment thread
- Mention
- Convert to task / idea / QC / decision
- AI summarize board
- Cluster similar notes
- Obsidian sync

---

# Module 17: Content Calendar & Publishing Management

## 21.1 Objective

จัดการตารางการลง content ของทีม publishing ในหลาย platform อย่างเป็นระบบ

## 21.2 Supported Platforms

- TikTok
- Facebook Page
- Facebook Reels
- Instagram
- Instagram Reels
- YouTube Shorts
- TikTok Shop
- Shopee Video
- Lazada Feed / LazLive
- LINE OA
- Website / Blog
- Live Commerce

## 21.3 Calendar Views

- Daily View
- Weekly View
- Monthly View
- Campaign View
- Platform View
- Character View
- Series / Episode View
- Live Schedule View

## 21.4 Content Item Fields

| Field | Type |
|---|---|
| content_id | string |
| title | string |
| objective | enum |
| platform | enum |
| account | string |
| scheduled_at | datetime |
| content_format | enum |
| content_type | enum |
| series | string |
| episode | string |
| characters | array |
| product | array |
| campaign | string |
| caption | text |
| hashtags | array |
| CTA | text |
| asset_files | array |
| thumbnail | file |
| subtitle | file |
| sound_reference | text |
| prompt_reference | string |
| production_brief | text |
| approval_status | enum |
| publishing_status | enum |
| owner | user_id |
| reviewer | user_id |
| post_url | string |
| performance | object |

## 21.5 Content Status

```text
idea
brief
script_draft
script_approved
in_production
asset_ready
caption_ready
internal_review
approved
scheduled
published
performance_tracking
repurpose
archived
revision_needed
blocked
cancelled
hold
rejected
```

## 21.6 Required Features

- Create content item
- Calendar view
- Schedule content
- Multi-platform versioning
- Platform-specific caption
- Hashtags
- CTA
- Asset readiness check
- Approval workflow
- Risk / compliance check
- Live schedule
- Performance tracking
- Repurpose workflow
- Export weekly/monthly plan
- Sync to Obsidian

---

# Module 18: Live Commerce Schedule

## 22.1 Objective

จัดตารางและข้อมูล Live Commerce สำหรับ AI Character / Human Operator / Product List

## 22.2 Live Fields

| Field | Type |
|---|---|
| live_id | string |
| live_title | string |
| platform | enum |
| account | string |
| scheduled_at | datetime |
| host_character | array |
| human_operator | user_id |
| product_list | array |
| product_pin_order | array |
| offer | text |
| script | text |
| FAQ | text |
| comment_response_guide | text |
| scene_setup | text |
| target_GMV | number |
| reminder_status | enum |
| replay_asset | file |
| performance | object |

---

# 23. System Architecture

## 23.1 Recommended Architecture

```text
Frontend Web App
↓
Backend API
↓
Database
↓
Object Storage
↓
MCP Server
↓
GPT / AI Assistant
↓
Markdown Generator
↓
Obsidian Vault
```

## 23.2 Suggested Tech Stack

### Frontend

- Next.js / React
- TailwindCSS
- Shadcn/UI
- React Query
- Zustand / Redux optional

### Backend

- Node.js / NestJS หรือ Laravel / Django
- REST API หรือ GraphQL
- PostgreSQL
- Redis optional
- Object Storage เช่น S3 / Cloudflare R2 / Google Cloud Storage

### AI / MCP

- MCP Server
- GPT Actions / Custom GPT
- AI Structuring Service
- Prompt Generator
- Markdown Generator

### Storage

- PostgreSQL สำหรับ structured data
- Object Storage สำหรับ asset
- Obsidian Markdown Mirror สำหรับ knowledge base

---

# 24. Database Entities

## 24.1 Core Tables

```text
users
roles
permissions

characters
character_versions
character_assets
character_prompts
character_voice_profiles
character_relationships
character_rights

campaigns
campaign_characters
campaign_products

series
episodes
scripts
shots
locations

products
brands

content_items
content_platform_versions
content_approvals
content_performance

live_sessions
live_products
live_performance

competitors
competitor_channels
competitor_products
competitor_contents
competitor_live_sessions
competitor_creators
competitor_insights

ideas
idea_assets
idea_collections
idea_links

postits
postit_comments
postit_links

qc_reviews
audit_logs
obsidian_sync_logs
```

---

# 25. MCP / API Requirements

## 25.1 Character Tools

```text
search_characters
create_character
get_character
update_character
archive_character
create_character_version
rollback_character_version
sync_character_to_obsidian
```

## 25.2 Campaign Tools

```text
create_campaign
search_campaigns
get_campaign
update_campaign
link_character_to_campaign
```

## 25.3 Episode / Shot Tools

```text
create_episode
get_episode
update_episode
create_script
update_script
generate_shot_list
create_shot
update_shot
link_shot_to_asset
link_shot_to_prompt
```

## 25.4 Content Calendar Tools

```text
create_content_item
search_content_items
get_content_item
update_content_item
schedule_content_item
mark_content_published
add_content_performance
generate_weekly_content_plan
generate_platform_caption
generate_hashtags
convert_episode_to_content_items
convert_idea_to_content_item
convert_postit_to_content_task
sync_content_calendar_to_obsidian
generate_content_calendar_report
```

## 25.5 Competitor Tools

```text
search_competitors
create_competitor
get_competitor
update_competitor
add_competitor_channel
add_competitor_product
add_competitor_content
add_competitor_live_session
create_competitor_insight
generate_competitor_report
sync_competitor_to_obsidian
```

## 25.6 Idea Tools

```text
create_idea
search_ideas
get_idea
update_idea
archive_idea
summarize_idea_with_ai
generate_aistar_adaptation
convert_idea_to_campaign
convert_idea_to_episode
convert_idea_to_shot_list
sync_idea_to_obsidian
```

## 25.7 Post-it Tools

```text
create_postit
search_postits
get_postit
update_postit
resolve_postit
archive_postit
link_postit_to_entity
assign_postit
comment_on_postit
convert_postit_to_task
convert_postit_to_idea
convert_postit_to_qc_issue
convert_postit_to_decision
summarize_postit_board
cluster_postits
sync_postit_to_obsidian
```

---

# 26. Obsidian Folder Structure

```text
AISTAR_VAULT/
  00_Inbox/
  01_Characters/
  02_Series/
  03_Episodes/
  04_Scripts/
  05_Prompts/
  06_Assets/
  07_Products/
  08_Brands/
  09_QC/
  10_Performance/
  11_Competitors/
    Brands/
    Products/
    Social_Content/
    Marketplace/
    Live_Sessions/
    Creators/
    Insights/
  12_Ideas/
    Inbox/
    Hooks/
    Story_Patterns/
    Visual_References/
    Product_Tieins/
    Live_Selling/
    Marketplace_References/
    Collections/
    Adapted_Ideas/
  13_Team_Postits/
    Inbox/
    Characters/
    Episodes/
    Production/
    Decisions/
    Resolved/
  14_Campaigns/
  15_Locations/
  16_Voices/
  17_Rights/
  18_Content_Calendar/
    Daily/
    Weekly/
    Monthly/
    Platform_Plans/
    Campaign_Plans/
    Live_Schedules/
    Published/
    Reports/
  99_Templates/
```

---

# 27. Non-functional Requirements

## 27.1 Security

- Role-based access control
- Audit log ทุก action สำคัญ
- Download log สำหรับ asset
- Permission แยก internal / external
- API authentication
- MCP action permission
- Prevent unauthorized export

## 27.2 Performance

- Dashboard load ภายใน 3 วินาที
- Search response ภายใน 2 วินาทีสำหรับข้อมูลทั่วไป
- Asset preview ต้องโหลดแบบ lazy load
- Export package ควรรัน background job ได้

## 27.3 Scalability

ระบบควรรองรับในอนาคต

- 1,000+ characters
- 100,000+ assets
- 10,000+ content items
- 1,000+ campaigns
- หลายทีม / หลาย brand / หลาย series

## 27.4 Reliability

- Auto-save draft
- Version history
- Rollback
- Backup database
- Backup asset
- Failed MCP action ต้อง retry ได้
- Obsidian sync log

## 27.5 Usability

- ทีม non-tech ต้องใช้ง่าย
- Form ต้องสั้น
- AI ช่วยเติม field
- มี quick add
- มี copy prompt
- มี download package
- มี status ชัดเจน
- มี warning ถ้างานยังไม่พร้อม

---

# 28. AI Assistant Requirements

## 28.1 AI Should Help With

- สรุป brief
- ถาม follow-up ไม่เกิน 3 ข้อ
- สร้าง Character Bible
- สร้าง Prompt
- สร้าง Shot List
- สร้าง Caption
- สร้าง Hashtag
- สรุป Competitor Pattern
- แปลง Idea เป็น Episode
- แปลง Post-it เป็น Task
- สรุป weekly content plan
- สรุป performance insight
- ตรวจ risk เบื้องต้น
- สร้าง Obsidian Markdown

## 28.2 AI Guardrails

- แยก Fact / Assumption / Recommendation
- ห้ามลอก creative คู่แข่งตรง ๆ
- ห้าม claim สินค้าเกินจริง
- ห้ามทำให้ character ดู underage ในบริบทเชิงเสน่ห์/commerce
- ต้องระบุ TODO เมื่อข้อมูลไม่พอ
- ต้องขอ confirmation ก่อน action สำคัญ
- ห้าม approve งานแทนมนุษย์

---

# 29. MVP Recommendation

## Phase 1 — Core Character & Asset

- Character Profile
- Asset Gallery
- Prompt Library
- Character Package Export
- Status Workflow
- Obsidian Sync
- MCP basic tools

## Phase 2 — Production Pipeline

- Campaign
- Episode
- Shot List
- Location
- Voice
- Rights
- QC
- Production Handoff

## Phase 3 — Publishing & Intelligence

- Content Calendar
- Live Schedule
- Performance Data
- Competitor Intelligence
- Idea Library
- Post-it Board

## Phase 4 — Advanced Intelligence

- Character similarity checker
- AI QC
- Performance recommendation
- Competitor alert
- Auto weekly content plan
- Talent-product matching
- Campaign recommendation engine

---

# 30. Success Criteria

ระบบจะถือว่าสำเร็จเมื่อ

1. ทีมสามารถสร้าง character ใหม่ได้โดยไม่ต้องกรอกข้อมูลซับซ้อน
2. ทุก character มี Character Bible และ approved reference
3. ทีมสามารถ export package ไปทำงานต่อได้ทันที
4. Episode สามารถแตกเป็น shot list ได้
5. ทีมเห็น content calendar หลาย platform ได้ชัดเจน
6. Publisher รู้ว่าต้องโพสต์อะไร วันไหน ช่องทางไหน
7. ระบบเตือนเมื่อ asset / caption / approval ยังไม่พร้อม
8. ข้อมูล performance ถูกเชื่อมกลับไปยัง character / episode / campaign
9. Competitor insight สามารถ convert เป็น campaign ได้
10. Idea และ Post-it ไม่กระจัดกระจายในแชตส่วนตัว
11. Obsidian ได้รับข้อมูลที่ structured และอ่านง่าย
12. GPT/MCP สามารถช่วยบันทึก ดึง แก้ และ sync ข้อมูลได้
13. ระบบช่วยลดเวลาผลิต content และเพิ่ม consistency ของ character
14. ระบบช่วยให้ AISTAR scale การผลิต AI Short Drama / Live Commerce ได้จริง

---

# 31. Recommended Next Step for Dev

## 31.1 Immediate Dev Tasks

1. สรุป ERD จาก entity ทั้งหมด
2. ออกแบบ role & permission
3. ออกแบบ database schema
4. ทำ API spec phase 1
5. ทำ UI prototype เป็น React / Next.js
6. ทำ Character CRUD
7. ทำ Asset Upload
8. ทำ Prompt Library
9. ทำ Export Markdown / JSON
10. ทำ Obsidian Sync แบบ one-way
11. ทำ MCP tools phase 1

## 31.2 First Working Prototype Should Include

- Login
- Character list
- Create character
- Character detail
- Asset upload
- Prompt tab
- Status update
- Export markdown
- Sync Obsidian mock
- Content Calendar mock
- Post-it quick note

---

# 32. Final Product Definition

**AISTAR Talent OS** คือระบบกลางสำหรับสร้าง บริหาร ผลิต เผยแพร่ และวิเคราะห์ AI Talent Content แบบครบวงจร ตั้งแต่ระดับ Character IP ไปจนถึง Content Performance และ Commerce Intelligence

ระบบนี้ต้องทำให้ AISTAR Studio สามารถเปลี่ยนจาก “ทีมทำคลิป AI” ไปเป็น **AI Talent Commerce Studio ที่มีระบบผลิตและบริหาร IP ระดับมืออาชีพ**
