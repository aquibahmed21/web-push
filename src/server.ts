import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import webpush from 'web-push';
import { title } from 'process';


const app = express();
const port = 3000;

const allowedOrigins = ['https://aquibahmed21.github.io'];

app.use(cors({ origin: allowedOrigins }));
app.use(bodyParser.json());

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

const notificationPayload = JSON.stringify({
  title: 'Test Notification',
  body: 'This is a test push notification sent every 5 minutes.'
});

const refreshIntervalMinute = 10;
setInterval(() => {
  fetch('http://localhost:3000/')
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

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
