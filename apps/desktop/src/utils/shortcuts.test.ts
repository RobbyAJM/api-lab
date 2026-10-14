import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAllShortcuts,
  matchesShortcut,
  searchEndpointsForCommandPalette,
  navigateListIndex,
} from './shortcuts.ts';
import type { Endpoint, Collection } from '@api-lab/api-types';

test('getAllShortcuts: returns registered shortcuts list', () => {
  const shortcuts = getAllShortcuts();
  assert.ok(shortcuts.length >= 5);
  const send = shortcuts.find((s) => s.id === 'send_request');
  assert.ok(send);
  assert.equal(send.keyLabel, 'Ctrl + Enter');
  const save = shortcuts.find((s) => s.id === 'save_endpoint');
  assert.ok(save);
  assert.equal(save.keyLabel, 'Ctrl + S');
  const cmd = shortcuts.find((s) => s.id === 'open_command');
  assert.ok(cmd);
  assert.equal(cmd.keyLabel, 'Ctrl + K');
  const help = shortcuts.find((s) => s.id === 'open_shortcuts');
  assert.ok(help);
  assert.equal(help.keyLabel, 'Ctrl + /');
});

test('matchesShortcut: verifies key combinations across Ctrl and Cmd', () => {
  // send_request: Ctrl+Enter or Cmd+Enter
  assert.equal(matchesShortcut({ key: 'Enter', ctrlKey: true }, 'send_request'), true);
  assert.equal(matchesShortcut({ key: 'Enter', metaKey: true }, 'send_request'), true);
  assert.equal(matchesShortcut({ key: 'Enter' }, 'send_request'), false);
  assert.equal(matchesShortcut({ key: 'a', ctrlKey: true }, 'send_request'), false);

  // save_endpoint: Ctrl+S or Cmd+S
  assert.equal(matchesShortcut({ key: 's', ctrlKey: true }, 'save_endpoint'), true);
  assert.equal(matchesShortcut({ key: 'S', metaKey: true }, 'save_endpoint'), true);
  assert.equal(matchesShortcut({ key: 's' }, 'save_endpoint'), false);

  // open_command: Ctrl+K or Cmd+K
  assert.equal(matchesShortcut({ key: 'k', ctrlKey: true }, 'open_command'), true);
  assert.equal(matchesShortcut({ key: 'K', metaKey: true }, 'open_command'), true);
  assert.equal(matchesShortcut({ key: 'k' }, 'open_command'), false);

  // open_shortcuts: Ctrl+/ or Cmd+/ or Ctrl+?
  assert.equal(matchesShortcut({ key: '/', ctrlKey: true }, 'open_shortcuts'), true);
  assert.equal(matchesShortcut({ key: '?', metaKey: true }, 'open_shortcuts'), true);
  assert.equal(matchesShortcut({ key: '/' }, 'open_shortcuts'), false);

  // open_environment: Ctrl+E or Cmd+E
  assert.equal(matchesShortcut({ key: 'e', ctrlKey: true }, 'open_environment'), true);
  assert.equal(matchesShortcut({ key: 'E', metaKey: true }, 'open_environment'), true);

  // escape
  assert.equal(matchesShortcut({ key: 'Escape' }, 'escape'), true);
  assert.equal(matchesShortcut({ key: 'Enter' }, 'escape'), false);
});

test('searchEndpointsForCommandPalette: searches across names, methods, services, collections', () => {
  const collections: Collection[] = [
    { id: 'c1', workspace_id: 'w1', name: 'Users API', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'c2', workspace_id: 'w1', name: 'Billing gRPC', sort_order: 1, created_at: '', updated_at: '' },
  ];

  const endpoints: Endpoint[] = [
    {
      id: 'e1',
      collection_id: 'c1',
      name: 'Get User Profile',
      protocol: 'http',
      config: { method: 'GET', url: 'https://api.example.com/users/123' },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'e2',
      collection_id: 'c1',
      name: 'Create User',
      protocol: 'http',
      config: { method: 'POST', url: 'https://api.example.com/users' },
      sort_order: 1,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'e3',
      collection_id: 'c2',
      name: 'ProcessInvoice',
      protocol: 'grpc',
      config: {
        server_address: 'localhost:50051',
        service: 'billing.InvoiceService',
        method: 'ProcessInvoice',
        stream_type: 'unary',
      },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'e4',
      collection_id: 'c2',
      name: 'LiveTransactions',
      protocol: 'grpc',
      config: {
        server_address: 'localhost:50051',
        service: 'billing.InvoiceService',
        method: 'LiveTransactions',
        stream_type: 'bidi_stream',
      },
      sort_order: 1,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  // 1. Empty query returns all 4
  const all = searchEndpointsForCommandPalette(endpoints, collections, '');
  assert.equal(all.length, 4);
  assert.equal(all[0].collectionName, 'Users API');
  assert.equal(all[0].methodLabel, 'GET');
  assert.equal(all[2].collectionName, 'Billing gRPC');
  assert.equal(all[3].methodLabel, 'STREAM');

  // 2. Search by endpoint name substring
  const byName = searchEndpointsForCommandPalette(endpoints, collections, 'Profile');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].endpoint.id, 'e1');

  // 3. Search by HTTP method
  const byMethod = searchEndpointsForCommandPalette(endpoints, collections, 'POST');
  assert.equal(byMethod.length, 1);
  assert.equal(byMethod[0].endpoint.name, 'Create User');

  // 4. Search by gRPC service
  const byService = searchEndpointsForCommandPalette(endpoints, collections, 'InvoiceService');
  assert.equal(byService.length, 2);

  // 5. Search by collection name
  const byColl = searchEndpointsForCommandPalette(endpoints, collections, 'Billing');
  assert.equal(byColl.length, 2);

  // 6. No matches
  const none = searchEndpointsForCommandPalette(endpoints, collections, 'NonExistentMethod');
  assert.equal(none.length, 0);
});

test('navigateListIndex: wraps correctly for up and down arrow keys', () => {
  // Down
  assert.equal(navigateListIndex(0, 3, 'down'), 1);
  assert.equal(navigateListIndex(1, 3, 'down'), 2);
  assert.equal(navigateListIndex(2, 3, 'down'), 0); // wrap to top

  // Up
  assert.equal(navigateListIndex(2, 3, 'up'), 1);
  assert.equal(navigateListIndex(1, 3, 'up'), 0);
  assert.equal(navigateListIndex(0, 3, 'up'), 2); // wrap to bottom

  // Empty
  assert.equal(navigateListIndex(0, 0, 'down'), 0);
});
