import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { CreateFarmDto, UpdateFarmDto } from './dto/create-farm.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import type { AuthUser } from 'src/common/types';
import { FileValidationPipe } from '../upload/validation.pipe';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@ApiTags('farms')
@Controller('farms')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Roles(Role.MERCHANT)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  @ApiOperation({ summary: 'Create farm' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFarmDto) {
    return this.farmsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List merchant own farms' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.farmsService.findMyFarms(user.sub);
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
  @Post(':id/media')
  @ApiOperation({ summary: 'Upload farm images/videos (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  uploadMedia(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!Array.isArray(files)) files = [files];

    const pipe = new FileValidationPipe();
    files.forEach((f) => pipe.transform(f));

    return this.farmsService.uploadMedia(id, user.sub, files);
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a farm media item' })
  deleteMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.farmsService.deleteMedia(id, mediaId, user.sub);
  }
}
