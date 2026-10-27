import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCollectionName,
  buildCreateCollectionPayload,
} from './collectionCreation.ts';

test('validateCollectionName: rejects empty and whitespace-only names', () => {
  assert.deepEqual(validateCollectionName(''), {
    valid: false,
    name: '',
    error: 'Collection name cannot be empty',
  });
  assert.deepEqual(validateCollectionName('   '), {
    valid: false,
    name: '',
    error: 'Collection name cannot be empty',
  });
});

test('validateCollectionName: trims leading and trailing whitespace', () => {
  const result = validateCollectionName('  Payment Service  ');
  assert.equal(result.valid, true);
  assert.equal(result.name, 'Payment Service');
  assert.equal(result.error, undefined);
});

test('validateCollectionName: rejects names exceeding 100 characters', () => {
  const longName = 'a'.repeat(101);
  const result = validateCollectionName(longName);
  assert.equal(result.valid, false);
  assert.equal(result.error, 'Collection name must be 100 characters or less');
});

test('buildCreateCollectionPayload: returns trimmed name and default empty settings', () => {
  const payload = buildCreateCollectionPayload('  Billing API  ');
  assert.deepEqual(payload, {
    name: 'Billing API',
    settings: {},
  });
});

test('buildCreateCollectionPayload: preserves custom settings when provided', () => {
  const customSettings = { headers: [{ key: 'X-App', value: 'Test', enabled: true }] };
  const payload = buildCreateCollectionPayload('Billing API', customSettings);
  assert.deepEqual(payload, {
    name: 'Billing API',
    settings: customSettings,
  });
});
