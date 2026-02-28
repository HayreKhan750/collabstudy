import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, username, password, fullName } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already exists');
      }
      throw new ConflictException('Username already exists');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashedPassword,
        fullName,
        status: UserStatus.ONLINE,
      },
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

    // Generate JWT token
    const token = this.generateToken(user.id, user.email);

    return {
      user,
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update user status to online
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ONLINE },
    });

    // Generate JWT token
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

  private generateToken(userId: string, email: string): string {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload);
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
      // UPSERT: always refresh avatar + link googleId on every login
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.googleId !== googleId && { googleId }),
          // Refresh avatar on every login — eliminates stale Google CDN URLs
          ...(avatar && { avatar }),
          ...(fullName && !user.fullName && { fullName }),
        },
      });
    } else {
      // Create new OAuth user — no password needed
      const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
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
}
