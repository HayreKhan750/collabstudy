import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** Cloudflare Turnstile challenge token — validated server-side */
  @IsString()
  @IsOptional()
  turnstileToken?: string;
}
