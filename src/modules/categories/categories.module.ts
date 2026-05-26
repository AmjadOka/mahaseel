import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';
import {
  AdminCategoriesController,
  CategoriesController,
} from './categories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Category])],
  providers: [CategoriesService],
  controllers: [CategoriesController, AdminCategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}
