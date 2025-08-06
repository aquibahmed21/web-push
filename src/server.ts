import express, { Request, Response } from 'express';

const app = express();
const port = 3000;

const refreshIntervalMinute = 10;

setInterval(() => {
  fetch('http://localhost:3000/')
    .then(response => response.text())
    .then(data => console.log('Response:', data))
    .catch(error => console.error('Error:', error));
}, refreshIntervalMinute * 60 * 1000);


app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express in TypeScript!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
