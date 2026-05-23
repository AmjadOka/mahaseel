import {
  Injectable,
  Inject,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiOptions,
  UploadApiResponse,
} from 'cloudinary';

import { CLOUDINARY } from './cloudinary.provider';
import { UploadResultDto } from './dto/result.dto';

// ─── Folder map — one folder per entity type ──────────────────────────────────

export const UPLOAD_FOLDERS = {
  product: 'mahaseel/products',
  farm: 'mahaseel/farms',
  users: 'mahaseel/users',
  auction: 'mahaseel/auctions',
  category: 'mahaseel/categories',
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinaryClient: typeof cloudinary,
  ) {}

  // ── Upload ─────────────────────────────────────────────────────────────────

  async upload(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<UploadResultDto> {
    const cloudFolder = UPLOAD_FOLDERS[folder];

    const result = await this.streamToCloudinary(file.buffer, {
      folder: cloudFolder,
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });

    this.logger.log(`Uploaded [${result.public_id}] to ${cloudFolder}`);

    return this.toDto(result);
  }

  /**
   * Uploads new file first, then deletes old asset —
   * old URL stays valid until the new one is confirmed.
   */
  async replace(
    file: Express.Multer.File,
    folder: UploadFolder,
    oldPublicId: string,
  ): Promise<UploadResultDto> {
    const newAsset = await this.upload(file, folder);
    await this.delete(oldPublicId);
    return newAsset;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(publicId: string): Promise<void> {
    try {
      const result = await this.cloudinaryClient.uploader.destroy(publicId);
      if (result.result !== 'ok' && result.result !== 'not found') {
        this.logger.warn(
          `Unexpected delete result for [${publicId}]: ${result.result}`,
        );
      }
    } catch (err) {
      // Log but never throw — a failed delete must not block the caller.
      this.logger.error(`Failed to delete asset [${publicId}]`, err);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private streamToCloudinary(
    buffer: Buffer,
    options: UploadApiOptions, // ✅ explicit instead of Parameters<>
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        options,
        (error, result) => {
          if (error || !result) {
            reject(
              new InternalServerErrorException(
                error?.message ?? 'Cloudinary upload failed',
              ),
            );
          } else {
            resolve(result);
          }
        },
      );

      uploadStream.end(buffer);
    });
  }

  private toDto(result: UploadApiResponse): UploadResultDto {
    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
    };
  }
}
