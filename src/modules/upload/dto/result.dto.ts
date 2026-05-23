export class UploadResultDto {
  /** Full secure CDN URL — use directly in API responses */
  url: string;

  /**
   * Cloudinary public_id — store this in your DB.
   * Reconstruct any variant:  `<cloud>/image/upload/w_400,f_auto,q_auto/<publicId>`
   * Required to delete or overwrite the asset later.
   */
  publicId: string;

  width: number;
  height: number;

  /** Bytes */
  bytes: number;

  format: string;
}
