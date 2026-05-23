import {
  Controller,
  Post,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UploadService, UPLOAD_FOLDERS, UploadFolder } from './upload.service';
import { FileValidationPipe } from './validation.pipe';

const VALID_FOLDERS = Object.keys(UPLOAD_FOLDERS) as UploadFolder[];

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /upload/:folder
   * Uploads a single image and returns { url, publicId, ... }.
   * Store publicId in your entity — use it for deletions and URL generation.
   *
   * Folder must be one of: product | farm | merchant | auction | category
   */
  @Post(':folder')
  @ApiOperation({ summary: 'Upload an image for a given entity folder' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @Param('folder') folder: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  ) {
    if (!VALID_FOLDERS.includes(folder as UploadFolder)) {
      throw new BadRequestException(
        `Invalid folder. Must be one of: ${VALID_FOLDERS.join(', ')}`,
      );
    }

    return this.uploadService.upload(file, folder as UploadFolder);
  }

  /**
   * DELETE /upload?publicId=mahaseel/products/abc123
   * Deletes an asset from Cloudinary by its public_id.
   * Call this when removing an entity that owns an image.
   */
  @Delete()
  @ApiOperation({ summary: 'Delete an uploaded asset by publicId' })
  @ApiQuery({ name: 'publicId', required: true })
  delete(@Query('publicId') publicId: string) {
    if (!publicId) throw new BadRequestException('publicId is required');
    return this.uploadService.delete(publicId);
  }
}
