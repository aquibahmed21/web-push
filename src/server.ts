import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import webpush from 'web-push';
import fs from 'fs/promises';
import path from 'path';

const familyJsonPath = path.join(__dirname, '..', 'family.json');
const subscriptionJsonPath = path.join(__dirname, '..', 'notifications.json');

const app = express();

// Config (env-driven with sensible defaults)
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://aquibahmed21.github.io,http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '1mb';
const urlencodedBodyLimit = process.env.URLENCODED_BODY_LIMIT || '1mb';
const refreshIntervalMinute = Number(process.env.REFRESH_INTERVAL_MIN || 10);
const pingUrl = process.env.PING_URL || 'https://web-push-3zaz.onrender.com';
const vapidMailto = process.env.VAPID_MAILTO || 'mailto:admin@example.com';

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ limit: urlencodedBodyLimit, extended: true }));

// Types
interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
  id?: number;
}
interface PushSubscriptionLike {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
}
interface SubscriptionData {
  vapidKeys: { publicKey: string; privateKey: string; };
  subscriptionList: PushSubscriptionLike[];
}

let subscriptionData: SubscriptionData | null = null;

// Helpers
const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const saveSubscriptionData = async () => {
  if (!subscriptionData) return;
  await fs.writeFile(subscriptionJsonPath, JSON.stringify(subscriptionData, null, 2), 'utf-8');
};

const notificationPayload = (title: string, body: string) => JSON.stringify({
  title,
  body,
  icon: 'https://picsum.photos/128',
  badge: 'https://picsum.photos/48'
});

// Bootstrapping VAPID + storage
(async () => {
  const data = await loadOrCreateSubscriptionFile();
  subscriptionData = data;
  const { vapidKeys } = data;
  webpush.setVapidDetails(
    vapidMailto,
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
})();

// Keep-alive ping (for free hosts that sleep)
const interval = setInterval(() => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  fetch(pingUrl)
    .then(r => r.text())
    .then(() => {})
    .catch(() => {});
}, refreshIntervalMinute * 60 * 1000);

// Routes
app.get('/', (_req: Request, res: Response) => {
  res.send('OK');
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/vapid', (req: Request, res: Response) => {
  if (!subscriptionData) return res.status(503).json({ error: 'VAPID not ready' });
  res.status(200).json({ publicKey: subscriptionData.vapidKeys.publicKey });
});

app.post('/subscribe', asyncHandler(async (req: Request, res: Response) => {
  const subscription: PushSubscriptionLike = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription payload' });
  }
  if (!subscriptionData) return res.status(503).json({ error: 'Service not initialized' });

  const exists = subscriptionData.subscriptionList.some(s => s.endpoint === subscription.endpoint);
  if (exists) {
    return res.status(200).json({ message: 'Already subscribed' });
  }

  subscriptionData.subscriptionList.push(subscription);
  await saveSubscriptionData();
  res.status(201).json({ message: 'Subscribed successfully' });
}));

app.post('/unsubscribe', asyncHandler(async (req: Request, res: Response) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  if (!subscriptionData) return res.status(503).json({ error: 'Service not initialized' });

  const before = subscriptionData.subscriptionList.length;
  subscriptionData.subscriptionList = subscriptionData.subscriptionList.filter(s => s.endpoint !== endpoint);
  const after = subscriptionData.subscriptionList.length;
  if (after === before) return res.status(404).json({ error: 'Subscription not found' });
  await saveSubscriptionData();
  res.status(200).json({ message: 'Unsubscribed successfully' });
}));

app.post('/notifyAll', asyncHandler(async (req: Request, res: Response) => {
  if (!subscriptionData) return res.status(503).json({ error: 'Service not initialized' });
  const data: { initiator?: number; title: string; body: string } = req.body;
  const { initiator, title, body } = data || {} as any;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

  const targets = subscriptionData.subscriptionList.filter(s => (s.keys?.id ? s.keys.id !== initiator : true));
  const payload = notificationPayload(title, body);

  const results = await Promise.allSettled(targets.map(sub => webpush.sendNotification(sub as any, payload)));

  // Optionally prune stale subscriptions (410 Gone)
  let changed = false;
  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      const err: any = r.reason;
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        const stale = targets[idx];
        subscriptionData!.subscriptionList = subscriptionData!.subscriptionList.filter(s => s.endpoint !== stale.endpoint);
        changed = true;
      }
    }
  });
  if (changed) await saveSubscriptionData();

  res.status(200).json({ message: 'Notifications processed', successes: results.filter(r => r.status === 'fulfilled').length, failures: results.filter(r => r.status === 'rejected').length });
}));

app.post('/isPushSubscribed', (req: Request, res: Response) => {
  const subscription: Partial<PushSubscriptionLike> = req.body;
  const endpoint = subscription?.endpoint;
  const isSubscribed = Boolean(endpoint && subscriptionData?.subscriptionList.some(sub => sub.endpoint === endpoint));
  res.status(200).json({ isSubscribed });
});

app.get('/family', asyncHandler(async (_req: Request, res: Response) => {
  const data = await fs.readFile(familyJsonPath, 'utf-8');
  const json = JSON.parse(data);
  res.json(json);
}));

// POST /family - overwrite family.json with request body
app.post('/family', asyncHandler(async (req: Request, res: Response) => {
  const newFamilyData = req.body;
  if (typeof newFamilyData !== 'object' || !newFamilyData) {
    return res.status(400).json({ error: 'Invalid JSON data' });
  }
  await fs.writeFile(familyJsonPath, JSON.stringify(newFamilyData, null, 2), 'utf-8');
  res.status(200).json({ message: 'family.json updated successfully' });
}));

// Error handler (last)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status || 500;
  const message = err?.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Graceful shutdown
const shutdown = () => {
  clearInterval(interval);
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Storage utilities
async function loadOrCreateSubscriptionFile(): Promise<SubscriptionData> {
  try {
    const fileData = await fs.readFile(subscriptionJsonPath, 'utf-8');
    const parsedData = JSON.parse(fileData) as SubscriptionData;
    // sanitize
    parsedData.subscriptionList = Array.isArray(parsedData.subscriptionList) ? parsedData.subscriptionList : [];
    return parsedData;
  } catch (error: any) {
    if (error && error.code === 'ENOENT') {
      return await handleENOENT();
    }
    throw error;
  }
}

async function handleENEONTWrite(fileContent: SubscriptionData) {
  await fs.writeFile(subscriptionJsonPath, JSON.stringify(fileContent, null, 2), 'utf-8');
}

async function handleENOENT(): Promise<SubscriptionData> {
  const vapidKeys = webpush.generateVAPIDKeys();
  const defaultSubscriptionData: SubscriptionData = {
    vapidKeys,
    subscriptionList: []
  };
  await handleENEONTWrite(defaultSubscriptionData);
  return defaultSubscriptionData;
}

