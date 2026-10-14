import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openEndpointInTabs,
  closeEndpointInTabs,
  updateEndpointInTabs,
  type TabState,
} from './tabManager.ts';
import type { Endpoint } from '@api-lab/api-types';

function createMockEndpoint(id: string, name: string): Endpoint {
  return {
    id,
    collection_id: 'c1',
    name,
    protocol: 'http',
    config: { method: 'GET', url: `https://api.example.com/${id}` },
    sort_order: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test('openEndpointInTabs: adds first endpoint to empty tabs and makes it active', () => {
  const initial: TabState = {
    openEndpoints: [],
    activeEndpointId: null,
    activeEndpoint: null,
  };

  const ep1 = createMockEndpoint('ep1', 'Get Users');
  const result = openEndpointInTabs(initial, ep1);

  assert.equal(result.openEndpoints.length, 1);
  assert.equal(result.openEndpoints[0].id, 'ep1');
  assert.equal(result.activeEndpointId, 'ep1');
  assert.equal(result.activeEndpoint?.id, 'ep1');
});

test('openEndpointInTabs: appends new endpoint and activates it', () => {
  const ep1 = createMockEndpoint('ep1', 'Get Users');
  const ep2 = createMockEndpoint('ep2', 'manager login');

  const initial: TabState = {
    openEndpoints: [ep1],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
  };

  const result = openEndpointInTabs(initial, ep2);

  assert.equal(result.openEndpoints.length, 2);
  assert.equal(result.openEndpoints[0].id, 'ep1');
  assert.equal(result.openEndpoints[1].id, 'ep2');
  assert.equal(result.activeEndpointId, 'ep2');
  assert.equal(result.activeEndpoint?.id, 'ep2');
});

test('openEndpointInTabs: selecting already opened endpoint switches active tab without duplicate', () => {
  const ep1 = createMockEndpoint('ep1', 'Get Users');
  const ep2 = createMockEndpoint('ep2', 'manager login');

  const initial: TabState = {
    openEndpoints: [ep1, ep2],
    activeEndpointId: 'ep2',
    activeEndpoint: ep2,
  };

  const result = openEndpointInTabs(initial, ep1);

  assert.equal(result.openEndpoints.length, 2);
  assert.equal(result.activeEndpointId, 'ep1');
  assert.equal(result.activeEndpoint?.id, 'ep1');
});

test('closeEndpointInTabs: closing inactive tab keeps current active tab intact', () => {
  const ep1 = createMockEndpoint('ep1', 'Get Users');
  const ep2 = createMockEndpoint('ep2', 'manager login');

  const initial: TabState = {
    openEndpoints: [ep1, ep2],
    activeEndpointId: 'ep2',
    activeEndpoint: ep2,
  };

  const result = closeEndpointInTabs(initial, 'ep1');

  assert.equal(result.openEndpoints.length, 1);
  assert.equal(result.openEndpoints[0].id, 'ep2');
  assert.equal(result.activeEndpointId, 'ep2');
  assert.equal(result.activeEndpoint?.id, 'ep2');
});

test('closeEndpointInTabs: closing active tab activates left adjacent tab', () => {
  const ep1 = createMockEndpoint('ep1', 'First');
  const ep2 = createMockEndpoint('ep2', 'Second');
  const ep3 = createMockEndpoint('ep3', 'Third');

  const initial: TabState = {
    openEndpoints: [ep1, ep2, ep3],
    activeEndpointId: 'ep2',
    activeEndpoint: ep2,
  };

  const result = closeEndpointInTabs(initial, 'ep2');

  assert.equal(result.openEndpoints.length, 2);
  assert.equal(result.openEndpoints[0].id, 'ep1');
  assert.equal(result.openEndpoints[1].id, 'ep3');
  // Left tab was ep1
  assert.equal(result.activeEndpointId, 'ep1');
  assert.equal(result.activeEndpoint?.id, 'ep1');
});

test('closeEndpointInTabs: closing first active tab activates next remaining tab', () => {
  const ep1 = createMockEndpoint('ep1', 'First');
  const ep2 = createMockEndpoint('ep2', 'Second');

  const initial: TabState = {
    openEndpoints: [ep1, ep2],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
  };

  const result = closeEndpointInTabs(initial, 'ep1');

  assert.equal(result.openEndpoints.length, 1);
  assert.equal(result.openEndpoints[0].id, 'ep2');
  assert.equal(result.activeEndpointId, 'ep2');
  assert.equal(result.activeEndpoint?.id, 'ep2');
});

test('closeEndpointInTabs: closing the last remaining tab clears active endpoint', () => {
  const ep1 = createMockEndpoint('ep1', 'Only Tab');

  const initial: TabState = {
    openEndpoints: [ep1],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
  };

  const result = closeEndpointInTabs(initial, 'ep1');

  assert.equal(result.openEndpoints.length, 0);
  assert.equal(result.activeEndpointId, null);
  assert.equal(result.activeEndpoint, null);
});

test('closeEndpointInTabs: closing non-existent tab returns unchanged state', () => {
  const ep1 = createMockEndpoint('ep1', 'Existing Tab');

  const initial: TabState = {
    openEndpoints: [ep1],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
  };

  const result = closeEndpointInTabs(initial, 'unknown_id');

  assert.equal(result.openEndpoints.length, 1);
  assert.equal(result.activeEndpointId, 'ep1');
});

test('updateEndpointInTabs: updates matching endpoint properties in open tabs list', () => {
  const ep1 = createMockEndpoint('ep1', 'Old Name');
  const initial: TabState = {
    openEndpoints: [ep1],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
  };

  const updated = { ...ep1, name: 'New Name', version: 2 };
  const result = updateEndpointInTabs(initial, updated);

  assert.equal(result.openEndpoints[0].name, 'New Name');
  assert.equal(result.openEndpoints[0].version, 2);
  assert.equal(result.activeEndpoint?.name, 'New Name');
});
