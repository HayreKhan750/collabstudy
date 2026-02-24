import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class EditMessageDto {
  @Transform(sanitizeTransform)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}
