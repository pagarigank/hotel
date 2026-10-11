import { Injectable } from '@nestjs/common';
import pg from 'pg';
import { uuidv7 } from 'uuidv7';

export interface DomainEvent<T = any> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
}

@Injectable()
export class OutboxService {
  /**
   * Save domain event to outbox inside the caller's transaction
   */
  async emit<T>(
    client: pg.PoolClient,
    tenantId: string,
    event: DomainEvent<T>
  ): Promise<string> {
    const id = uuidv7();
    await client.query(
      `INSERT INTO outbox_events (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [
        id,
        tenantId,
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.payload),
      ]
    );
    return id;
  }
}
