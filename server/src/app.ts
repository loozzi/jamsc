import express, { Application } from 'express';
import path from 'path';
import mediaRouter from './routes/media';
import { errorHandler } from './middlewares/errorHandler';

export function createApp(): Application {
  const app = express();

  // process.cwd() is always `server/` regardless of compiled file location
  app.use(express.static(path.join(process.cwd(), '..', 'public')));
  app.use(express.json());
  app.use('/api', mediaRouter);
  app.use(errorHandler);

  return app;
}
