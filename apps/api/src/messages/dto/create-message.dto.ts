import { IsString, IsOptional, IsUUID, IsArray, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class CreateMessageDto {
  // content is optional when a fileUrl is provided (file-only messages)
  @ValidateIf((o: CreateMessageDto) => !o.fileUrl)
  @Transform(sanitizeTransform)
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentionIds?: string[];

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  fileSize?: number;

  @IsOptional()
  @IsString()
  originalName?: string;
}
