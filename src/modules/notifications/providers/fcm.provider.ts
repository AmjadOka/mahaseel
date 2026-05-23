import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface FcmPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmProvider implements OnModuleInit {
  private readonly logger = new Logger(FcmProvider.name);
  private app: admin.app.App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.config.getOrThrow<string>('FCM_PROJECT_ID'),
          clientEmail: this.config.getOrThrow<string>('FCM_CLIENT_EMAIL'),
          privateKey: this.config
            .getOrThrow<string>('FCM_PRIVATE_KEY')
            .replace(/\\n/g, '\n'),
        }),
      });
    } else {
      this.app = admin.apps[0]!;
    }
    this.logger.log('FcmProvider initialized');
  }

  async send(payload: FcmPayload): Promise<void> {
    const message: admin.messaging.Message = {
      token: payload.token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      android: { priority: 'high' },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    try {
      const result = await this.app.messaging().send(message);
      this.logger.debug(`FCM message sent: ${result}`);
    } catch (err) {
      this.logger.error(`FCM send failed for token ${payload.token}`, err);
      throw err;
    }
  }

  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!tokens.length) return;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high' },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    const response = await this.app.messaging().sendEachForMulticast(message);
    this.logger.log(
      `FCM multicast: ${response.successCount} sent, ${response.failureCount} failed`,
    );
  }
}
