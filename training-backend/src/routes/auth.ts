import { Router } from 'express';
import { signToken, authRequired } from '../middleware/auth';
import { dbSelect, dbUpsertUser } from '../db/client';

const router = Router();

router.post('/mock', async (req, res) => {
  try {
    const { nickname } = req.body as { nickname?: string };
    if (!nickname || !nickname.trim()) {
      res.status(400).json({ error: 'nickname is required' });
      return;
    }
    const cleanName = nickname.trim();
    const existing = await dbSelect('users', 'id', cleanName);
    const user =
      (existing[0] as any) ??
      (await dbUpsertUser({
        id: cleanName,
        nickname: cleanName,
        role: 'coach',
        created_at: new Date().toISOString(),
      }));
    const token = signToken({
      userId: (user as any).id ?? cleanName,
      nickname: (user as any).nickname ?? cleanName,
      role: (user as any).role ?? 'coach',
    });
    res.json({ token, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const rows = await dbSelect('users', 'id', req.auth!.userId);
    const user = (rows[0] as any) ?? {
      id: req.auth!.userId,
      nickname: req.auth!.nickname,
      role: req.auth!.role,
    };
    res.json({ user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/wechat', async (req, res) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    let openid: string;
    let nickname: string;

    if (code.startsWith('mock_wechat_code_')) {
      openid = 'wx_' + code.replace('mock_wechat_code_', '');
      nickname = '微信用户_' + openid.slice(-8);
    } else {
      const appId = process.env.WECHAT_APP_ID;
      const appSecret = process.env.WECHAT_APP_SECRET;
      
      if (!appId || !appSecret) {
        res.status(500).json({ error: 'WeChat app config not set' });
        return;
      }

      try {
        const response = await fetch(
          `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`
        );
        const data = await response.json() as { errcode?: number; errmsg?: string; openid?: string };
        
        if (data.errcode) {
          res.status(400).json({ error: data.errmsg || 'WeChat login failed' });
          return;
        }
        
        openid = data.openid!;
        nickname = '微信用户_' + openid.slice(-8);
      } catch {
        res.status(500).json({ error: 'Failed to connect to WeChat API' });
        return;
      }
    }

    const existing = await dbSelect('users', 'id', openid);
    const user =
      (existing[0] as any) ??
      (await dbUpsertUser({
        id: openid,
        nickname,
        role: 'player',
        created_at: new Date().toISOString(),
      }));

    const token = signToken({
      userId: (user as any).id ?? openid,
      nickname: (user as any).nickname ?? nickname,
      role: (user as any).role ?? 'player',
    });

    res.json({ token, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const authRoutes = router;
