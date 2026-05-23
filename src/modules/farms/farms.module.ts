import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';
import { Farm } from './entities/farm.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Farm])],
  providers: [FarmsService],
  controllers: [FarmsController],
  exports: [FarmsService, TypeOrmModule],
})
export class FarmsModule {}
