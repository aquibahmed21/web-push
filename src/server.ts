import express, { Request, Response } from 'express';
import cors from 'cors';
import webpush from 'web-push';

import fs from 'fs/promises';
import path from 'path';

const familyJsonPath = path.join(__dirname, '..', 'family.json');
const subscriptionJsonPath = path.join(__dirname, '..', 'notifications.json');

const app = express();
const port = 3000;

const allowedOrigins = ['https://aquibahmed21.github.io', 'http://localhost:5173'];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" })); // Adjust '1mb' as needed for JSON payloads
app.use(express.urlencoded({ limit: "1mb", extended: true })); // Adjust '1mb' as needed for URL-encoded payload

interface SubscriptionData
{
  vapidKeys: { publicKey: string; privateKey: string; };
  subscriptionList: any[]; // shape as per your app or just keep any[]
}

let subscriptionData: SubscriptionData | null = null;
LoadOrCreateSubscriptionFile().then((data: SubscriptionData) => {

  subscriptionData = data;
  const {vapidKeys, subscriptionList} = data;

  webpush.setVapidDetails(
    'mailto:your@email.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
});

const refreshIntervalMinute = 10;

const notificationPayload = (id: number) => JSON.stringify({
  title: 'Test Notification ' + id,
  body: 'This is a test push notification sent every ' + id + ' minutes.',
  icon: 'https://picsum.photos/128',
  badge: 'https://picsum.photos/48'
});

setInterval(() => {
  fetch('https://web-push-3zaz.onrender.com')
    .then(response => response.text())
    .then(data => console.log('Response:', data))
    .catch(error => console.error('Error:', error));

  subscriptionData?.subscriptionList.forEach(subscription => {
    webpush.sendNotification(subscription, notificationPayload(subscription.keys.id));
  });
}, refreshIntervalMinute * 60 * 1000);


app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express in TypeScript!');
});

app.get('/vapid', (req: Request, res: Response) => {
  res.status(200).json({
    publicKey: subscriptionData?.vapidKeys.publicKey
  });
});

app.post('/subscribe', (req: Request, res: Response) => {
  const subscription = req.body;
  subscriptionData?.subscriptionList.push(subscription);
  try {
    fs.writeFile(subscriptionJsonPath, JSON.stringify(subscriptionData, null, 2), 'utf-8').then(() => {
      res.status(200).json({ message: 'subscription.json updated successfully' });
    });
  } catch (error) {
    console.error('Failed to write family.json:', error);
    res.status(500).json({ error: 'Failed to update family data' });
  }
});

app.post('/unsubscribe', (req: Request, res: Response) => {
  const subscription = req.body;

  subscriptionData?.subscriptionList.splice(subscriptionData?.subscriptionList.indexOf(subscription), 1);
  res.status(200).json({ message: 'Unsubscribed successfully' });
});

app.get('/family', async (req, res) => {
  try {
    const data = await fs.readFile(familyJsonPath, 'utf-8');
    const json = JSON.parse(data);
    res.json(json);
  } catch (error) {
    console.error('Failed to read family.json:', error);
    res.status(500).json({ error: 'Failed to read family data' });
  }
});

// POST /family - overwrite family.json with request body
app.post('/family', async (req, res) => {
  const newFamilyData = req.body;

  if (typeof newFamilyData !== 'object' || !newFamilyData) {
    return res.status(400).json({ error: 'Invalid JSON data' });
  }

  try {
    await fs.writeFile(familyJsonPath, JSON.stringify(newFamilyData, null, 2), 'utf-8');
    res.status(200).json({ message: 'family.json updated successfully' });
  } catch (error) {
    console.error('Failed to write family.json:', error);
    res.status(500).json({ error: 'Failed to update family data' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

async function LoadOrCreateSubscriptionFile():
  Promise<SubscriptionData> {
  try {
    const fileData = await fs.readFile(subscriptionJsonPath, 'utf-8');
    const parsedData = JSON.parse(fileData);
    return parsedData;
  }
  catch (error: any) {
    if (error.code === 'ENOENT') {
      return await HandleENOENT();
    } else {
      // Unknown error - rethrow or handle accordingly
      throw error;
    }
  }
}
async function HandleENOENT() {
  const vapidKeys = webpush.generateVAPIDKeys();
  const defaultSubscriptionData: SubscriptionData = {
    vapidKeys: vapidKeys,
    subscriptionList: []
  };
  console.log("defaultSubscriptionData: ", defaultSubscriptionData);
  // File does not exist, create with default JSON
  await fs.writeFile(subscriptionJsonPath, JSON.stringify(defaultSubscriptionData, null, 2), 'utf-8');
  return defaultSubscriptionData;
}

