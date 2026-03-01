import { IsString, IsOptional, IsUUID, IsArray, MaxLength, ValidateIf, IsBoolean, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class PollDto {
  @Transform(sanitizeTransform)
  @IsString()
  @MaxLength(500)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? (value as string[]).map((o) => o.replace(/<[^>]*>/g, '').trim()) : value,
  )
  options: string[];

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}

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
  @ValidateNested()
  @Type(() => PollDto)
  poll?: PollDto;
}
