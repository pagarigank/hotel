import { describe, it, expect } from 'vitest';
import { Money } from './money.js';

describe('Money arithmetic & precision invariants', () => {
  it('prevents floating point arithmetic issues (0.1 + 0.2 === 0.3)', () => {
    const a = new Money('0.1000', 'USD');
    const b = new Money('0.2000', 'USD');
    const sum = a.add(b);
    expect(sum.toLedgerString()).toBe('0.3000');
  });

  it('formats to ledger format with 4 decimal places numeric(19,4)', () => {
    const m = new Money('1250.5', 'PHP');
    expect(m.toLedgerString()).toBe('1250.5000');
    expect(m.currency).toBe('PHP');
  });

  it('rejects cross-currency operations without explicit conversion', () => {
    const php = new Money('100.0000', 'PHP');
    const usd = new Money('100.0000', 'USD');
    expect(() => php.add(usd)).toThrow(/Currency mismatch/);
    expect(() => php.subtract(usd)).toThrow(/Currency mismatch/);
  });

  it('performs exact multiplication and division', () => {
    const price = new Money('250.0000', 'PHP');
    const qty = 3;
    const total = price.multiply(qty);
    expect(total.toLedgerString()).toBe('750.0000');

    const split = total.divide(2);
    expect(split.toLedgerString()).toBe('375.0000');
  });

  it('checks equality and zero states accurately', () => {
    const z1 = Money.zero('PHP');
    const z2 = new Money('0.0000', 'PHP');
    expect(z1.isZero()).toBe(true);
    expect(z1.equals(z2)).toBe(true);

    const pos = new Money('0.0001', 'PHP');
    expect(pos.isPositive()).toBe(true);
    expect(pos.isZero()).toBe(false);
  });
});
