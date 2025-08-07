import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import webpush from 'web-push';

import fs from 'fs/promises';
import path from 'path';

const familyJsonPath = path.join(__dirname, '..', 'family.json');


const app = express();
const port = 3000;

const allowedOrigins = ['https://aquibahmed21.github.io', 'http://localhost:5173'];

app.use(cors({ origin: allowedOrigins }));
// app.use(bodyParser.json());
app.use(express.json({ limit: "50mb" })); // Adjust '50mb' as needed for JSON payloads
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Adjust '50mb' as needed for URL-encoded payload

// const vapidKeys = webpush.generateVAPIDKeys();
// console.log({vapidKeys})

const vapidKeys = {
  publicKey: 'BJIcXbDabu76tGH1pafdWnTuHU0-2fqwnwT0-5xUys28ORm66D7vjekpvHGn8yGy_yo5ttPLnKDBL-0FYpq__JE',
  privateKey: 'U0O4rAXZN9ChWEDU3Lr0eDHBKVQnpAHl96dJN77HMTk'
};

// Store subscriptions in-memory (use DB for production)
const subscriptions: any[] = [];

webpush.setVapidDetails(
  'mailto:your@email.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const refreshIntervalMinute = 10;

const notificationPayload = JSON.stringify({
  title: 'Test Notification',
  body: 'This is a test push notification sent every ' + refreshIntervalMinute + ' minutes.',
  icon: 'https://picsum.photos/128',
  badge: 'https://picsum.photos/48'
});

setInterval(() => {
  fetch('https://web-push-3zaz.onrender.com')
    .then(response => response.text())
    .then(data => console.log('Response:', data))
    .catch(error => console.error('Error:', error));

  subscriptions.forEach(subscription => webpush.sendNotification(subscription, notificationPayload));
}, refreshIntervalMinute * 60 * 1000);


app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express in TypeScript!');
});

app.get('/vapid', (req: Request, res: Response) => {
  res.status(200).json({
    publicKey: vapidKeys.publicKey
  });
});

app.post('/subscribe', (req: Request, res: Response) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  webpush.sendNotification(subscription, JSON.stringify({ title: 'Test Notification', body: 'This is a test push notification after subscribe successfully' }));
  res.status(201).json({ message: 'Subscribed successfully' });
});

app.post('/unsubscribe', (req: Request, res: Response) => {
  const subscription = req.body;
  subscriptions.splice(subscriptions.indexOf(subscription), 1);
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
