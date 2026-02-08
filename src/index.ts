import 'dotenv/config';
import express from 'express';
import { webhookRouter } from './routes/webhook.js';

export const app = express();
app.use(express.json());

app.use('/webhook', webhookRouter);

app.get('/health', (_req, res) => {
  res.send('ok');
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Voice capture service listening on port ${port}`);
});
