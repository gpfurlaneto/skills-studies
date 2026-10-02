import { Controller, Get } from '@nestjs/common';

@Controller('__ROUTE__')
export class __CONTROLLER_CLASS__ {
  @Get()
  getMessage(): string {
    return '__MESSAGE__';
  }
}
