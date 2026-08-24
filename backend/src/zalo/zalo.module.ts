import { Global, Module } from '@nestjs/common';
import { ZaloController } from './zalo.controller';
import { ZaloAdminGuard } from './zalo-admin.guard';
import { ZaloService } from './zalo.service';
import { ZaloNotifierService } from './zalo-notifier.service';
import { ZaloReportService } from './zalo-report.service';
import { ZaloAssistantService } from './zalo-assistant.service';
import { ZaloUpdatesService } from './zalo-updates.service';

/**
 * Global like MailModule: TasksController reports activity through
 * ZaloNotifierService without every feature module having to import this one.
 */
@Global()
@Module({
  controllers: [ZaloController],
  providers: [
    ZaloService,
    ZaloNotifierService,
    ZaloReportService,
    ZaloAssistantService,
    ZaloUpdatesService,
    ZaloAdminGuard,
  ],
  exports: [ZaloService, ZaloNotifierService, ZaloReportService, ZaloAssistantService],
})
export class ZaloModule {}
