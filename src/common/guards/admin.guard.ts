import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../enums/role.enum';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const adminSecret = request.headers['x-admin-secret'];

    if (user?.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    if (adminSecret !== this.config.get('app.adminSecret')) {
      throw new ForbiddenException('Invalid admin secret');
    }

    return true;
  }
}
