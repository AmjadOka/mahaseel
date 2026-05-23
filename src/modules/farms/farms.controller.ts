import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { CreateFarmDto, UpdateFarmDto } from './dto/create-farm.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import type { AuthUser } from 'src/common/types';

@ApiTags('farms')
@Controller('farms')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.MERCHANT)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get()
  @ApiOperation({ summary: 'List merchant own farms' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.farmsService.findMyFarms(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create farm (with optional registry doc upload)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFarmDto,
    @Req() req?: any,
  ) {
    let registryFile;
    if (req.isMultipart && req.isMultipart()) {
      const data = await req.file();
      if (data) {
        registryFile = {
          buffer: await data.toBuffer(),
          filename: data.filename,
          mimetype: data.mimetype,
        };
      }
    }
    return this.farmsService.create(user.sub, dto, registryFile);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get farm detail' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.farmsService.findOne(id, user.sub);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update farm' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateFarmDto,
  ) {
    return this.farmsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete farm' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.farmsService.softDelete(id, user.sub);
  }

  @Post('approve/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Approve a farm registration' })
  approve(@Param('id') id: string) {
    return this.farmsService.approve(id);
  }
}
