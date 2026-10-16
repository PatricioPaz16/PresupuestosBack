import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: { fullName: 'ASC' },
    });
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  async recordFailedLogin(
    userId: string,
    failedAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      failedLoginAttempts: failedAttempts,
      lockedUntil,
    });
  }
}
