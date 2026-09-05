import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class AppController {
  /** Liveness probe used by the host's health check - no authentication. */
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({
    schema: {
      example: { status: 'OK', timestamp: '2026-01-01T00:00:00.000Z' },
    },
  })
  health() {
    return { status: 'OK', timestamp: new Date().toISOString() };
  }
}
