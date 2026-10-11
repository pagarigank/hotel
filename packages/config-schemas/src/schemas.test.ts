import { describe, it, expect } from 'vitest';
import {
  StatusDefSchema,
  ActionDefSchema,
  CustomFieldDefSchema,
  SettingScopeTypeSchema,
} from './index.js';

describe('Config Schemas Validation', () => {
  it('validates a correct unit StatusDef', () => {
    const valid = {
      id: 'a0000000-0000-0000-0000-000000000001',
      tenantId: 'b0000000-0000-0000-0000-000000000001',
      entity: 'unit',
      code: 'vacant_clean',
      label: 'Vacant Clean',
      colorToken: 'status-vacant-clean',
      isSellable: true,
      isOccupied: false,
      isDirty: false,
      blocksBooking: false,
    };
    expect(() => StatusDefSchema.parse(valid)).not.toThrow();
  });

  it('validates a server-driven ActionDef', () => {
    const valid = {
      id: 'a0000000-0000-0000-0000-000000000001',
      tenantId: 'b0000000-0000-0000-0000-000000000001',
      entity: 'unit',
      code: 'check_in',
      label: 'Check-in Guest',
      permission: 'frontdesk.stay.checkin',
      visibleWhen: { statusIn: ['due_in', 'vacant_clean'] },
      target: { type: 'wizard', key: 'check-in' },
    };
    expect(() => ActionDefSchema.parse(valid)).not.toThrow();
  });

  it('validates custom field definition types', () => {
    const valid = {
      id: 'a0000000-0000-0000-0000-000000000001',
      tenantId: 'b0000000-0000-0000-0000-000000000001',
      entity: 'guest',
      key: 'passport_number',
      label: 'Passport Number',
      type: 'text',
      required: false,
    };
    expect(() => CustomFieldDefSchema.parse(valid)).not.toThrow();
  });

  it('validates setting scope hierarchy', () => {
    expect(() => SettingScopeTypeSchema.parse('tenant')).not.toThrow();
    expect(() => SettingScopeTypeSchema.parse('invalid_scope')).toThrow();
  });
});
