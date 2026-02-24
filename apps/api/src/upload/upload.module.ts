import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

// Use memory storage when S3 is configured (we need the buffer),
// fall back to disk storage for local development.
const isPlaceholder = (val?: string) => !val || val.startsWith('your_');

const s3Enabled =
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  !isPlaceholder(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
  !isPlaceholder(process.env.AWS_SECRET_ACCESS_KEY) &&
  Boolean(process.env.AWS_S3_BUCKET_NAME) &&
  !isPlaceholder(process.env.AWS_S3_BUCKET_NAME);

@Module({
  imports: [
    MulterModule.register({
      storage: s3Enabled
        ? memoryStorage()
        : diskStorage({
            destination: join(process.cwd(), 'uploads'),
            filename: (_req, file, cb) => {
              const unique = randomUUID();
              cb(null, `${unique}${extname(file.originalname)}`);
            },
          }),
      limits: {
        fileSize: parseInt(
          process.env.MAX_FILE_SIZE || String(50 * 1024 * 1024),
          10,
        ), // 50 MB default
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
