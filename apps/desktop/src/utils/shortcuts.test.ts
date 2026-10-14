import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAllShortcuts,
  matchesShortcut,
  searchEndpointsForCommandPalette,
  searchUnifiedCommandPalette,
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

  // close_tab: Ctrl+W or Cmd+W (without Shift or Alt)
  assert.equal(matchesShortcut({ key: 'w', ctrlKey: true }, 'close_tab'), true);
  assert.equal(matchesShortcut({ key: 'W', metaKey: true }, 'close_tab'), true);
  assert.equal(matchesShortcut({ key: 'w', ctrlKey: true, shiftKey: true }, 'close_tab'), false);

  // close_other_tabs: Ctrl+Alt+T or Cmd+Alt+T
  assert.equal(matchesShortcut({ key: 't', ctrlKey: true, altKey: true }, 'close_other_tabs'), true);
  assert.equal(matchesShortcut({ key: 'T', metaKey: true, altKey: true }, 'close_other_tabs'), true);
  assert.equal(matchesShortcut({ key: 't', ctrlKey: true }, 'close_other_tabs'), false);

  // close_all_tabs: Ctrl+Shift+W or Cmd+Shift+W
  assert.equal(matchesShortcut({ key: 'w', ctrlKey: true, shiftKey: true }, 'close_all_tabs'), true);
  assert.equal(matchesShortcut({ key: 'W', metaKey: true, shiftKey: true }, 'close_all_tabs'), true);
  assert.equal(matchesShortcut({ key: 'w', ctrlKey: true }, 'close_all_tabs'), false);

  // create_new: Ctrl+N or Cmd+N
  assert.equal(matchesShortcut({ key: 'n', ctrlKey: true }, 'create_new'), true);
  assert.equal(matchesShortcut({ key: 'N', metaKey: true }, 'create_new'), true);
  assert.equal(matchesShortcut({ key: 'n' }, 'create_new'), false);

  // import_workspace: Ctrl+O or Cmd+O
  assert.equal(matchesShortcut({ key: 'o', ctrlKey: true }, 'import_workspace'), true);
  assert.equal(matchesShortcut({ key: 'O', metaKey: true }, 'import_workspace'), true);
  assert.equal(matchesShortcut({ key: 'o' }, 'import_workspace'), false);

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

  // 6. Multi-keyword search across fields (e.g. collection + method: "billing invoice")
  const multiKeyword = searchEndpointsForCommandPalette(endpoints, collections, 'billing invoice');
  assert.equal(multiKeyword.length, 2);

  // 7. Multi-keyword in name (e.g. "create user" or "user create")
  const multiName = searchEndpointsForCommandPalette(endpoints, collections, 'user create');
  assert.equal(multiName.length, 1);
  assert.equal(multiName[0].endpoint.name, 'Create User');

  // 8. Multi-keyword across method + URL ("post users")
  const multiMethodUrl = searchEndpointsForCommandPalette(endpoints, collections, 'post users');
  assert.equal(multiMethodUrl.length, 1);
  assert.equal(multiMethodUrl[0].endpoint.id, 'e2');

  // 9. Extra whitespace between keywords
  const whitespaceMatch = searchEndpointsForCommandPalette(endpoints, collections, '   users   profile   ');
  assert.equal(whitespaceMatch.length, 1);
  assert.equal(whitespaceMatch[0].endpoint.id, 'e1');

  // 10. Multi-keyword with one non-matching term returns 0 (AND behavior like SQL)
  const partialMiss = searchEndpointsForCommandPalette(endpoints, collections, 'user nonexistingkeyword');
  assert.equal(partialMiss.length, 0);

  // 11. No matches
  const none = searchEndpointsForCommandPalette(endpoints, collections, 'NonExistentMethod');
  assert.equal(none.length, 0);
});

test('searchUnifiedCommandPalette: finds both commands and endpoints in Ctrl+K', () => {
  const collections: Collection[] = [
    { id: 'c1', workspace_id: 'w1', name: 'Auth API', sort_order: 0, created_at: '', updated_at: '' },
  ];
  const endpoints: Endpoint[] = [
    {
      id: 'e1',
      collection_id: 'c1',
      name: 'Manager Login',
      protocol: 'http',
      config: { method: 'POST', url: '/auth/manager/login' },
      sort_order: 0,
      version: 1,
      created_at: '',
      updated_at: '',
    },
  ];

  // 1. Search "close tab" finds Close Tab command
  const res1 = searchUnifiedCommandPalette(endpoints, collections, 'close tab');
  assert.ok(res1.length >= 1);
  assert.equal(res1[0].type, 'command');
  if (res1[0].type === 'command') {
    assert.equal(res1[0].actionId, 'close_tab');
  }

  // 2. Search "close other" finds Close All Other Tabs command
  const res2 = searchUnifiedCommandPalette(endpoints, collections, 'close other');
  assert.ok(res2.length >= 1);
  assert.equal(res2[0].type, 'command');
  if (res2[0].type === 'command') {
    assert.equal(res2[0].actionId, 'close_other_tabs');
  }

  // 3. Search "close all" finds Close All Tabs command
  const res3 = searchUnifiedCommandPalette(endpoints, collections, 'close all');
  assert.ok(res3.length >= 1);
  const foundCloseAll = res3.find(
    (item) => item.type === 'command' && item.actionId === 'close_all_tabs'
  );
  assert.ok(foundCloseAll);

  // 4. Search "manager login" finds endpoint
  const res4 = searchUnifiedCommandPalette(endpoints, collections, 'manager login');
  assert.equal(res4.length, 1);
  assert.equal(res4[0].type, 'endpoint');
  if (res4[0].type === 'endpoint') {
    assert.equal(res4[0].endpoint.name, 'Manager Login');
  }

  // 5. Empty search returns commands plus endpoints
  const all = searchUnifiedCommandPalette(endpoints, collections, '');
  assert.equal(all.length, 4); // 3 commands + 1 endpoint
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
