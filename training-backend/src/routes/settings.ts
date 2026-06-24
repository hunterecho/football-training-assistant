import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbUpdate, dbSelect, dbGetSystemSettings, dbSetSystemSettings } from '../db/client';

const router = Router();
router.use(authRequired);

// 获取当前用户的设置
router.get('/user', async (req, res) => {
  try {
    const rows = await dbSelect('users', 'id', req.auth!.userId);
    const user = rows[0];
    if (user) {
      res.json({ settings: (user as any).settings ?? {} });
    } else {
      res.json({ settings: {} });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 保存当前用户的设置
router.put('/user', async (req, res) => {
  try {
    const settings = req.body.settings;
    await dbUpdate('users', req.auth!.userId, { settings });
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 获取系统设置（管理员）
router.get('/system/:key', async (req, res) => {
  try {
    // 检查用户角色是否为管理员
    if (req.auth!.role !== 'admin') {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    const value = await dbGetSystemSettings(req.params.key);
    res.json({ key: req.params.key, value });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 设置系统设置（管理员）
router.put('/system/:key', async (req, res) => {
  try {
    // 检查用户角色是否为管理员
    if (req.auth!.role !== 'admin') {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }
    await dbSetSystemSettings(req.params.key, req.body.value, req.body.description);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const settingsRoutes = router;
