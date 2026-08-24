import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AppController } from './app.controller';
import { FirestoreModule } from './common/firestore/firestore.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { MailModule } from './mail/mail.module';
import { ZaloModule } from './zalo/zalo.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BoardsModule } from './boards/boards.module';
import { CardsModule } from './cards/cards.module';
import { TasksModule } from './tasks/tasks.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolved from this file rather than process.cwd(), so the variables load
      // the same way whether the server starts from the workspace root or backend/.
      // Precedence: real env vars > backend/.env > workspace-root .env
      envFilePath: [join(__dirname, '..', '.env'), join(__dirname, '..', '..', '.env')],
    }),
    FirestoreModule,
    RealtimeModule,
    MailModule,
    ZaloModule,
    AuthModule,
    UsersModule,
    // BoardsModule before CardsModule/TasksModule: its longer invite routes
    // (/boards/:boardId/cards/:id/invite/accept) must be matched first.
    BoardsModule,
    CardsModule,
    TasksModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
