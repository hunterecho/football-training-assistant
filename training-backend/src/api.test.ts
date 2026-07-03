import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth';
import { recordRoutes } from './routes/records';
import { templateRoutes } from './routes/templates';
import { planRoutes } from './routes/plans';

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/plans', planRoutes);

describe('API Tests', () => {
  let testToken: string;
  let testUserId: string;

  describe('Auth API', () => {
    it('should mock login successfully', async () => {
      const res = await request(app).post('/api/auth/mock').send({ nickname: 'TestUser' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.nickname).toBe('TestUser');
      testToken = res.body.token;
      testUserId = res.body.user.id;
    });

    it('should return error for empty nickname', async () => {
      const res = await request(app).post('/api/auth/mock').send({ nickname: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('nickname is required');
    });

    it('should get user info with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Template API', () => {
    it('should get templates list', async () => {
      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.templates)).toBe(true);
    });

    it('should create a template', async () => {
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Test Template',
          description: 'Test description',
          drills: [
            { title: 'Drill 1', duration: 30, cues: [] },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.template).toBeDefined();
      expect(res.body.template.name).toBe('Test Template');
    });
  });

  describe('Records API', () => {
    let testTemplateId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Test Template for Records',
          drills: [{ title: 'Drill', duration: 30 }],
        });
      testTemplateId = res.body.template.id;
    });

    it('should create a record', async () => {
      const res = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateId,
          title: 'Test Record',
        });
      expect(res.status).toBe(201);
      expect(res.body.record).toBeDefined();
      expect(res.body.record.title).toBe('Test Record');
    });

    it('should get records list', async () => {
      await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateId,
          title: 'Test Record',
        });

      const res = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.records)).toBe(true);
    });

    it('should update a record', async () => {
      const createRes = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateId,
          title: 'Test Record',
        });
      const recordId = createRes.body.record.id;

      const res = await request(app)
        .patch(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          status: 'in_progress',
          completed_drills: 1,
        });
      expect(res.status).toBe(200);
    });

    it('should delete a record', async () => {
      const createRes = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateId,
          title: 'Test Record',
        });
      const recordId = createRes.body.record.id;

      const res = await request(app)
        .delete(`/api/records/${recordId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Plans API', () => {
    let testPlanId: string;
    let testTemplateIdForPlan: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Plan Template',
          drills: [{ title: 'Drill', duration: 30 }],
        });
      testTemplateIdForPlan = res.body.template.id;
    });

    it('should create a plan', async () => {
      const res = await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'Test Plan',
          date: '2024-01-01',
          status: 'planned',
          note: 'Test note',
        });
      expect(res.status).toBe(200);
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.title).toBe('Test Plan');
      expect(res.body.plan.date).toBe('2024-01-01');
      expect(res.body.plan.status).toBe('planned');
      testPlanId = res.body.plan.id;
    });

    it('should get plans list', async () => {
      const beforeCount = await request(app)
        .get('/api/plans')
        .set('Authorization', `Bearer ${testToken}`);

      await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'Plan 1',
          date: '2024-01-01',
        });

      await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'Plan 2',
          date: '2024-01-02',
        });

      const res = await request(app)
        .get('/api/plans')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.plans)).toBe(true);
      expect(res.body.plans.length).toBeGreaterThanOrEqual(2);
      const planTitles = res.body.plans.map((p: any) => p.title);
      expect(planTitles).toContain('Plan 1');
      expect(planTitles).toContain('Plan 2');
    });

    it('should get a plan by id', async () => {
      const createRes = await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'Single Plan',
          date: '2024-01-01',
        });
      const planId = createRes.body.plan.id;

      const res = await request(app)
        .get(`/api/plans/${planId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.title).toBe('Single Plan');
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await request(app)
        .get('/api/plans/non-existent-id')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should update a plan', async () => {
      const createRes = await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'Original Title',
          date: '2024-01-01',
        });
      const planId = createRes.body.plan.id;

      const res = await request(app)
        .patch(`/api/plans/${planId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          title: 'Updated Title',
          status: 'completed',
        });
      expect(res.status).toBe(200);
      expect(res.body.plan.title).toBe('Updated Title');
      expect(res.body.plan.status).toBe('completed');
    });

    it('should delete a plan', async () => {
      const createRes = await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'To Delete Plan',
          date: '2024-01-01',
        });
      const planId = createRes.body.plan.id;

      const res = await request(app)
        .delete(`/api/plans/${planId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should return 403 for unauthorized plan access', async () => {
      const otherUserRes = await request(app).post('/api/auth/mock').send({ nickname: 'OtherUser' });
      const otherToken = otherUserRes.body.token;

      const createRes = await request(app)
        .post('/api/plans')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          template_id: testTemplateIdForPlan,
          title: 'My Plan',
          date: '2024-01-01',
        });
      const planId = createRes.body.plan.id;

      const res = await request(app)
        .get(`/api/plans/${planId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    it('should support pagination with default values', async () => {
      for (let i = 0; i < 25; i++) {
        await request(app)
          .post('/api/plans')
          .set('Authorization', `Bearer ${testToken}`)
          .send({
            template_id: testTemplateIdForPlan,
            title: `Pagination Plan ${i}`,
            date: '2024-01-01',
          });
      }

      const res = await request(app)
        .get('/api/plans')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.plans).toHaveLength(20);
      expect(res.body.total).toBeGreaterThanOrEqual(25);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
    });

    it('should support pagination with custom page and pageSize', async () => {
      const res = await request(app)
        .get('/api/plans?page=2&pageSize=10')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.plans).toHaveLength(10);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
    });
  });

  describe('Auth Complete Flow', () => {
    it('should handle mock login with existing user', async () => {
      const firstLogin = await request(app).post('/api/auth/mock').send({ nickname: 'ExistingUser' });
      expect(firstLogin.status).toBe(200);
      const userId1 = firstLogin.body.user.id;

      const secondLogin = await request(app).post('/api/auth/mock').send({ nickname: 'ExistingUser' });
      expect(secondLogin.status).toBe(200);
      const userId2 = secondLogin.body.user.id;

      expect(userId1).toBe(userId2);
    });

    it('should handle wechat mock login', async () => {
      const res = await request(app).post('/api/auth/wechat').send({ code: 'mock_wechat_code_test' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.nickname).toContain('微信用户');
    });

    it('should return error for wechat login without code', async () => {
      const res = await request(app).post('/api/auth/wechat').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code is required');
    });

    it('should verify token and get user info', async () => {
      const loginRes = await request(app).post('/api/auth/mock').send({ nickname: 'VerifyUser' });
      const token = loginRes.body.token;

      const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.nickname).toBe('VerifyUser');
    });
  });
});