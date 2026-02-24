import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class CreateWorkspaceDto {
  @Transform(sanitizeTransform)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
