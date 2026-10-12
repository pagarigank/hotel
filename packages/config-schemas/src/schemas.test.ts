import { describe, it, expect } from 'vitest';
import {
  StatusDefSchema,
  ActionDefSchema,
  CustomFieldDefSchema,
  SettingScopeTypeSchema,
  SETTINGS_REGISTRY,
  SETTINGS_REGISTRY_BY_KEY,
  buildCustomFieldValueSchema,
  buildCustomFieldsSchema,
  validateCustomFieldValues,
  type CustomFieldDef,
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

function def(partial: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    tenantId: 'b0000000-0000-0000-0000-000000000001',
    entity: 'guest',
    key: 'field',
    label: 'Field',
    type: 'text',
    required: false,
    options: [],
    validation: {},
    showInList: false,
    print: false,
    sort: 0,
    ...partial,
  };
}

describe('Custom-field def-driven validation', () => {
  it('enforces required fields', () => {
    const schema = buildCustomFieldsSchema([def({ key: 'passport', required: true })]);
    expect(schema.safeParse({ passport: 'X123' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('treats non-required fields as optional', () => {
    const schema = buildCustomFieldsSchema([def({ key: 'notes', required: false })]);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('restricts select values to declared options', () => {
    const schema = buildCustomFieldValueSchema(
      def({ key: 'tier', type: 'select', options: ['gold', 'silver'] }),
    );
    expect(schema.safeParse('gold').success).toBe(true);
    expect(schema.safeParse('bronze').success).toBe(false);
  });

  it('applies numeric range validation rules', () => {
    const schema = buildCustomFieldValueSchema(
      def({ key: 'age', type: 'number', validation: { min: 0, max: 120 } }),
    );
    expect(schema.safeParse(30).success).toBe(true);
    expect(schema.safeParse(200).success).toBe(false);
  });

  it('rejects invalid dates', () => {
    const schema = buildCustomFieldValueSchema(def({ key: 'dob', type: 'date' }));
    expect(schema.safeParse('2024-01-15').success).toBe(true);
    expect(schema.safeParse('not-a-date').success).toBe(false);
  });

  it('passes through unknown attrs keys', () => {
    const result = validateCustomFieldValues([def({ key: 'passport' })], {
      passport: 'X123',
      extra: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extra).toBe(1);
    }
  });

  it('returns issues for invalid values', () => {
    const result = validateCustomFieldValues([def({ key: 'passport', required: true })], {});
    expect(result.success).toBe(false);
  });
});

describe('Settings registry', () => {
  it('exposes known setting keys with schemas', () => {
    expect(SETTINGS_REGISTRY.length).toBeGreaterThan(0);
    expect(SETTINGS_REGISTRY_BY_KEY.has('frontdesk.checkin.requireCleanRoom')).toBe(true);
    expect(SETTINGS_REGISTRY_BY_KEY.has('hotel.overbooking.allowancePct')).toBe(true);
  });

  it('validates a registered key against its value schema', () => {
    const entry = SETTINGS_REGISTRY_BY_KEY.get('frontdesk.checkin.requireCleanRoom');
    expect(entry).toBeDefined();
    expect(entry!.valueSchema.safeParse('inspected').success).toBe(true);
    expect(entry!.valueSchema.safeParse('bogus').success).toBe(false);
  });

  it('declares allowed scopes for each entry', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.scopes.length).toBeGreaterThan(0);
    }
  });
});
