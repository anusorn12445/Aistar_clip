import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
  PNG_BUFFER,
} from './utils';

const ASSIGNEE_EMAIL = 'tasks-trello-assignee@aistar.test';
const ASSIGNEE_PASSWORD = 'tasks-trello-assignee-2026';
const OTHER_EMAIL = 'tasks-trello-other@aistar.test';
const OTHER_PASSWORD = 'tasks-trello-other-2026';

// My Work แบบ Trello: description / labels / checklist / comments / badge counts
describe('Tasks Trello features (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminId: string;
  let assigneeToken: string;
  let assigneeId: string;
  let otherToken: string;
  let taskId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    assigneeId = await createUserWithRoles(prisma, ASSIGNEE_EMAIL, ASSIGNEE_PASSWORD, [
      'video_editor',
    ]);
    await createUserWithRoles(prisma, OTHER_EMAIL, OTHER_PASSWORD, ['video_editor']);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    adminId = admin.id;

    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    assigneeToken = await loginAs(app, ASSIGNEE_EMAIL, ASSIGNEE_PASSWORD);
    otherToken = await loginAs(app, OTHER_EMAIL, OTHER_PASSWORD);

    const res = await http(app)
      .post('/api/tasks')
      .set(auth(adminToken))
      .send({ title: 'TT e2e งานถ่ายทำ Trello', assigneeId, priority: 'urgent' })
      .expect(201);
    taskId = res.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('PATCH description: set text, then empty string clears to null', async () => {
    const set = await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ description: 'ถ่าย 3 ช็อต ที่สตูดิโอ A\nดูบอร์ดอ้างอิง https://example.com' })
      .expect(200);
    expect(set.body.description).toContain('สตูดิโอ A');

    const cleared = await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ description: '' })
      .expect(200);
    expect(cleared.body.description).toBeNull();

    // ใส่กลับสำหรับเทสต์ hasDescription ทีหลัง
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ description: 'รายละเอียดงานถ่ายทำ' })
      .expect(200);
  });

  it('PATCH labels: valid saved, bad color / too many → 400 Thai', async () => {
    const ok = await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ labels: ['green:ถ่ายทำ', 'red:ด่วนมาก'] })
      .expect(200);
    expect(ok.body.labels).toEqual(['green:ถ่ายทำ', 'red:ด่วนมาก']);

    const badColor = await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ labels: ['magenta:ห้ามใช้'] })
      .expect(400);
    const msg = Array.isArray(badColor.body.message)
      ? badColor.body.message.join(' ')
      : badColor.body.message;
    expect(msg).toContain('label');

    // เกิน 10 อัน → 400
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ labels: Array.from({ length: 11 }, (_, i) => `blue:label${i}`) })
      .expect(400);

    // ชื่อว่าง (ไม่มีตัวอักษรหลัง :) → 400
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ labels: ['green:'] })
      .expect(400);
  });

  it('PATCH checklist: valid shape saved, invalid items → 400', async () => {
    const ok = await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({
        checklist: [
          { id: 'c1', text: 'จัดไฟ', done: true },
          { id: 'c2', text: 'เซ็ตกล้อง', done: false },
          { id: 'c3', text: 'ตรวจเสียง', done: false },
        ],
      })
      .expect(200);
    expect(ok.body.checklist).toHaveLength(3);
    expect(ok.body.checklist[0]).toEqual({ id: 'c1', text: 'จัดไฟ', done: true });

    // ขาด done → 400
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ checklist: [{ id: 'x', text: 'ไม่มี done' }] })
      .expect(400);

    // text ว่าง → 400
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ checklist: [{ id: 'x', text: '', done: false }] })
      .expect(400);

    // ไม่ใช่ array → 400
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ checklist: 'ผิดรูปแบบ' })
      .expect(400);
  });

  it('POST comment → 201 + notification rows for creator/assignee (excluding self)', async () => {
    // assignee comment → แจ้ง creator (admin) แต่ไม่แจ้งตัวเอง
    const c1 = await http(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(assigneeToken))
      .send({ content: 'เริ่มจัดไฟแล้วครับ' })
      .expect(201);
    expect(c1.body.content).toBe('เริ่มจัดไฟแล้วครับ');
    expect(c1.body.authorName).toBeTruthy();

    const toAdmin = await prisma.notification.findMany({
      where: { userId: adminId, type: 'task_comment', entityId: taskId },
    });
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0].message).toContain('TT e2e งานถ่ายทำ Trello');

    const toSelf = await prisma.notification.findMany({
      where: { userId: assigneeId, type: 'task_comment', entityId: taskId },
    });
    expect(toSelf).toHaveLength(0);

    // admin (creator) comment → แจ้ง assignee
    await http(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(adminToken))
      .send({ content: 'รับทราบ เร่งหน่อยนะ' })
      .expect(201);
    const toAssignee = await prisma.notification.findMany({
      where: { userId: assigneeId, type: 'task_comment', entityId: taskId },
    });
    expect(toAssignee).toHaveLength(1);

    // ความคิดเห็นว่าง → 400
    await http(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(adminToken))
      .send({ content: '' })
      .expect(400);
  });

  it('GET /tasks/:id returns full detail with comments + authorName + attachmentCount', async () => {
    const res = await http(app).get(`/api/tasks/${taskId}`).set(auth(assigneeToken)).expect(200);
    expect(res.body.title).toBe('TT e2e งานถ่ายทำ Trello');
    expect(res.body.description).toBe('รายละเอียดงานถ่ายทำ');
    expect(res.body.labels).toEqual(['green:ถ่ายทำ', 'red:ด่วนมาก']);
    expect(res.body.checklist).toHaveLength(3);
    expect(res.body.assignee.email).toBe(ASSIGNEE_EMAIL);
    expect(res.body.comments).toHaveLength(2);
    expect(res.body.comments[0].authorName).toBeTruthy();
    expect(res.body.attachmentCount).toBe(0);

    // ไม่พบ → 404
    await http(app)
      .get('/api/tasks/00000000-0000-4000-8000-000000000000')
      .set(auth(adminToken))
      .expect(404);
  });

  it('DELETE comment: stranger 403, author ok, admin can delete any', async () => {
    const detail = await http(app).get(`/api/tasks/${taskId}`).set(auth(adminToken)).expect(200);
    const assigneeComment = detail.body.comments.find(
      (c: { createdBy: string }) => c.createdBy === assigneeId,
    );
    const adminComment = detail.body.comments.find(
      (c: { createdBy: string }) => c.createdBy === adminId,
    );

    // คนอื่นที่ไม่ใช่เจ้าของและไม่ใช่ admin → 403
    await http(app)
      .delete(`/api/tasks/${taskId}/comments/${assigneeComment.id}`)
      .set(auth(otherToken))
      .expect(403);

    // เจ้าของลบของตัวเองได้
    await http(app)
      .delete(`/api/tasks/${taskId}/comments/${assigneeComment.id}`)
      .set(auth(assigneeToken))
      .expect(200);

    // admin ลบของคนอื่นได้
    await http(app)
      .delete(`/api/tasks/${taskId}/comments/${adminComment.id}`)
      .set(auth(adminToken))
      .expect(200);

    // ลบซ้ำ → 404
    await http(app)
      .delete(`/api/tasks/${taskId}/comments/${adminComment.id}`)
      .set(auth(adminToken))
      .expect(404);
  });

  it('attachment upload links to task and bumps attachmentCount', async () => {
    await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'task_attachment')
      .field('entityType', 'task')
      .field('entityId', taskId)
      .field('linkRole', 'reference')
      .attach('file', PNG_BUFFER, 'storyboard.png')
      .expect(201);

    const res = await http(app).get(`/api/tasks/${taskId}`).set(auth(adminToken)).expect(200);
    expect(res.body.attachmentCount).toBe(1);
  });

  it('GET /tasks list items carry Trello badge fields', async () => {
    // เพิ่ม comment ใหม่ให้ commentCount > 0 (ของเก่าถูกลบหมดแล้ว)
    await http(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(auth(adminToken))
      .send({ content: 'เช็คบอร์ดด้วย' })
      .expect(201);

    const res = await http(app)
      .get('/api/tasks')
      .query({ q: 'TT e2e งานถ่ายทำ Trello' })
      .set(auth(assigneeToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    const item = res.body.items[0];
    expect(item.labels).toEqual(['green:ถ่ายทำ', 'red:ด่วนมาก']);
    expect(item.hasDescription).toBe(true);
    expect(item.checklistTotal).toBe(3);
    expect(item.checklistDone).toBe(1);
    expect(item.commentCount).toBe(1);
    expect(item.attachmentCount).toBe(1);
    expect(item.assignee).toMatchObject({ id: assigneeId, name: expect.any(String) });
    // list ไม่แบก payload หนัก — description/checklist เต็มอยู่ที่ GET /tasks/:id
    expect(item.description).toBeUndefined();
    expect(item.checklist).toBeUndefined();
  });
});
