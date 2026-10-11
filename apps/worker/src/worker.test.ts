import { describe, it, expect } from 'vitest';
import { OutboxPublisher } from './main.js';

describe('Worker OutboxPublisher invariants', () => {
  it('instantiates OutboxPublisher cleanly', () => {
    const publisher = new OutboxPublisher();
    expect(publisher).toBeDefined();
    expect(typeof publisher.start).toBe('function');
    expect(typeof publisher.stop).toBe('function');
  });
});
