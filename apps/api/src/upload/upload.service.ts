import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly useS3: boolean;
  private readonly r2PublicUrl?: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET_NAME ?? '';
    this.region = process.env.S3_REGION ?? 'us-east-1';
    this.endpoint = process.env.AWS_S3_ENDPOINT || undefined;
    this.r2PublicUrl = process.env.R2_PUBLIC_URL || undefined;

    const isPlaceholder = (val?: string) => !val || val.startsWith('your_');

    // Only enable S3 if credentials and bucket are configured and not placeholders
    this.useS3 =
      Boolean(process.env.AWS_ACCESS_KEY_ID) &&
      !isPlaceholder(process.env.AWS_ACCESS_KEY_ID) &&
      Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
      !isPlaceholder(process.env.AWS_SECRET_ACCESS_KEY) &&
      Boolean(this.bucket) &&
      !isPlaceholder(this.bucket);

    if (this.useS3) {
      const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        // Required for Supabase Storage, Cloudflare R2, MinIO and other
        // S3-compatible providers that use path-style URLs.
        forcePathStyle: true,
      };

      // Support Supabase, Cloudflare R2, MinIO, or any S3-compatible endpoint
      if (this.endpoint) {
        clientConfig.endpoint = this.endpoint;
      }

      this.s3Client = new S3Client(clientConfig);
      this.logger.log(
        `S3 storage enabled → bucket: "${this.bucket}" region: "${this.region}"${this.endpoint ? ` endpoint: "${this.endpoint}"` : ''}`,
      );
      if (this.r2PublicUrl) {
        this.logger.log(`R2 Public URL configured: ${this.r2PublicUrl} (images will use permanent public URLs)`);
      } else {
        this.logger.warn(`R2 Public URL NOT configured — using presigned URLs (expire after 1 hour, may cause 404s)`);
      }
    } else {
      // Dummy client — won't be used; local disk fallback is active
      this.s3Client = new S3Client({ region: 'us-east-1' });
      this.logger.warn(
        'S3 credentials not configured — falling back to local disk storage.',
      );
    }
  }

  /**
   * Upload a file buffer to S3 and return the raw file key (e.g. "uploads/uuid.png").
   * The caller should store this key in the DB and generate pre-signed URLs on
   * read via getPresignedUrl().
   * Falls back gracefully when S3 is not configured (local-disk path).
   */
  // Server-side MIME type whitelist
  private static readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'video/mp4','video/webm','video/quicktime','video/x-msvideo',
    'audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip','application/x-rar-compressed','application/x-7z-compressed',
    'text/plain','text/csv',
  ]);

  validateFile(file: Express.Multer.File): void {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || String(50 * 1024 * 1024), 10);
    if (file.size > maxSize) {
      throw new BadRequestException(`File too large — max ${maxSize / 1024 / 1024} MB`);
    }
    if (!UploadService.ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type '${file.mimetype}' is not permitted`);
    }
    // Sanitize filename — strip path-traversal chars
    file.originalname = file.originalname
      .replace(/[^a-zA-Z0-9._\-\s]/g, '_')
      .slice(0, 255);
  }

  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<string> {
    const ext = extname(originalName) || '';
    const key = `uploads/${randomUUID()}${ext}`;

    if (!this.useS3) {
      // Should not be reached in production; controller falls back to disk
      throw new InternalServerErrorException(
        'S3 is not configured. Please set AWS_* environment variables.',
      );
    }

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          // No ACL — bucket is private; access via pre-signed URLs only.
        }),
      );
    } catch (err) {
      this.logger.error('S3 upload failed', err);
      throw new InternalServerErrorException('File upload to S3 failed.');
    }

    // Return the raw storage key, NOT a public URL.
    // The controller will store this key in the database.
    return key;
  }

  /**
   * Generate a time-limited pre-signed GET URL for a stored file key.
   * If R2_PUBLIC_URL is configured, returns a permanent public URL instead.
   * Returns the key unchanged when S3 is not configured (local-disk mode).
   *
   * @param fileKey  The raw key returned by uploadFile() or a local disk path/URL.
   * @param expiresIn Lifetime in seconds (default: 3600 = 1 hour).
   */
  async getPresignedUrl(fileKey: string, expiresIn = 3600): Promise<string> {
    // If S3 is disabled or the stored value already looks like a full URL
    // (e.g. a legacy local http:// URL), return it as-is.
    if (!this.useS3 || fileKey.startsWith('http://') || fileKey.startsWith('https://')) {
      return fileKey;
    }

    // If R2 public URL is configured, return permanent public URL
    if (this.r2PublicUrl) {
      // Remove leading slash from fileKey if present
      const cleanKey = fileKey.startsWith('/') ? fileKey.slice(1) : fileKey;
      const publicUrl = `${this.r2PublicUrl}/${cleanKey}`;
      this.logger.debug(`Generated public URL: ${publicUrl}`);
      return publicUrl;
    }

    // Otherwise, generate a presigned URL (expires after expiresIn seconds)
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (err) {
      this.logger.error(`Failed to generate pre-signed URL for key "${fileKey}"`, err);
      // Degrade gracefully — return the key so the client can at least see what's stored
      return fileKey;
    }
  }

  /** Returns true when S3 credentials are configured and active. */
  isS3Enabled(): boolean {
    return this.useS3;
  }
}
