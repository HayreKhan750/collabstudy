import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class SearchMessagesDto {
  @Transform(sanitizeTransform)
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsUUID('4')
  workspaceId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}
