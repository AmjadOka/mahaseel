import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { FilterMarketDto } from 'src/modules/products/dto/create-product.dto';

// src/common/validators/price-range.validator.ts
export function IsPriceRangeValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPriceRangeValid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const dto = args.object as FilterMarketDto;
          if (dto.priceMin !== undefined && dto.priceMax !== undefined) {
            return dto.priceMin <= dto.priceMax;
          }
          return true;
        },
        defaultMessage: () => 'priceMin must be less than or equal to priceMax',
      },
    });
  };
}
