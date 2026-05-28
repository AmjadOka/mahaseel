import { Global, Module } from '@nestjs/common';

import { CloudinaryProvider } from './cloudinary.provider';
import { UploadService } from './upload.service';

@Global()
@Module({
  providers: [CloudinaryProvider, UploadService],
  exports: [UploadService],
})
export class UploadModule {}
