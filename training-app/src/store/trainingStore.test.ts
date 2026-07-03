import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTrainingStore } from '@/store/trainingStore';
import { useAuthStore } from '@/store/authStore';
import { defaultTemplate } from '@/data/defaultTemplate';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { templates: [], plans: [], records: [] } }),
    post: vi.fn().mockResolvedValue({ 
      data: { 
        record: { 
          id: 'server-record-id',
          title: 'Test Record',
          template_id: 'tpl-1',
          user_id: 'test-user',
          status: 'planned',
          completed_drills: 0,
          total_drills: 3,
          created_at: new Date().toISOString(),
        } 
      } 
    }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { api } from '@/lib/api';
const mockApi = vi.mocked(api);

describe('trainingStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'test-user', nickname: 'Test' }, token: 'test-token' });
    useTrainingStore.setState({
      templates: [defaultTemplate],
      plans: [],
      records: [],
      session: {
        templateId: null,
        drillIndex: 0,
        remaining: 0,
        status: 'idle',
        startedAt: null,
        lastTickTs: null,
        drillStartedAt: null,
      },
      activeRecordId: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('session management', () => {
    it('should start a session', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      const session = useTrainingStore.getState().session;
      expect(session.templateId).toBe(defaultTemplate.id);
      expect(session.status).toBe('running');
      expect(session.drillIndex).toBe(0);
      expect(session.remaining).toBe(defaultTemplate.drills[0].duration);
    });

    it('should pause a running session', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      useTrainingStore.getState().pauseSession();
      const session = useTrainingStore.getState().session;
      expect(session.status).toBe('paused');
    });

    it('should resume a paused session', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      useTrainingStore.getState().pauseSession();
      useTrainingStore.getState().resumeSession();
      const session = useTrainingStore.getState().session;
      expect(session.status).toBe('running');
    });

    it('should advance to next drill', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      useTrainingStore.getState().nextDrill();
      const session = useTrainingStore.getState().session;
      expect(session.drillIndex).toBe(1);
    });

    it('should reset session to idle', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      useTrainingStore.getState().resetSession();
      const session = useTrainingStore.getState().session;
      expect(session.status).toBe('idle');
      expect(session.templateId).toBe(null);
    });
  });

  describe('data isolation', () => {
    it('should not delete other user records when canceling session', () => {
      const myRecord = {
        id: 'my-record',
        planId: 'plan-1',
        templateId: defaultTemplate.id,
        userId: 'test-user',
        title: 'My Training',
        status: 'in_progress',
        completedDrills: 1,
        totalDrills: 3,
        createdAt: Date.now(),
      };
      const otherRecord = {
        id: 'other-record',
        planId: 'plan-1',
        templateId: defaultTemplate.id,
        userId: 'other-user',
        title: 'Other Training',
        status: 'in_progress',
        completedDrills: 2,
        totalDrills: 3,
        createdAt: Date.now(),
      };

      useTrainingStore.setState({
        records: [myRecord, otherRecord],
        activeRecordId: 'my-record',
        session: {
          templateId: defaultTemplate.id,
          drillIndex: 1,
          remaining: 30,
          status: 'running',
          startedAt: Date.now(),
          lastTickTs: Date.now(),
          drillStartedAt: Date.now(),
        },
      });

      useTrainingStore.getState().cancelSession();
      const records = useTrainingStore.getState().records;

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('other-record');
    });

    it('should not delete record when it belongs to other user', () => {
      const otherRecord = {
        id: 'other-record',
        planId: 'plan-1',
        templateId: defaultTemplate.id,
        userId: 'other-user',
        title: 'Other Training',
        status: 'in_progress',
        completedDrills: 2,
        totalDrills: 3,
        createdAt: Date.now(),
      };

      useTrainingStore.setState({
        records: [otherRecord],
        activeRecordId: 'other-record',
        session: {
          templateId: defaultTemplate.id,
          drillIndex: 2,
          remaining: 30,
          status: 'running',
          startedAt: Date.now(),
          lastTickTs: Date.now(),
          drillStartedAt: Date.now(),
        },
      });

      useTrainingStore.getState().cancelSession();
      const records = useTrainingStore.getState().records;

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('other-record');
    });
  });

  describe('record management', () => {
    it('should add a record', async () => {
      const recordId = await useTrainingStore.getState().addRecord({
        planId: 'plan-1',
        templateId: defaultTemplate.id,
        userId: 'test-user',
        title: 'Test Record',
        status: 'planned',
        totalDrills: 3,
      });

      expect(recordId).toBeDefined();
      const records = useTrainingStore.getState().records;
      expect(records).toHaveLength(1);
      expect(records[0].title).toBe('Test Record');
    });

    it('should update a record', () => {
      useTrainingStore.setState({
        records: [
          {
            id: 'record-1',
            planId: 'plan-1',
            templateId: defaultTemplate.id,
            userId: 'test-user',
            title: 'Test',
            status: 'planned',
            completedDrills: 0,
            totalDrills: 3,
            createdAt: Date.now(),
          },
        ],
      });

      useTrainingStore.getState().updateRecord('record-1', {
        status: 'in_progress',
        completedDrills: 2,
      });

      const record = useTrainingStore.getState().records.find((r) => r.id === 'record-1');
      expect(record?.status).toBe('in_progress');
      expect(record?.completedDrills).toBe(2);
    });

    it('should remove a record', () => {
      useTrainingStore.setState({
        records: [
          {
            id: 'record-1',
            planId: 'plan-1',
            templateId: defaultTemplate.id,
            userId: 'test-user',
            title: 'Test',
            status: 'planned',
            completedDrills: 0,
            totalDrills: 3,
            createdAt: Date.now(),
          },
        ],
      });

      useTrainingStore.getState().removeRecord('record-1');
      const records = useTrainingStore.getState().records;
      expect(records).toHaveLength(0);
    });
  });

  describe('resetCurrentDrill', () => {
    it('should reset current drill timer', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      useTrainingStore.getState().setRemaining(10);
      useTrainingStore.getState().resetCurrentDrill();
      const session = useTrainingStore.getState().session;
      expect(session.remaining).toBe(defaultTemplate.drills[0].duration);
      expect(session.status).toBe('paused');
    });
  });

  describe('tick', () => {
    it('should decrement remaining time when running', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      const initialRemaining = useTrainingStore.getState().session.remaining;
      useTrainingStore.getState().tick(Date.now() + 1000);
      const session = useTrainingStore.getState().session;
      expect(session.remaining).toBeLessThan(initialRemaining);
    });

    it('should not decrement when paused', () => {
      useTrainingStore.getState().startSession(defaultTemplate.id);
      useTrainingStore.getState().pauseSession();
      const initialRemaining = useTrainingStore.getState().session.remaining;
      useTrainingStore.getState().tick(Date.now() + 1000);
      const session = useTrainingStore.getState().session;
      expect(session.remaining).toBe(initialRemaining);
    });
  });

  describe('plan management', () => {
    it('should add a plan', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: {
          plan: {
            id: 'server-plan-id',
            template_id: defaultTemplate.id,
            title: 'Test Plan',
            date: '2024-01-01',
            status: 'planned',
            created_at: new Date().toISOString(),
          },
        },
      });

      const planId = await useTrainingStore.getState().addPlan({
        templateId: defaultTemplate.id,
        title: 'Test Plan',
        date: '2024-01-01',
        status: 'planned',
      });

      expect(planId).toBe('server-plan-id');
      const plans = useTrainingStore.getState().plans;
      expect(plans).toHaveLength(1);
      expect(plans[0].title).toBe('Test Plan');
      expect(plans[0].id).toBe('server-plan-id');
    });

    it('should get plan by date', () => {
      useTrainingStore.setState({
        plans: [
          {
            id: 'plan-1',
            templateId: defaultTemplate.id,
            title: 'Plan 1',
            date: '2024-01-01',
            status: 'planned',
            createdAt: Date.now(),
          },
          {
            id: 'plan-2',
            templateId: defaultTemplate.id,
            title: 'Plan 2',
            date: '2024-01-02',
            status: 'planned',
            createdAt: Date.now(),
          },
        ],
      });

      const plan = useTrainingStore.getState().getPlanByDate('2024-01-01');
      expect(plan?.id).toBe('plan-1');
      expect(plan?.title).toBe('Plan 1');
    });

    it('should toggle plan status', () => {
      useTrainingStore.setState({
        plans: [
          {
            id: 'plan-1',
            templateId: defaultTemplate.id,
            title: 'Test',
            date: '2024-01-01',
            status: 'planned',
            createdAt: Date.now(),
          },
        ],
      });

      useTrainingStore.getState().togglePlanStatus('plan-1');
      const plan = useTrainingStore.getState().plans.find((p) => p.id === 'plan-1');
      expect(plan?.status).toBe('completed');
      expect(plan?.completedAt).toBeDefined();

      useTrainingStore.getState().togglePlanStatus('plan-1');
      const plan2 = useTrainingStore.getState().plans.find((p) => p.id === 'plan-1');
      expect(plan2?.status).toBe('planned');
      expect(plan2?.completedAt).toBeUndefined();
    });
  });

  describe('syncFromServer', () => {
    it('should sync data from server', async () => {
      const mockTemplates = [
        {
          id: 'tpl-1',
          name: 'Server Template',
          description: '',
          drills: [{ id: 'd1', title: 'Drill', duration: 30, cues: [] }],
          created_at: new Date().toISOString(),
        },
      ];
      const mockPlans = [
        {
          id: 'plan-1',
          template_id: 'tpl-1',
          title: 'Server Plan',
          date: '2024-01-01',
          status: 'planned',
          created_at: new Date().toISOString(),
        },
      ];
      const mockRecords = [];

      mockApi.get
        .mockResolvedValueOnce({ data: { templates: mockTemplates } })
        .mockResolvedValueOnce({ data: { plans: mockPlans } })
        .mockResolvedValueOnce({ data: { records: mockRecords } });

      await useTrainingStore.getState().syncFromServer();

      const state = useTrainingStore.getState();
      expect(state.templates).toHaveLength(1);
      expect(state.templates[0].name).toBe('Server Template');
      expect(state.plans).toHaveLength(1);
      expect(state.plans[0].title).toBe('Server Plan');
      expect(state.synced).toBe(true);
    });

    it('should restore in_progress session from server', async () => {
      const mockTemplates = [
        {
          id: 'tpl-1',
          name: 'Server Template',
          description: '',
          drills: [
            { id: 'd1', title: 'Drill 1', duration: 30, cues: [] },
            { id: 'd2', title: 'Drill 2', duration: 45, cues: [] },
          ],
          created_at: new Date().toISOString(),
        },
      ];
      const mockPlans = [];
      const mockRecords = [
        {
          id: 'record-1',
          plan_id: 'plan-1',
          template_id: 'tpl-1',
          user_id: 'test-user',
          title: 'In Progress Record',
          status: 'in_progress',
          start_time: new Date().toISOString(),
          completed_drills: 1,
          total_drills: 2,
          created_at: new Date().toISOString(),
        },
      ];

      mockApi.get
        .mockResolvedValueOnce({ data: { templates: mockTemplates } })
        .mockResolvedValueOnce({ data: { plans: mockPlans } })
        .mockResolvedValueOnce({ data: { records: mockRecords } });

      await useTrainingStore.getState().syncFromServer();

      const session = useTrainingStore.getState().session;
      expect(session.status).toBe('ready');
      expect(session.templateId).toBe('tpl-1');
      expect(session.drillIndex).toBe(1);
      expect(session.remaining).toBe(45);
    });

    it('should not restore other user in_progress session', async () => {
      const mockTemplates = [
        {
          id: 'tpl-1',
          name: 'Server Template',
          description: '',
          drills: [{ id: 'd1', title: 'Drill', duration: 30, cues: [] }],
          created_at: new Date().toISOString(),
        },
      ];
      const mockRecords = [
        {
          id: 'record-1',
          plan_id: 'plan-1',
          template_id: 'tpl-1',
          user_id: 'other-user',
          title: 'Other User Record',
          status: 'in_progress',
          start_time: new Date().toISOString(),
          completed_drills: 1,
          total_drills: 2,
          created_at: new Date().toISOString(),
        },
      ];

      mockApi.get
        .mockResolvedValueOnce({ data: { templates: mockTemplates } })
        .mockResolvedValueOnce({ data: { plans: [] } })
        .mockResolvedValueOnce({ data: { records: mockRecords } });

      await useTrainingStore.getState().syncFromServer();

      const session = useTrainingStore.getState().session;
      expect(session.status).toBe('idle');
      expect(session.templateId).toBe(null);
    });
  });

  describe('fetchSharePlan', () => {
    it('should fetch share plan successfully', async () => {
      const mockPlan = {
        id: 'share-plan-1',
        template_id: 'tpl-1',
        title: 'Shared Plan',
        date: '2024-01-01',
        status: 'planned',
        created_at: new Date().toISOString(),
      };
      const mockTemplate = {
        id: 'tpl-1',
        name: 'Shared Template',
        description: '',
        drills: [{ id: 'd1', title: 'Drill', duration: 30, cues: [] }],
        created_at: new Date().toISOString(),
      };

      mockApi.get.mockResolvedValueOnce({
        data: { plan: mockPlan, template: mockTemplate },
      });

      const result = await useTrainingStore.getState().fetchSharePlan('share-plan-1');

      expect(result).not.toBeNull();
      expect(result?.plan.id).toBe('share-plan-1');
      expect(result?.plan.title).toBe('Shared Plan');
      expect(result?.template.id).toBe('tpl-1');
      expect(result?.template.name).toBe('Shared Template');
    });

    it('should return null when fetch fails', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await useTrainingStore.getState().fetchSharePlan('invalid-plan');

      expect(result).toBe(null);
    });

    it('should return null when data is empty', async () => {
      mockApi.get.mockResolvedValueOnce({ data: null });

      const result = await useTrainingStore.getState().fetchSharePlan('empty-plan');

      expect(result).toBe(null);
    });
  });

  describe('selectedPlanId', () => {
    it('should set and get selectedPlanId', () => {
      useTrainingStore.getState().setSelectedPlanId('plan-1');
      const selected = useTrainingStore.getState().selectedPlanId;
      expect(selected).toBe('plan-1');
    });

    it('should clear selectedPlanId', () => {
      useTrainingStore.getState().setSelectedPlanId('plan-1');
      useTrainingStore.getState().setSelectedPlanId(null);
      const selected = useTrainingStore.getState().selectedPlanId;
      expect(selected).toBe(null);
    });
  });

  describe('pagination', () => {
    it('should initialize with default pagination values', () => {
      const state = useTrainingStore.getState();
      expect(state.plansPage).toBe(1);
      expect(state.plansPageSize).toBe(20);
      expect(state.plansTotal).toBe(0);
      expect(state.templatesPage).toBe(1);
      expect(state.templatesPageSize).toBe(20);
      expect(state.templatesTotal).toBe(0);
    });

    it('should fetch plans page with pagination', async () => {
      const mockPlans = [
        { id: 'plan-1', template_id: 'tpl-1', title: 'Page 1 Plan', date: '2024-01-01', status: 'planned', user_id: 'test-user', created_at: new Date().toISOString() },
        { id: 'plan-2', template_id: 'tpl-1', title: 'Page 1 Plan 2', date: '2024-01-02', status: 'planned', user_id: 'test-user', created_at: new Date().toISOString() },
      ];
      mockApi.get.mockResolvedValueOnce({
        data: { plans: mockPlans, total: 10, page: 1, pageSize: 20 },
      });

      await useTrainingStore.getState().fetchPlansPage(1);

      const state = useTrainingStore.getState();
      expect(state.plans).toHaveLength(2);
      expect(state.plans[0].title).toBe('Page 1 Plan');
      expect(state.plansTotal).toBe(10);
      expect(state.plansPage).toBe(1);
      expect(state.plansPageSize).toBe(20);
    });

    it('should fetch different pages', async () => {
      const mockPlansPage2 = [
        { id: 'plan-3', template_id: 'tpl-1', title: 'Page 2 Plan', date: '2024-01-03', status: 'planned', user_id: 'test-user', created_at: new Date().toISOString() },
      ];
      mockApi.get.mockResolvedValueOnce({
        data: { plans: mockPlansPage2, total: 10, page: 2, pageSize: 20 },
      });

      await useTrainingStore.getState().fetchPlansPage(2);

      const state = useTrainingStore.getState();
      expect(state.plans).toHaveLength(1);
      expect(state.plans[0].title).toBe('Page 2 Plan');
      expect(state.plansPage).toBe(2);
    });

    it('should use custom pageSize', async () => {
      const mockPlans = [
        { id: 'plan-4', template_id: 'tpl-1', title: 'Custom Size Plan', date: '2024-01-01', status: 'planned', user_id: 'test-user', created_at: new Date().toISOString() },
      ];
      mockApi.get.mockResolvedValueOnce({
        data: { plans: mockPlans, total: 5, page: 1, pageSize: 5 },
      });

      await useTrainingStore.getState().fetchPlansPage(1, 5);

      const state = useTrainingStore.getState();
      expect(state.plansPageSize).toBe(5);
      expect(state.plansTotal).toBe(5);
    });
  });
});