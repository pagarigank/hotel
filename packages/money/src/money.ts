import { Decimal } from 'decimal.js';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 28,
});

export type MoneyInput = string | number | Decimal | Money;

export class Money {
  private readonly _amount: Decimal;
  public readonly currency: string;

  constructor(amount: MoneyInput, currency: string = 'PHP') {
    this.currency = currency.toUpperCase();
    if (amount instanceof Money) {
      this._amount = amount._amount;
      this.currency = amount.currency;
    } else if (amount instanceof Decimal) {
      this._amount = amount;
    } else if (typeof amount === 'number') {
      this._amount = new Decimal(amount.toString());
    } else if (typeof amount === 'string') {
      const clean = amount.trim().replace(/,/g, '');
      if (clean === '' || isNaN(Number(clean))) {
        throw new Error(`Invalid monetary amount string: "${amount}"`);
      }
      this._amount = new Decimal(clean);
    } else {
      throw new Error(`Invalid money input: ${amount}`);
    }
  }

  static zero(currency: string = 'PHP'): Money {
    return new Money('0.0000', currency);
  }

  static from(amount: MoneyInput, currency: string = 'PHP'): Money {
    return new Money(amount, currency);
  }

  get amount(): Decimal {
    return this._amount;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: cannot operate between ${this.currency} and ${other.currency}`);
    }
  }

  add(other: MoneyInput): Money {
    const o = new Money(other, this.currency);
    this.assertSameCurrency(o);
    return new Money(this._amount.plus(o._amount), this.currency);
  }

  subtract(other: MoneyInput): Money {
    const o = new Money(other, this.currency);
    this.assertSameCurrency(o);
    return new Money(this._amount.minus(o._amount), this.currency);
  }

  multiply(factor: number | string | Decimal): Money {
    const f = new Decimal(factor.toString());
    return new Money(this._amount.times(f), this.currency);
  }

  divide(divisor: number | string | Decimal): Money {
    const d = new Decimal(divisor.toString());
    if (d.isZero()) {
      throw new Error('Division by zero in Money calculation');
    }
    return new Money(this._amount.dividedBy(d), this.currency);
  }

  negate(): Money {
    return new Money(this._amount.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this._amount.abs(), this.currency);
  }

  equals(other: MoneyInput): boolean {
    const o = new Money(other, this.currency);
    return this.currency === o.currency && this._amount.equals(o._amount);
  }

  greaterThan(other: MoneyInput): boolean {
    const o = new Money(other, this.currency);
    this.assertSameCurrency(o);
    return this._amount.greaterThan(o._amount);
  }

  lessThan(other: MoneyInput): boolean {
    const o = new Money(other, this.currency);
    this.assertSameCurrency(o);
    return this._amount.lessThan(o._amount);
  }

  isZero(): boolean {
    return this._amount.isZero();
  }

  isPositive(): boolean {
    return this._amount.greaterThan(0);
  }

  isNegative(): boolean {
    return this._amount.lessThan(0);
  }

  /**
   * Database storage format: exact numeric(19,4) representation
   */
  toLedgerString(): string {
    return this._amount.toFixed(4);
  }

  /**
   * API wire format: decimal string
   */
  toWireString(): string {
    return this._amount.toFixed(4);
  }

  /**
   * Two decimal places for guest-facing receipts and displays
   */
  toDisplayString(): string {
    return this._amount.toFixed(2);
  }

  format(locale: string = 'en-US'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(this._amount.toNumber());
  }

  toJSON(): { amount: string; currency: string } {
    return {
      amount: this.toWireString(),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.currency} ${this.toLedgerString()}`;
  }
}
