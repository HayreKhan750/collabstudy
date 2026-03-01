import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class UpdateProfileDto {
  @IsOptional()
  @Transform(sanitizeTransform)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, dots, and hyphens',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  // Only allow relative paths or https URLs (prevents SSRF / open-redirect)
  @Matches(/^(\/uploads\/[a-zA-Z0-9\-_.]+|https?:\/\/.+)$/, {
    message: 'avatarUrl must be a valid https URL or an /uploads/ path',
  })
  avatarUrl?: string;
}
