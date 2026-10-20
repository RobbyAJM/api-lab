import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVariableMeta,
  maskSensitiveValue,
  calculateHoverCardPosition,
  findHoveredVariableToken,
} from './variableHover.ts';
import type { VariableResponse } from '@api-lab/api-types';

test('resolveVariableMeta: handles VariableResponse array', () => {
  const vars: VariableResponse[] = [
    {
      id: 'var-1',
      environment_id: 'env-prod',
      key: 'API_KEY',
      value: 'secret-token-12345',
      is_sensitive: true,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'var-2',
      environment_id: 'env-prod',
      key: 'HOST',
      value: 'https://api.example.com',
      is_sensitive: false,
      created_at: '',
      updated_at: '',
    },
  ];

  const env = { id: 'env-prod', name: 'Production' };

  // Sensitive variable
  const meta1 = resolveVariableMeta('API_KEY', vars, env);
  assert.equal(meta1.exists, true);
  assert.equal(meta1.value, 'secret-token-12345');
  assert.equal(meta1.isSensitive, true);
  assert.equal(meta1.id, 'var-1');
  assert.equal(meta1.environmentId, 'env-prod');
  assert.equal(meta1.environmentName, 'Production');

  // Non-sensitive variable
  const meta2 = resolveVariableMeta('HOST', vars, env);
  assert.equal(meta2.exists, true);
  assert.equal(meta2.value, 'https://api.example.com');
  assert.equal(meta2.isSensitive, false);

  // Undefined variable
  const meta3 = resolveVariableMeta('MISSING_VAR', vars, env);
  assert.equal(meta3.exists, false);
  assert.equal(meta3.value, '');
  assert.equal(meta3.id, undefined);
  assert.equal(meta3.environmentName, 'Production');
});

test('resolveVariableMeta: handles plain Record<string, string>', () => {
  const record = {
    PORT: '8080',
    SERVICE: 'auth',
  };

  const meta = resolveVariableMeta('PORT', record, { id: 'env-dev', name: 'Dev' });
  assert.equal(meta.exists, true);
  assert.equal(meta.value, '8080');
  assert.equal(meta.isSensitive, false);
  assert.equal(meta.environmentName, 'Dev');

  const metaUndefined = resolveVariableMeta('NOT_FOUND', record);
  assert.equal(metaUndefined.exists, false);
});

test('maskSensitiveValue: correctly masks sensitive strings', () => {
  assert.equal(maskSensitiveValue(''), '');
  assert.equal(maskSensitiveValue('abc'), '••••••'); // at least 6 dots
  assert.equal(maskSensitiveValue('super-secret-password-12345'), '••••••••••'); // capped at 10 dots
});

test('calculateHoverCardPosition: calculates placement and prevents viewport overflow', () => {
  const cardSize = { width: 280, height: 160 };
  const viewportSize = { width: 1200, height: 800 };

  // 1. Normal middle position: renders below token
  const tokenRect1 = { left: 300, top: 200, right: 380, bottom: 220 };
  const pos1 = calculateHoverCardPosition(tokenRect1, cardSize, viewportSize);
  assert.equal(pos1.placement, 'bottom');
  assert.equal(pos1.x, 300);
  assert.equal(pos1.y, 226); // bottom (220) + 6

  // 2. Near bottom: flips to above token
  const tokenRect2 = { left: 300, top: 720, right: 380, bottom: 740 };
  const pos2 = calculateHoverCardPosition(tokenRect2, cardSize, viewportSize);
  assert.equal(pos2.placement, 'top');
  assert.equal(pos2.y, 720 - 160 - 6); // top - cardHeight - 6 = 554

  // 3. Near right edge: clamps x inside viewport
  const tokenRect3 = { left: 1100, top: 200, right: 1180, bottom: 220 };
  const pos3 = calculateHoverCardPosition(tokenRect3, cardSize, viewportSize, 10);
  assert.equal(pos3.x, 1200 - 280 - 10); // 910
});

test('findHoveredVariableToken: hits target token or returns null', () => {
  const mockTokens = [
    {
      getAttribute: (attr: string) => (attr === 'data-var-name' ? 'API_URL' : null),
      getBoundingClientRect: () => ({
        left: 50,
        top: 100,
        right: 120,
        bottom: 125,
        width: 70,
        height: 25,
      }),
    },
    {
      getAttribute: (attr: string) => (attr === 'data-var-name' ? 'AUTH_TOKEN' : null),
      getBoundingClientRect: () => ({
        left: 150,
        top: 100,
        right: 250,
        bottom: 125,
        width: 100,
        height: 25,
      }),
    },
  ];

  const mockContainer = {
    querySelectorAll: (selector: string) => {
      if (selector === '[data-var-name]') return mockTokens;
      return [];
    },
  };

  // Direct hit on API_URL
  const hit1 = findHoveredVariableToken(mockContainer, 75, 110);
  assert.notEqual(hit1, null);
  assert.equal(hit1?.name, 'API_URL');
  assert.equal(hit1?.rect.left, 50);

  // Direct hit on AUTH_TOKEN
  const hit2 = findHoveredVariableToken(mockContainer, 200, 115);
  assert.notEqual(hit2, null);
  assert.equal(hit2?.name, 'AUTH_TOKEN');

  // Miss: between tokens
  const miss = findHoveredVariableToken(mockContainer, 135, 110);
  assert.equal(miss, null);

  // Miss: out of vertical bounds
  const missY = findHoveredVariableToken(mockContainer, 75, 200);
  assert.equal(missY, null);

  // Null container
  assert.equal(findHoveredVariableToken(null, 100, 100), null);
});
