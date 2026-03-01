import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto, ResendVerificationDto } from './dto/verify-email.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { UserStatus } from '@prisma/client';
import { verifyTurnstileToken } from './utils/turnstile.util';
import { isDisposableEmail } from './utils/disposable-domains';
import { Resend } from 'resend';

// OTP config
const OTP_EXPIRY_MINUTES = 15;
const OTP_DIGITS = 6;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly resend: Resend | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.resend = process.env.RESEND_API_KEY
      ? new Resend(process.env.RESEND_API_KEY)
      : null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private generateOtp(): string {
    // Cryptographically secure 6-digit OTP
    const bytes = crypto.randomBytes(4);
    const num = bytes.readUInt32BE(0) % 1_000_000;
    return num.toString().padStart(OTP_DIGITS, '0');
  }

  private otpExpiry(): Date {
    const d = new Date();
    d.setMinutes(d.getMinutes() + OTP_EXPIRY_MINUTES);
    return d;
  }

  private generateToken(userId: string, email: string): string {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload);
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const appName = process.env.APP_NAME || 'CollabStudy';
    // Use Resend's built-in onboarding address when no verified domain is configured.
    // This works on any Resend account without domain verification.
    // For production: set RESEND_FROM_EMAIL to a verified domain address.
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const from = `${appName} <${fromEmail}>`;

    if (!this.resend) {
      console.warn(`[Auth] RESEND_API_KEY not set. Email to ${to}:\n${subject}`);
      return;
    }

    const result = await this.resend.emails.send({ from, to: [to], subject, html });
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
    console.log(`[Auth] Email sent to ${to} (id=${result.data?.id})`);
  }

  private async sendVerificationEmail(email: string, otp: string): Promise<void> {
    const appName = process.env.APP_NAME || 'CollabStudy';
    const subject = `Your ${appName} verification code: ${otp}`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1118;color:#e2e8f0;border-radius:12px">
        <h2 style="margin:0 0 8px;font-size:22px;color:#a78bfa">Verify your email</h2>
        <p style="margin:0 0 24px;color:#94a3b8;font-size:15px">
          Thanks for signing up for <strong style="color:#e2e8f0">${appName}</strong>!
          Enter the code below to activate your account.
        </p>
        <div style="background:#1e2235;border-radius:10px;padding:20px 24px;text-align:center;letter-spacing:10px;font-size:36px;font-weight:700;color:#a78bfa;margin-bottom:24px">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px;margin:0">
          This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    `;
    await this.sendEmail(email, subject, html);
  }

  // ── Register ──────────────────────────────────────────────────────────────

  async register(registerDto: RegisterDto, remoteIp?: string) {
    const { email, username, password, fullName, turnstileToken } = registerDto;

    // 1. Cloudflare Turnstile bot check
    const turnstileOk = await verifyTurnstileToken(turnstileToken, remoteIp);
    if (!turnstileOk) {
      throw new BadRequestException('Bot verification failed. Please try again.');
    }

    // 2. Block disposable email domains
    if (isDisposableEmail(email)) {
      throw new BadRequestException(
        'Disposable email addresses are not allowed. Please use a real email.',
      );
    }

    // 3. Check for existing user
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already registered');
      }
      throw new ConflictException('Username already taken');
    }

    // 4. Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 5. Generate OTP and store hashed version
    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // 6. Create user — NOT yet verified
    await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashedPassword,
        fullName,
        status: UserStatus.OFFLINE,
        emailVerified: false,
        verificationToken: hashedOtp,
        verificationExpiry: this.otpExpiry(),
      },
    });

    // 7. Send verification email (fire-and-forget; errors logged not thrown)
    this.sendVerificationEmail(email, otp).catch((err) =>
      console.error('[Auth] Failed to send verification email:', err),
    );

    return {
      message: 'Account created. Please check your email for a 6-digit verification code.',
      email,
    };
  }

  // ── Verify Email ──────────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto) {
    const { email, otp } = dto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new BadRequestException('Invalid verification request');
    }

    if (user.emailVerified) {
      // Already verified — just return a token so the frontend can proceed
      const token = this.generateToken(user.id, user.email);
      return {
        message: 'Email already verified',
        user: this.safeUser(user),
        token,
      };
    }

    // Check expiry
    if (!user.verificationToken || !user.verificationExpiry) {
      throw new BadRequestException('No verification pending. Please register again.');
    }

    if (new Date() > user.verificationExpiry) {
      throw new BadRequestException(
        'Verification code has expired. Please request a new one.',
      );
    }

    // Compare OTP
    const isOtpValid = await bcrypt.compare(otp, user.verificationToken);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Mark verified and clear OTP fields
    const verifiedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationExpiry: null,
        status: UserStatus.ONLINE,
      },
    });

    const token = this.generateToken(verifiedUser.id, verifiedUser.email);

    return {
      message: 'Email verified successfully',
      user: this.safeUser(verifiedUser),
      token,
    };
  }

  // ── Resend Verification ───────────────────────────────────────────────────

  async resendVerification(dto: ResendVerificationDto) {
    const { email } = dto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return 200 to prevent user enumeration
    if (!user || user.emailVerified) {
      return { message: 'If that email exists and is unverified, a new code has been sent.' };
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashedOtp,
        verificationExpiry: this.otpExpiry(),
      },
    });

    this.sendVerificationEmail(email, otp).catch((err) =>
      console.error('[Auth] Failed to resend verification email:', err),
    );

    return { message: 'If that email exists and is unverified, a new code has been sent.' };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(loginDto: LoginDto, remoteIp?: string) {
    const { email, password, turnstileToken } = loginDto;

    // 1. Cloudflare Turnstile bot check
    const turnstileOk = await verifyTurnstileToken(turnstileToken, remoteIp);
    if (!turnstileOk) {
      throw new BadRequestException('Bot verification failed. Please try again.');
    }

    // 2. Find user
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Block unverified accounts — resend OTP silently
    if (!user.emailVerified) {
      // Quietly refresh the OTP so the user can verify after this error
      const otp = this.generateOtp();
      const hashedOtp = await bcrypt.hash(otp, 10);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: hashedOtp,
          verificationExpiry: this.otpExpiry(),
        },
      });
      this.sendVerificationEmail(email, otp).catch((err) =>
        console.error('[Auth] Failed to resend verification email on login:', err),
      );

      throw new ForbiddenException({
        message: 'Please verify your email before signing in. A new code has been sent.',
        code: 'EMAIL_NOT_VERIFIED',
        email,
      });
    }

    // 5. Set online
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ONLINE },
    });

    const token = this.generateToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar,
        status: UserStatus.ONLINE,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  // ── Validate User (JWT strategy) ──────────────────────────────────────────

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async getProfile(userId: string) {
    return this.validateUser(userId);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.OFFLINE },
    });

    return { message: 'Logged out successfully' };
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  async findOrCreateGoogleUser(data: {
    email: string;
    fullName?: string;
    avatar?: string | null;
    googleId: string;
  }): Promise<{ user: any; token: string }> {
    const { email, fullName, avatar, googleId } = data;

    // 1. Try to find by googleId first (survives email changes)
    let user = await this.prisma.user.findUnique({ where: { googleId } });

    // 2. Fallback: find by email (handles existing accounts before OAuth)
    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      const isCurrentAvatarGoogle =
        user.avatar?.includes('googleusercontent.com') ?? false;
      const shouldUpdateAvatar = avatar && (!user.avatar || isCurrentAvatarGoogle);

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.googleId !== googleId && { googleId }),
          ...(shouldUpdateAvatar && { avatar }),
          ...(fullName && !user.fullName && { fullName }),
          // Google verifies the email — mark verified if not already
          emailVerified: true,
          verificationToken: null,
          verificationExpiry: null,
        },
      });
    } else {
      // Create new OAuth user — no password needed
      const baseUsername = email
        .split('@')[0]
        .replace(/[^a-z0-9_]/gi, '_')
        .toLowerCase();
      let username = baseUsername;
      let suffix = 1;
      while (await this.prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${suffix++}`;
      }

      user = await this.prisma.user.create({
        data: {
          email,
          username,
          fullName: fullName ?? null,
          avatar: avatar ?? null,
          passwordHash: '',
          googleId,
          status: UserStatus.ONLINE,
          // Google already verified the email
          emailVerified: true,
        },
      });
    }

    const token = this.generateToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  // ── Forgot Password ───────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const { email } = dto;
    const genericResponse = {
      message: 'If that email is registered, a password reset code has been sent.',
    };

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return 200 — prevents user enumeration
    if (!user) return genericResponse;

    // Generate a 6-digit reset OTP
    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Store with 15-minute expiry
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedOtp,
        passwordResetExpiry: this.otpExpiry(),
      },
    });

    const appName = process.env.APP_NAME || 'CollabStudy';
    const subject = `Your ${appName} password reset code: ${otp}`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1118;color:#e2e8f0;border-radius:12px">
        <h2 style="margin:0 0 8px;font-size:22px;color:#a78bfa">Reset your password</h2>
        <p style="margin:0 0 24px;color:#94a3b8;font-size:15px">
          We received a password reset request for your <strong style="color:#e2e8f0">${appName}</strong> account.
          Enter the code below to set a new password.
        </p>
        <div style="background:#1e2235;border-radius:10px;padding:20px 24px;text-align:center;letter-spacing:10px;font-size:36px;font-weight:700;color:#a78bfa;margin-bottom:24px">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px;margin:0">
          This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
          If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
    `;

    this.sendEmail(email, subject, html).catch((err) =>
      console.error('[Auth] Failed to send password reset email:', err),
    );

    return genericResponse;
  }

  // ── Reset Password ────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const { email, token, newPassword } = dto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordResetToken || !user.passwordResetExpiry) {
      throw new BadRequestException('Invalid or expired password reset request.');
    }

    // Check expiry
    if (new Date() > user.passwordResetExpiry) {
      throw new BadRequestException('Reset code has expired. Please request a new one.');
    }

    // Compare token
    const isTokenValid = await bcrypt.compare(token, user.passwordResetToken);
    if (!isTokenValid) {
      throw new BadRequestException('Invalid reset code.');
    }

    // Hash new password and clear reset fields
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
        // Ensure the account is marked verified (covers edge case where someone
        // resets without ever verifying — they proved email ownership via this flow)
        emailVerified: true,
        verificationToken: null,
        verificationExpiry: null,
      },
    });

    return { message: 'Password reset successfully. You can now sign in with your new password.' };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private safeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatar: user.avatar,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
