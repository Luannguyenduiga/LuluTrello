import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Add this line to allow large file uploads with limit 50mb
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  const config = app.get(ConfigService);
  const clientUrl = (config.get<string>('CLIENT_URL') || 'http://localhost:5173').replace(
    /\/+$/,
    '',
  );

  app.enableCors({
    // The deployed SPA plus the local Vite dev/preview servers; nothing else.
    origin: [...new Set([clientUrl, 'http://localhost:5173', 'http://localhost:4173'])],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties the DTO does not declare
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const port = config.get<number>('PORT') || 5090;

  await app.listen(port);
  new Logger('Bootstrap').log(`Lulu Trello Server running on port ${port}`);
}

bootstrap().catch((error) => {
  // Firestore credentials missing/invalid surfaces here; fail loudly rather
  // than leaving a half-started process behind.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
