import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MessageEvent } from '@nestjs/common';

export interface NotificationSsePayload {
  count: number; // updated unread count — drives the bell badge
  type: string; // notification type — lets the client show a toast
  title: string;
  body: string;
  titleAr?: string;
  bodyAr?: string;
  referenceType?: string;
  referenceId?: string;
}

@Injectable()
export class NotificationsSseService {
  private readonly logger = new Logger(NotificationsSseService.name);

  /**
   * One Subject per userId.
   * Multiple browser tabs subscribe to the same Subject — all receive the event.
   */
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  /**
   * Track how many open connections exist per user so we only clean up
   * the Subject when the last tab disconnects.
   */
  private readonly refCount = new Map<string, number>();

  // ── Connect ───────────────────────────────────────────────────────────────

  /**
   * Called by the SSE controller endpoint.
   * Returns an Observable the controller streams to the client.
   * Automatically cleans up when the client disconnects.
   */
  connect(userId: string): Observable<MessageEvent> {
    if (!this.subjects.has(userId)) {
      this.subjects.set(userId, new Subject<MessageEvent>());
      this.refCount.set(userId, 0);
    }

    this.refCount.set(userId, (this.refCount.get(userId) ?? 0) + 1);
    this.logger.debug(
      `SSE connected [userId=${userId}] refs=${this.refCount.get(userId)}`,
    );

    return this.subjects
      .get(userId)!
      .asObservable()
      .pipe(finalize(() => this.disconnect(userId)));
  }

  // ── Push ──────────────────────────────────────────────────────────────────

  /**
   * Pushes a notification event to all open tabs for a user.
   * No-op if the user has no active SSE connection (they'll see it on next load).
   */
  push(userId: string, payload: NotificationSsePayload): void {
    const subject = this.subjects.get(userId);
    if (!subject) return;

    subject.next({ data: JSON.stringify(payload) });
    this.logger.debug(`SSE push [userId=${userId}] type=${payload.type}`);
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  private disconnect(userId: string): void {
    const remaining = (this.refCount.get(userId) ?? 1) - 1;

    if (remaining <= 0) {
      // Last tab closed — clean up the Subject entirely
      this.subjects.get(userId)?.complete();
      this.subjects.delete(userId);
      this.refCount.delete(userId);
      this.logger.debug(`SSE fully disconnected [userId=${userId}]`);
    } else {
      this.refCount.set(userId, remaining);
      this.logger.debug(`SSE tab closed [userId=${userId}] refs=${remaining}`);
    }
  }
}
