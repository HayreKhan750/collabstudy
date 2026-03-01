import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeTransform } from '../../common/sanitize.util';

export class RegisterDto {
  @IsEmail()
  email: string;

  @Transform(sanitizeTransform)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @Transform(sanitizeTransform)
  @IsString()
  @IsOptional()
  fullName?: string;

  /** Cloudflare Turnstile challenge token — validated server-side */
  @IsString()
  @IsOptional()
  turnstileToken?: string;
}
