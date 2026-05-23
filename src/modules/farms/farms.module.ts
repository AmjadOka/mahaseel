import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';
import { Farm, FarmMedia } from './entities/farm.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Farm, FarmMedia]),
    NotificationsModule,
    UploadModule,
  ],
  providers: [FarmsService],
  controllers: [FarmsController],
  exports: [FarmsService, TypeOrmModule],
})
export class FarmsModule {}
