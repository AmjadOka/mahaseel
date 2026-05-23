import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, ip } = req;
    const userId = req.user?.id || 'anonymous';
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(
            `${method} ${url} ${res.statusCode} — ${Date.now() - now}ms [user:${userId}] [ip:${ip}]`,
          );
        },
        error: (err) => {
          this.logger.error(
            `${method} ${url} ${err.status || 500} — ${Date.now() - now}ms [user:${userId}]`,
          );
        },
      }),
    );
  }
}
