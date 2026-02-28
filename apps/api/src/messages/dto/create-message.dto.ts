import { IsString, IsOptional, IsUUID, IsArray, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class CreateMessageDto {
  // content is optional when a fileUrl or poll is provided
  @ValidateIf((o: CreateMessageDto) => !o.fileUrl && !o.poll)
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

  @IsOptional()
  @IsString()
  forwardedFromId?: string;

  @IsOptional()
  poll?: {
    question: string;
    options: string[];
  };
}
