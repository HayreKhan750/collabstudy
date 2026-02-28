import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  Redirect,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Strict: max 5 register attempts per minute (brute-force protection)
  @Post('register')
  @Throttle({ strict: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // Strict: max 10 login attempts per minute (credential stuffing protection)
  @Post('login')
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    return this.authService.logout(req.user.userId);
  }

  /**
   * GET /auth/google
   * Redirects to Google OAuth consent screen.
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard handles redirect
  }

  /**
   * GET /auth/google/callback
   * Google calls back here after user consents.
   * Issues a JWT and redirects to the frontend.
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: any, @Res() res: any) {
    const { token } = req.user;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Redirect to frontend with token in query param (frontend stores in localStorage)
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
}
