import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class FilesValidationPipe implements PipeTransform {
  transform(files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('No files provided');
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype))
        throw new BadRequestException(`Invalid type: ${file.mimetype}`);
      if (file.size > MAX_FILE_SIZE_BYTES)
        throw new BadRequestException(`File too large: ${file.originalname}`);
    }
    return files;
  }
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(file: Express.Multer.File) {
    // ← single, not array
    if (!file) throw new BadRequestException('No file provided');

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid type: ${file.mimetype}`);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File too large`);
    }

    return file;
  }
}
