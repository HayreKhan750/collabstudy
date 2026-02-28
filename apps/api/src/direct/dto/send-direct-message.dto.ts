import { IsOptional, IsString, MaxLength, ValidateIf, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class SendDirectMessageDto {
  // content is optional when a fileUrl is provided (file-only messages)
  @ValidateIf((o: SendDirectMessageDto) => !o.fileUrl)
  @Transform(sanitizeTransform)
  @IsString()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @IsOptional()
  @IsString()
  originalName?: string;

  /** Optional parentId for DM thread replies (future use). */
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  forwardedFromId?: string;

  @IsOptional()
  @IsString()
  forwardedFromUsername?: string;
}
