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
} from './utils';

const ASSIGNEE_EMAIL = 'tasks-assignee@aistar.test';
const ASSIGNEE_PASSWORD = 'tasks-assignee-2026';
const OTHER_EMAIL = 'tasks-other@aistar.test';
const OTHER_PASSWORD = 'tasks-other-2026';

// My Work: tasks + notification fan-out (§E.3)
describe('Tasks & notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let assigneeToken: string;
  let assigneeId: string;
  let otherId: string;
  let taskId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    assigneeId = await createUserWithRoles(prisma, ASSIGNEE_EMAIL, ASSIGNEE_PASSWORD, [
      'video_editor',
    ]);
    otherId = await createUserWithRoles(prisma, OTHER_EMAIL, OTHER_PASSWORD, ['video_editor']);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    assigneeToken = await loginAs(app, ASSIGNEE_EMAIL, ASSIGNEE_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('create task with assignee → notification row created for assignee', async () => {
    const res = await http(app)
      .post('/api/tasks')
      .set(auth(adminToken))
      .send({ title: 'TN e2e ตรวจไฟล์ตัดต่อ', assigneeId, priority: 'urgent' })
      .expect(201);
    taskId = res.body.id;
    expect(res.body.assignee.email).toBe(ASSIGNEE_EMAIL);

    const rows = await prisma.notification.findMany({
      where: { userId: assigneeId, type: 'task_assigned', entityId: taskId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('TN e2e ตรวจไฟล์ตัดต่อ');
  });

  it('assignee sees the notification via GET /notifications (unread filter)', async () => {
    const res = await http(app)
      .get('/api/notifications')
      .query({ unread: '1' })
      .set(auth(assigneeToken))
      .expect(200);
    const hit = res.body.find((n: { entityId: string }) => n.entityId === taskId);
    expect(hit).toBeDefined();
    expect(hit.readAt).toBeNull();
  });

  it('mark one read, then read-all clears the rest', async () => {
    const list = await http(app).get('/api/notifications').set(auth(assigneeToken)).expect(200);
    const target = list.body.find((n: { entityId: string }) => n.entityId === taskId);

    const read = await http(app)
      .patch(`/api/notifications/${target.id}/read`)
      .set(auth(assigneeToken))
      .expect(200);
    expect(read.body.readAt).not.toBeNull();

    // cannot mark someone else's notification
    await http(app)
      .patch(`/api/notifications/${target.id}/read`)
      .set(auth(adminToken))
      .expect(404);

    await http(app).post('/api/notifications/read-all').set(auth(assigneeToken)).expect(201);
    const after = await http(app)
      .get('/api/notifications')
      .query({ unread: '1' })
      .set(auth(assigneeToken))
      .expect(200);
    expect(after.body).toHaveLength(0);
  });

  it('task filters: assigneeId=me, status, priority, q', async () => {
    // extra tasks for filter noise
    await http(app)
      .post('/api/tasks')
      .set(auth(adminToken))
      .send({ title: 'TN e2e งานคนอื่น', assigneeId: otherId, priority: 'low' })
      .expect(201);
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ status: 'in_progress' })
      .expect(200);

    const mine = await http(app)
      .get('/api/tasks')
      .query({ assigneeId: 'me' })
      .set(auth(assigneeToken))
      .expect(200);
    expect(mine.body.items.map((t: { id: string }) => t.id)).toContain(taskId);
    expect(
      mine.body.items.every((t: { assigneeId: string }) => t.assigneeId === assigneeId),
    ).toBe(true);

    const byStatus = await http(app)
      .get('/api/tasks')
      .query({ status: 'in_progress', q: 'TN e2e' })
      .set(auth(adminToken))
      .expect(200);
    expect(byStatus.body.items.map((t: { id: string }) => t.id)).toContain(taskId);

    const byPriority = await http(app)
      .get('/api/tasks')
      .query({ priority: 'urgent', q: 'TN e2e' })
      .set(auth(adminToken))
      .expect(200);
    expect(byPriority.body.items.map((t: { id: string }) => t.id)).toEqual([taskId]);

    const byQ = await http(app)
      .get('/api/tasks')
      .query({ q: 'TN e2e งานคนอื่น' })
      .set(auth(adminToken))
      .expect(200);
    expect(byQ.body.total).toBe(1);
  });

  it('reassign notifies the new assignee', async () => {
    await http(app)
      .patch(`/api/tasks/${taskId}`)
      .set(auth(adminToken))
      .send({ assigneeId: otherId })
      .expect(200);

    const rows = await prisma.notification.findMany({
      where: { userId: otherId, type: 'task_assigned', entityId: taskId },
    });
    expect(rows).toHaveLength(1);
  });

  it('GET /tasks/assignees lists active users', async () => {
    const res = await http(app).get('/api/tasks/assignees').set(auth(adminToken)).expect(200);
    const emails = res.body.map((u: { email: string }) => u.email);
    expect(emails).toEqual(expect.arrayContaining([ASSIGNEE_EMAIL, OTHER_EMAIL]));
  });
});
