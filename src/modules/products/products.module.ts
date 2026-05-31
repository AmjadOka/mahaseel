import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { MarketController, ProductsController } from './products.controller';
import { Product, ProductMedia } from './entities/product.entity';
import { FarmsModule } from '../farms/farms.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductMedia]),
    FarmsModule,
    CategoriesModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController, MarketController],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
