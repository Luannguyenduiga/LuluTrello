import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

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
  const configSwagger = new DocumentBuilder()
    .setTitle('Lulu Trello API')
    .setDescription(
      [
        'REST API of the Lulu Trello workspace.',
        '',
        'Most routes need a session token: call `POST /auth/signin` (or finish the',
        'GitHub handshake), then paste the returned JWT into **Authorize**.',
        'The `/zalo` routes are not user-facing - they authenticate with the',
        '`x-zalo-secret` header instead.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      // Named so @ApiBearerAuth('jwt') on the controllers points at this scheme.
      'jwt',
    )
    .addApiKey({ type: 'apiKey', name: 'x-zalo-secret', in: 'header' }, 'zalo-secret')
    .addTag('Auth', 'Sign-in by email code or GitHub OAuth')
    .addTag('Boards', 'Workspaces, their members and invitations')
    .addTag('Cards', 'Columns inside a board')
    .addTag('Tasks', 'Cards content: tasks, assignees, attachments, comments')
    .addTag('Users', 'Directory and profile editing')
    .addTag('Slides', 'Turning board attachments into a PowerPoint deck')
    .addTag('Admin', 'Admin console - restricted to ADMIN_EMAILS')
    .addTag('Zalo', 'Setup and operations for the Zalo assistant')
    .addTag('Health', 'Liveness probe')
    .build();
  const document = SwaggerModule.createDocument(app, configSwagger);
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: 'swagger/json',
    swaggerOptions: {
      // Keeps the token across page reloads, so the docs stay usable while
      // clicking through a flow.
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

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
