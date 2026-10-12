import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

interface SseClient {
  id: string;
  tenantId: string;
  branchId?: string;
  res: Response;
}

@Injectable()
export class EventsService {
  private clients: SseClient[] = [];

  addClient(id: string, tenantId: string, branchId: string | undefined, res: Response) {
    this.clients.push({ id, tenantId, branchId, res });

    // Send initial connection handshake event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', clientId: id, timestamp: new Date().toISOString() })}\n\n`);

    // Clean up when client disconnects
    res.on('close', () => {
      this.removeClient(id);
    });
  }

  removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
  }

  broadcast(tenantId: string, eventName: string, payload: any, branchId?: string) {
    for (const client of this.clients) {
      // Only broadcast to matching tenant
      if (client.tenantId !== tenantId) continue;
      // If client is scoped to a specific branch, only broadcast matching branch events
      if (client.branchId && branchId && client.branchId !== branchId) continue;

      try {
        client.res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        this.removeClient(client.id);
      }
    }
  }

  getClientCount(tenantId?: string): number {
    if (!tenantId) return this.clients.length;
    return this.clients.filter((c) => c.tenantId === tenantId).length;
  }
}
