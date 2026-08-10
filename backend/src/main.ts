import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*', // Allow all origins for dev testing
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties the DTO does not declare
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') || 5090;

  await app.listen(port);
  new Logger('Bootstrap').log(`Mini Trello Server running on port ${port}`);
}

bootstrap().catch((error) => {
  // Firestore credentials missing/invalid surfaces here; fail loudly rather
  // than leaving a half-started process behind.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
