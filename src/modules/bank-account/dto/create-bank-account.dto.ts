import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, Length, IsOptional, Matches } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Arab Bank' })
  @IsString()
  @Length(2, 100)
  bankName: string;

  @ApiProperty({ example: 'Ahmed Al-Nabulsi' })
  @IsString()
  @Length(2, 150)
  accountHolderName: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @Length(5, 50)
  @Matches(/^[0-9A-Za-z-]+$/, {
    message: 'accountNumber must be alphanumeric',
  })
  accountNumber: string;

  @ApiPropertyOptional({ example: 'PS92ARAB000000000123456702' })
  @IsOptional()
  @IsString()
  @Length(15, 34)
  iban?: string;

  @ApiPropertyOptional({ example: 'Ramallah branch' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  branchName?: string;
}

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {}
