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
  Req,
  BadRequestException,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { CreateFarmDto, UpdateFarmDto } from './dto/create-farm.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from 'src/common/enums/role.enum';
import type { AuthUser } from 'src/common/types';
import { FilesValidationPipe } from '../upload/validation.pipe';
import type { FastifyRequest } from 'fastify';
import { FarmAssetKind } from './entities/farm.entity';

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

  @Patch(':id/media')
  @ApiOperation({ summary: 'Upload farm images/videos (max 10)' })
  @ApiConsumes('multipart/form-data')
  async uploadMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    const files = await this.parseMultipart(req);
    return this.farmsService.uploadAssets(
      id,
      user.sub,
      files,
      FarmAssetKind.MEDIA,
    );
  }

  @Patch(':id/documents')
  @ApiOperation({ summary: 'Upload farm documents' })
  @ApiConsumes('multipart/form-data')
  async uploadDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    const files = await this.parseMultipart(req);
    return this.farmsService.uploadAssets(
      id,
      user.sub,
      files,
      FarmAssetKind.DOCUMENT,
    );
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.farmsService.deleteAsset(
      id,
      mediaId,
      user.sub,
      FarmAssetKind.MEDIA,
    );
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.farmsService.deleteAsset(
      id,
      documentId,
      user.sub,
      FarmAssetKind.DOCUMENT,
    );
  }

  private async parseMultipart(
    req: FastifyRequest,
  ): Promise<Express.Multer.File[]> {
    const files: Express.Multer.File[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        files.push({
          fieldname: part.fieldname,
          originalname: part.filename,
          mimetype: part.mimetype,
          buffer,
          size: buffer.length,
          encoding: part.encoding,
        } as Express.Multer.File);
      }
    }

    if (!files.length) {
      throw new BadRequestException('No files provided');
    }

    new FilesValidationPipe().transform(files);
    return files;
  }
}
