import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @Throttle({ upload: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    // Server-side MIME type + size + filename sanitization
    this.uploadService.validateFile(file);

    let fileUrl: string;
    let filename: string;

    if (this.uploadService.isS3Enabled()) {
      // ── S3 / R2 / MinIO path ───────────────────────────────────────────────
      // Multer is in memoryStorage mode; file.buffer contains the raw bytes.
      if (!file.buffer) {
        throw new BadRequestException('File buffer is missing — ensure S3 credentials are configured correctly');
      }
      fileUrl = await this.uploadService.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      // Use the last path segment as the "filename" for convenience
      filename = fileUrl.split('/').pop() ?? file.originalname;
    } else {
      // ── Local disk fallback (development / no S3 configured) ──────────────
      // Multer diskStorage already wrote the file; file.filename is the UUID name.
      // In production without S3, we still serve uploads via the static files route.
      if (!file.filename && file.buffer) {
        // memoryStorage was used but S3 is not configured — write buffer to disk manually
        const { randomUUID } = await import('crypto');
        const { extname, join } = await import('path');
        const { writeFile } = await import('fs/promises');
        const ext = extname(file.originalname) || '';
        const fname = `${randomUUID()}${ext}`;
        const dest = join(process.cwd(), 'uploads', fname);
        await writeFile(dest, file.buffer);
        file.filename = fname;
      }
      // Construct the full URL for local file serving
      // In production: use API_URL env var (e.g., https://api.yourdomain.com)
      // In development: default to http://localhost:4000
      const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
      fileUrl = `${apiUrl}/uploads/${file.filename}`;
      filename = file.filename;
    }

    return {
      url: fileUrl,
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      fileSize: file.size,
    };
  }
}
