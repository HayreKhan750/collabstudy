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

    let fileUrl: string;
    let filename: string;

    if (this.uploadService.isS3Enabled()) {
      // ── S3 / R2 / MinIO path ───────────────────────────────────────────────
      // Multer is in memoryStorage mode; file.buffer contains the raw bytes.
      fileUrl = await this.uploadService.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      // Use the last path segment as the "filename" for convenience
      filename = fileUrl.split('/').pop() ?? file.originalname;
    } else {
      // ── Local disk fallback (development) ─────────────────────────────────
      // Multer diskStorage already wrote the file; file.filename is the UUID name.
      const API_URL = process.env.API_URL || 'http://localhost:4000';
      fileUrl = `${API_URL}/uploads/${file.filename}`;
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
