import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller.js';
import { BoardController } from './board.controller.js';
import { EventsController } from './events.controller.js';
import { PropertiesService } from './properties.service.js';
import { BoardService } from './board.service.js';
import { EventsModule } from './events.module.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [ConfigModule, EventsModule],
  controllers: [PropertiesController, BoardController, EventsController],
  providers: [PropertiesService, BoardService],
  exports: [PropertiesService, BoardService],
})
export class PropertiesModule {}
