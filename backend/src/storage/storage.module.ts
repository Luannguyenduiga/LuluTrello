import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global: attachments are read by the tasks routes, the preview viewer and the
 * slide builder, and every one of them needs the same single client.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
