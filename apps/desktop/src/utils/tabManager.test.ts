import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openEndpointInTabs,
  closeEndpointInTabs,
  closeOtherEndpointsInTabs,
  closeAllEndpointsInTabs,
  updateEndpointInTabs,
  setEndpointDraftInState,
  clearEndpointDraftInState,
  isEndpointDirtyInState,
  isConfigDirty,
  getEffectiveEndpointConfig,
  getAdjacentEndpoint,
  setEndpointResponseInState,
  getEndpointResponseFromState,
  switchWorkspaceTabs,
  removeWorkspaceTabs,
  ACTIVE_WORKSPACE_STORAGE_KEY,
  WORKSPACE_TABS_STORAGE_PREFIX,
  getWorkspaceTabsStorageKey,
  getStoredActiveWorkspaceId,
  setStoredActiveWorkspaceId,
  removeStoredActiveWorkspaceId,
  getStoredWorkspaceTabs,
  setStoredWorkspaceTabs,
  removeStoredWorkspaceTabs,
  WORKBENCH_TAB_BAR_HEIGHT_CLASS,
  WORKBENCH_HEADER_BORDER_CLASS,
  type TabState,
  type WorkspaceTabMap,
} from './tabManager.ts';
import type { Endpoint } from '@api-lab/api-types';

function createMockEndpoint(id: string, name: string): Endpoint {
  return {
    id,
    collection_id: 'c1',
    name,
    protocol: 'http',
    config: { method: 'GET', url: `https://api.example.com/${id}`, body: '', headers: {} },
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

test('closeOtherEndpointsInTabs: leaves only targeted tab and cleans up other drafts', () => {
  const ep1 = createMockEndpoint('ep1', 'First');
  const ep2 = createMockEndpoint('ep2', 'Target');
  const ep3 = createMockEndpoint('ep3', 'Third');

  const initial: TabState = {
    openEndpoints: [ep1, ep2, ep3],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
    endpointDrafts: {
      ep1: { url: 'changed1' },
      ep2: { url: 'changed2' },
      ep3: { url: 'changed3' },
    },
  };

  const result = closeOtherEndpointsInTabs(initial, 'ep2');

  assert.equal(result.openEndpoints.length, 1);
  assert.equal(result.openEndpoints[0].id, 'ep2');
  assert.equal(result.activeEndpointId, 'ep2');
  assert.equal(result.activeEndpoint?.id, 'ep2');
  // Keeps ep2 draft, deletes others
  assert.ok(result.endpointDrafts?.ep2);
  assert.equal(result.endpointDrafts?.ep1, undefined);
  assert.equal(result.endpointDrafts?.ep3, undefined);
});

test('closeAllEndpointsInTabs: empties all tabs, resets active and clears drafts', () => {
  const ep1 = createMockEndpoint('ep1', 'First');
  const ep2 = createMockEndpoint('ep2', 'Second');

  const initial: TabState = {
    openEndpoints: [ep1, ep2],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
    endpointDrafts: {
      ep1: { body: 'draft' },
    },
  };

  const result = closeAllEndpointsInTabs();

  assert.equal(result.openEndpoints.length, 0);
  assert.equal(result.activeEndpointId, null);
  assert.equal(result.activeEndpoint, null);
  assert.deepEqual(result.endpointDrafts, {});
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

test('isConfigDirty: accurately detects HTTP and gRPC unsaved changes', () => {
  const baseHttp = {
    method: 'GET',
    url: 'https://httpbin.org/get',
    body: '{"foo":1}',
    headers: { 'X-Auth': 'token123' },
  };

  // 1. Exact match returns false
  assert.equal(isConfigDirty(baseHttp, { ...baseHttp }), false);

  // 2. Undefined draft returns false
  assert.equal(isConfigDirty(baseHttp, undefined), false);

  // 3. Changed URL returns true
  assert.equal(isConfigDirty(baseHttp, { ...baseHttp, url: 'https://httpbin.org/post' }), true);

  // 4. Changed Method returns true
  assert.equal(isConfigDirty(baseHttp, { ...baseHttp, method: 'POST' }), true);

  // 5. Changed Headers returns true
  assert.equal(isConfigDirty(baseHttp, { ...baseHttp, headers: { 'X-Auth': 'modified' } }), true);

  // 6. Changed Body returns true
  assert.equal(isConfigDirty(baseHttp, { ...baseHttp, body: '{"foo":2}' }), true);

  // 7. Changed Script returns true
  assert.equal(
    isConfigDirty(baseHttp, { ...baseHttp, pre_request_script: 'console.log(1);' }),
    true
  );

  // 8. gRPC payload change
  const baseGrpc = {
    server_address: 'localhost:50051',
    service: 'user.Service',
    method: 'GetUser',
    payload: { id: 1 },
  };
  assert.equal(isConfigDirty(baseGrpc, { ...baseGrpc, payload: { id: 2 } }), true);
});

test('isConfigDirty: prevents false positives on newly opened HTTP endpoints', () => {
  // Scenario A: Saved endpoint has path variables in URL but empty path_variables array in DB
  const baseWithParam = {
    method: 'GET',
    url: 'https://api.example.com/users/:id',
  };
  const draftInitialParam = {
    method: 'GET',
    url: 'https://api.example.com/users/:id',
    query_params: [],
    path_variables: [['id', '', '']], // extracted placeholder
    headers: {},
    body: '',
  };
  assert.equal(isConfigDirty(baseWithParam, draftInitialParam), false);

  // Scenario B: Swagger-imported template {id} converted to :id by editor
  const baseSwagger = {
    method: 'POST',
    url: 'https://api.example.com/items/{item_id}',
  };
  const draftSwagger = {
    method: 'POST',
    url: 'https://api.example.com/items/:item_id',
    query_params: [],
    path_variables: [['item_id', '', '']],
    headers: {},
    body: '',
  };
  assert.equal(isConfigDirty(baseSwagger, draftSwagger), false);

  // Scenario C: URL contains query string split into query_params by editor on mount
  const baseUrlQuery = {
    method: 'DELETE',
    url: 'https://api.example.com/orders?status=active&limit=10',
  };
  const draftUrlQuery = {
    method: 'DELETE',
    url: 'https://api.example.com/orders',
    query_params: [
      ['status', 'active', ''],
      ['limit', '10', ''],
    ],
    path_variables: [],
    headers: {},
    body: '',
  };
  assert.equal(isConfigDirty(baseUrlQuery, draftUrlQuery), false);

  // Scenario D: 2-tuple vs 3-tuple query params in DB
  const base2Tuple = {
    method: 'PUT',
    url: 'https://api.example.com/update',
    query_params: [['page', '1']],
  };
  const draft3Tuple = {
    method: 'PUT',
    url: 'https://api.example.com/update',
    query_params: [['page', '1', '']],
    path_variables: [],
    headers: {},
  };
  assert.equal(isConfigDirty(base2Tuple, draft3Tuple), false);

  // BUT real changes must still be detected:
  // User fills in the path variable value
  const draftParamEdited = {
    ...draftInitialParam,
    path_variables: [['id', '12345', '']],
  };
  assert.equal(isConfigDirty(baseWithParam, draftParamEdited), true);

  // User changes query param
  const draftQueryEdited = {
    ...draftUrlQuery,
    query_params: [['status', 'archived', '']],
  };
  assert.equal(isConfigDirty(baseUrlQuery, draftQueryEdited), true);

  // User toggles query param (disables it)
  const draftQueryDisabled = {
    ...draftUrlQuery,
    query_params: [
      ['status', 'active', '', false],
      ['limit', '10', '', true],
    ],
  };
  assert.equal(isConfigDirty(baseUrlQuery, draftQueryDisabled), true);

  // Duplicate keys preserved in dirty check
  const baseDuplicates = {
    method: 'GET',
    url: 'https://api.example.com/items',
    query_params: [
      ['filter', 'a', '', true],
      ['filter', 'b', '', true],
    ],
  };
  const draftDuplicates = {
    method: 'GET',
    url: 'https://api.example.com/items?filter=a&filter=b',
    query_params: [
      ['filter', 'a', '', true],
      ['filter', 'b', '', true],
    ],
  };
  assert.equal(isConfigDirty(baseDuplicates, draftDuplicates), false);
});

test('isConfigDirty: prevents false positives on newly opened gRPC endpoints (Unary & Stream)', () => {
  // Scenario A: gRPC Unary with omitted auth and empty payload in DB
  const baseGrpcUnary = {
    server_address: 'localhost:50051',
    service: 'order.OrderService',
    method: 'GetOrder',
    stream_type: 'unary',
  };
  // Initial editor state mounts with inherit auth, empty payload object, default options
  const draftGrpcUnary = {
    server_address: 'localhost:50051',
    service: 'order.OrderService',
    method: 'GetOrder',
    stream_type: 'unary',
    use_tls: false,
    authority_override: '',
    timeout_seconds: 30,
    max_msg_size_mb: 4,
    metadata: {},
    metadata_descriptions: {},
    auth: { auth_type: 'inherit' },
    payload: {},
    pre_request_script: '',
    post_request_script: '',
    post_response_script: '',
  };
  assert.equal(isConfigDirty(baseGrpcUnary, draftGrpcUnary), false);

  // Scenario B: gRPC Server/Client/Bidi Stream with whitespace or null payload in DB
  const baseGrpcStream = {
    server_address: 'stream.example.com:443',
    service: 'telemetry.StreamService',
    method: 'SubscribeMetrics',
    stream_type: 'bidi_stream',
    payload: null,
  };
  const draftGrpcStream = {
    server_address: 'stream.example.com:443',
    service: 'telemetry.StreamService',
    method: 'SubscribeMetrics',
    stream_type: 'bidi_stream',
    use_tls: true, // Auto-detected for remote domain
    auth: { auth_type: 'inherit' },
    payload: {},
    metadata: {},
  };
  assert.equal(isConfigDirty(baseGrpcStream, draftGrpcStream), false);

  // Scenario C: Derived authorization in metadata does not falsely dirty when auth token exists
  const baseGrpcAuth = {
    server_address: 'localhost:50051',
    service: 'auth.Service',
    method: 'Check',
    auth: { auth_type: 'bearer', token: 'secret-token' },
    metadata: {},
  };
  const draftGrpcAuth = {
    server_address: 'localhost:50051',
    service: 'auth.Service',
    method: 'Check',
    auth: { auth_type: 'bearer', token: 'secret-token' },
    metadata: { authorization: 'Bearer secret-token' },
  };
  assert.equal(isConfigDirty(baseGrpcAuth, draftGrpcAuth), false);

  // BUT real changes must still be detected:
  // User changes payload
  assert.equal(
    isConfigDirty(baseGrpcUnary, {
      ...draftGrpcUnary,
      payload: { order_id: 'ord-100' },
    }),
    true
  );

  // User changes server address
  assert.equal(
    isConfigDirty(baseGrpcUnary, {
      ...draftGrpcUnary,
      server_address: 'localhost:9090',
    }),
    true
  );

  // User changes stream type
  assert.equal(
    isConfigDirty(baseGrpcUnary, {
      ...draftGrpcUnary,
      stream_type: 'omni_stream',
    }),
    true
  );
});

test('draft management in TabState preserves unsaved changes across switches', () => {
  const ep1 = createMockEndpoint('ep1', 'User Endpoint');
  const state0: TabState = {
    openEndpoints: [ep1],
    activeEndpointId: 'ep1',
    activeEndpoint: ep1,
    endpointDrafts: {},
  };

  // Initially clean
  assert.equal(isEndpointDirtyInState(state0, 'ep1'), false);

  // User edits URL in draft
  const state1 = setEndpointDraftInState(state0, 'ep1', {
    ...ep1.config,
    url: 'https://api.example.com/modified',
  });
  assert.equal(isEndpointDirtyInState(state1, 'ep1'), true);

  // User saves, clearing draft
  const state2 = clearEndpointDraftInState(state1, 'ep1');
  assert.equal(isEndpointDirtyInState(state2, 'ep1'), false);
});

test('getEffectiveEndpointConfig: returns draft if present and non-empty, otherwise saved config', () => {
  const ep = createMockEndpoint('ep1', 'My Endpoint');
  ep.config = { method: 'GET', url: 'https://saved.com', body: 'saved_body' };

  // 1. No draft -> returns saved config
  assert.deepEqual(getEffectiveEndpointConfig(ep, null), ep.config);
  assert.deepEqual(getEffectiveEndpointConfig(ep, undefined), ep.config);
  assert.deepEqual(getEffectiveEndpointConfig(ep, {}), ep.config);

  // 2. Draft present -> returns draft
  const unsavedDraft = { method: 'POST', url: 'https://unsaved.com', body: 'unsaved_body' };
  assert.deepEqual(getEffectiveEndpointConfig(ep, unsavedDraft), unsavedDraft);
});

test('openEndpointInTabs and closeEndpointInTabs preserve drafts for other tabs', () => {
  const ep1 = createMockEndpoint('ep1', 'Tab 1');
  const ep2 = createMockEndpoint('ep2', 'Tab 2');

  let state: TabState = {
    openEndpoints: [],
    activeEndpointId: null,
    activeEndpoint: null,
    endpointDrafts: {},
  };

  // Open Tab 1 and add unsaved draft
  state = openEndpointInTabs(state, ep1);
  state = setEndpointDraftInState(state, 'ep1', {
    ...ep1.config,
    url: 'https://tab1-unsaved.com',
  });
  assert.equal(isEndpointDirtyInState(state, 'ep1'), true);

  // Open Tab 2
  state = openEndpointInTabs(state, ep2);
  assert.equal(state.activeEndpointId, 'ep2');
  // Tab 1 draft must still exist in state!
  assert.equal(isEndpointDirtyInState(state, 'ep1'), true);
  assert.equal(getEffectiveEndpointConfig(ep1, state.endpointDrafts?.['ep1']).url, 'https://tab1-unsaved.com');

  // Close Tab 2 -> Tab 1 draft must NOT be wiped out
  state = closeEndpointInTabs(state, 'ep2');
  assert.equal(state.activeEndpointId, 'ep1');
  assert.equal(isEndpointDirtyInState(state, 'ep1'), true);
  assert.equal(getEffectiveEndpointConfig(ep1, state.endpointDrafts?.['ep1']).url, 'https://tab1-unsaved.com');
});

test('getAdjacentEndpoint: navigates left and right between tabs', () => {
  const ep1 = createMockEndpoint('ep1', 'Tab 1');
  const ep2 = createMockEndpoint('ep2', 'Tab 2');
  const ep3 = createMockEndpoint('ep3', 'Tab 3');
  const list = [ep1, ep2, ep3];

  // From middle: left goes to ep1, right goes to ep2
  assert.equal(getAdjacentEndpoint(list, 'ep2', 'prev')?.id, 'ep1');
  assert.equal(getAdjacentEndpoint(list, 'ep2', 'next')?.id, 'ep3');

  // At left boundary: prev returns null (cannot go further left)
  assert.equal(getAdjacentEndpoint(list, 'ep1', 'prev'), null);
  assert.equal(getAdjacentEndpoint(list, 'ep1', 'next')?.id, 'ep2');

  // At right boundary: next returns null (cannot go further right)
  assert.equal(getAdjacentEndpoint(list, 'ep3', 'prev')?.id, 'ep2');
  assert.equal(getAdjacentEndpoint(list, 'ep3', 'next'), null);

  // Empty list returns null
  assert.equal(getAdjacentEndpoint([], 'ep1', 'prev'), null);
});

test('endpointResponses: preserves responses per tab across switches and cleans on close', () => {
  const ep1 = createMockEndpoint('ep1', 'Tab 1');
  const ep2 = createMockEndpoint('ep2', 'Tab 2');

  let state: TabState = {
    openEndpoints: [],
    activeEndpointId: null,
    activeEndpoint: null,
    endpointDrafts: {},
    endpointResponses: {},
  };

  // Open Tab 1 and record response
  state = openEndpointInTabs(state, ep1);
  state = setEndpointResponseInState(state, 'ep1', {
    http: { status_code: 200, body: '{"ok":true}', headers: {}, response_time_ms: 10, response_size_bytes: 12 },
  });
  assert.equal(getEndpointResponseFromState(state, 'ep1')?.http?.status_code, 200);

  // Open Tab 2 and record response
  state = openEndpointInTabs(state, ep2);
  state = setEndpointResponseInState(state, 'ep2', {
    grpc: { status_code: 0, status_message: 'OK', body: {}, metadata: {}, response_time_ms: 5, response_size_bytes: 8 },
  });

  // Switch back to Tab 1
  state = openEndpointInTabs(state, ep1);
  assert.equal(getEndpointResponseFromState(state, 'ep1')?.http?.status_code, 200);
  assert.equal(getEndpointResponseFromState(state, 'ep2')?.grpc?.status_code, 0);

  // Close Tab 2 cleans Tab 2 response
  state = closeEndpointInTabs(state, 'ep2');
  assert.equal(getEndpointResponseFromState(state, 'ep1')?.http?.status_code, 200);
  assert.equal(getEndpointResponseFromState(state, 'ep2'), null);

  // Close all cleans everything
  state = closeAllEndpointsInTabs();
  assert.deepEqual(state.endpointResponses, {});
});

test('unsaved changes: execute retains dirty state; only explicit save clears draft', () => {
  const ep = createMockEndpoint('ep1', 'Test Endpoint');
  let state: TabState = {
    openEndpoints: [],
    activeEndpointId: null,
    activeEndpoint: null,
    endpointDrafts: {},
    endpointResponses: {},
  };

  state = openEndpointInTabs(state, ep);
  assert.equal(isEndpointDirtyInState(state, 'ep1'), false);

  // User modifies endpoint in editor (creates draft)
  const modifiedConfig = { ...ep.config, url: 'https://api.example.com/ep1-edited' };
  state = setEndpointDraftInState(state, 'ep1', modifiedConfig);
  assert.equal(isEndpointDirtyInState(state, 'ep1'), true);

  // Sending/invoking records response, but draft is NOT cleared
  state = setEndpointResponseInState(state, 'ep1', {
    http: { status_code: 200, body: '{"success":true}', headers: {}, response_time_ms: 15, response_size_bytes: 20 },
  });
  // Must still be dirty after response!
  assert.equal(isEndpointDirtyInState(state, 'ep1'), true);
  assert.equal(getEffectiveEndpointConfig(ep, state.endpointDrafts?.['ep1']).url, 'https://api.example.com/ep1-edited');

  // Only explicit save persists config and clears draft
  const savedEp: Endpoint = { ...ep, config: modifiedConfig, version: ep.version + 1 };
  state = updateEndpointInTabs(state, savedEp);
  state = clearEndpointDraftInState(state, 'ep1');

  assert.equal(isEndpointDirtyInState(state, 'ep1'), false);
  assert.equal(getEffectiveEndpointConfig(savedEp, state.endpointDrafts?.['ep1']).url, 'https://api.example.com/ep1-edited');
});

test('switchWorkspaceTabs: preserves open tabs and unsaved drafts across workspace switches', () => {
  const epA1 = createMockEndpoint('epA1', 'Endpoint A1');
  const epA2 = createMockEndpoint('epA2', 'Endpoint A2');
  const epB1 = createMockEndpoint('epB1', 'Endpoint B1');

  let workspaceTabs: WorkspaceTabMap = {};

  // 1. Workspace A: user opens 2 endpoints and creates unsaved draft in epA1
  let wsAState: TabState = {
    openEndpoints: [],
    activeEndpointId: null,
    activeEndpoint: null,
    endpointDrafts: {},
    endpointResponses: {},
  };
  wsAState = openEndpointInTabs(wsAState, epA1);
  wsAState = openEndpointInTabs(wsAState, epA2);
  const dirtyConfigA1 = { ...epA1.config, url: 'https://api.example.com/draft-work' };
  wsAState = setEndpointDraftInState(wsAState, 'epA1', dirtyConfigA1);
  wsAState = setEndpointResponseInState(wsAState, 'epA1', {
    http: { status_code: 200, body: '{"workspace":"A"}', headers: {}, response_time_ms: 10, response_size_bytes: 15 },
  });

  assert.equal(wsAState.openEndpoints.length, 2);
  assert.equal(wsAState.activeEndpointId, 'epA2');
  assert.equal(isEndpointDirtyInState(wsAState, 'epA1'), true);

  // 2. Switch from Workspace A to Workspace B (newly visited workspace)
  const toB = switchWorkspaceTabs(workspaceTabs, 'ws-A', wsAState, 'ws-B');
  workspaceTabs = toB.workspaceTabs;
  let wsBState = toB.activeTabState;

  // Workspace B should start clean and empty
  assert.equal(wsBState.openEndpoints.length, 0);
  assert.equal(wsBState.activeEndpointId, null);
  assert.deepEqual(wsBState.endpointDrafts, {});

  // 3. User works in Workspace B: opens epB1, sets draft
  wsBState = openEndpointInTabs(wsBState, epB1);
  const dirtyConfigB1 = { ...epB1.config, body: '{"query":"from B"}' };
  wsBState = setEndpointDraftInState(wsBState, 'epB1', dirtyConfigB1);

  assert.equal(wsBState.openEndpoints.length, 1);
  assert.equal(wsBState.activeEndpointId, 'epB1');
  assert.equal(isEndpointDirtyInState(wsBState, 'epB1'), true);

  // 4. Switch back to Workspace A: left work and unsaved changes must exist
  const backToA = switchWorkspaceTabs(workspaceTabs, 'ws-B', wsBState, 'ws-A');
  workspaceTabs = backToA.workspaceTabs;
  const restoredA = backToA.activeTabState;

  assert.equal(restoredA.openEndpoints.length, 2);
  assert.equal(restoredA.openEndpoints[0].id, 'epA1');
  assert.equal(restoredA.openEndpoints[1].id, 'epA2');
  assert.equal(restoredA.activeEndpointId, 'epA2');
  assert.equal(restoredA.activeEndpoint?.id, 'epA2');
  // Verify epA1 unsaved draft is still intact
  assert.equal(isEndpointDirtyInState(restoredA, 'epA1'), true);
  assert.equal(restoredA.endpointDrafts?.['epA1']?.url, 'https://api.example.com/draft-work');
  assert.equal(restoredA.endpointResponses?.['epA1']?.http?.status_code, 200);

  // 5. Switch back to Workspace B: verify B's left work also still exists
  const backToB = switchWorkspaceTabs(workspaceTabs, 'ws-A', restoredA, 'ws-B');
  workspaceTabs = backToB.workspaceTabs;
  const restoredB = backToB.activeTabState;

  assert.equal(restoredB.openEndpoints.length, 1);
  assert.equal(restoredB.openEndpoints[0].id, 'epB1');
  assert.equal(restoredB.activeEndpointId, 'epB1');
  assert.equal(isEndpointDirtyInState(restoredB, 'epB1'), true);
  assert.equal(restoredB.endpointDrafts?.['epB1']?.body, '{"query":"from B"}');
});

test('switchWorkspaceTabs: same workspace switch is a no-op identity check', () => {
  const ep = createMockEndpoint('ep1', 'Ep1');
  const currentTabState: TabState = {
    openEndpoints: [ep],
    activeEndpointId: 'ep1',
    activeEndpoint: ep,
    endpointDrafts: {},
    endpointResponses: {},
  };
  const initialMap: WorkspaceTabMap = { 'ws-1': currentTabState };
  const res = switchWorkspaceTabs(initialMap, 'ws-1', currentTabState, 'ws-1');

  assert.equal(res.workspaceTabs, initialMap);
  assert.equal(res.activeTabState, currentTabState);
});

test('removeWorkspaceTabs: prunes deleted workspace without affecting others', () => {
  const epA = createMockEndpoint('epA', 'EpA');
  const epB = createMockEndpoint('epB', 'EpB');
  const tabMap: WorkspaceTabMap = {
    'ws-1': { openEndpoints: [epA], activeEndpointId: 'epA', activeEndpoint: epA },
    'ws-2': { openEndpoints: [epB], activeEndpointId: 'epB', activeEndpoint: epB },
  };

  const updated = removeWorkspaceTabs(tabMap, 'ws-1');
  assert.equal(updated['ws-1'], undefined);
  assert.equal(updated['ws-2'].openEndpoints.length, 1);
  assert.equal(updated['ws-2'].openEndpoints[0].id, 'epB');

  // Deleting non-existent workspace returns same object
  const unchanged = removeWorkspaceTabs(updated, 'non-existent');
  assert.equal(unchanged, updated);
});

test('workbench layout tokens enforce h-9 and border-zinc-800/80 symmetry', () => {
  assert.equal(WORKBENCH_TAB_BAR_HEIGHT_CLASS, 'h-9');
  assert.equal(WORKBENCH_HEADER_BORDER_CLASS, 'border-zinc-800/80');
});

test('workspace tab storage: key formatting', () => {
  assert.equal(ACTIVE_WORKSPACE_STORAGE_KEY, 'api_lab_active_workspace_id');
  assert.equal(WORKSPACE_TABS_STORAGE_PREFIX, 'api_lab_workspace_tabs_');
  assert.equal(getWorkspaceTabsStorageKey('ws-123'), 'api_lab_workspace_tabs_ws-123');
});

test('active workspace persistence: stores, retrieves, and removes active workspace ID', () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  assert.equal(getStoredActiveWorkspaceId(mockStorage), null);

  setStoredActiveWorkspaceId('ws-alpha', mockStorage);
  assert.equal(getStoredActiveWorkspaceId(mockStorage), 'ws-alpha');
  assert.equal(store[ACTIVE_WORKSPACE_STORAGE_KEY], 'ws-alpha');

  setStoredActiveWorkspaceId('ws-beta', mockStorage);
  assert.equal(getStoredActiveWorkspaceId(mockStorage), 'ws-beta');

  setStoredActiveWorkspaceId(null, mockStorage);
  assert.equal(getStoredActiveWorkspaceId(mockStorage), null);
  assert.equal(store[ACTIVE_WORKSPACE_STORAGE_KEY], undefined);

  setStoredActiveWorkspaceId('ws-gamma', mockStorage);
  removeStoredActiveWorkspaceId(mockStorage);
  assert.equal(getStoredActiveWorkspaceId(mockStorage), null);
});

test('workspace tab persistence: preserves open tabs, active request, and unsaved drafts across restarts', () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  const ep1 = createMockEndpoint('ep1', 'Get Orders');
  const ep2 = createMockEndpoint('ep2', 'Create Order');

  const tabState: TabState = {
    openEndpoints: [ep1, ep2],
    activeEndpointId: 'ep2',
    activeEndpoint: ep2,
    endpointDrafts: {
      ep2: { method: 'POST', url: 'https://api.example.com/orders', body: '{"item":1}' },
    },
    endpointResponses: {
      ep2: { http: { status_code: 201, body: '{"id":"ord-1"}' } },
    },
  };

  // 1. Initial read on empty storage returns null
  assert.equal(getStoredWorkspaceTabs('ws-1', mockStorage), null);

  // 2. Persist tabs for ws-1
  setStoredWorkspaceTabs('ws-1', tabState, mockStorage);

  // 3. Hydrate back
  const restored = getStoredWorkspaceTabs('ws-1', mockStorage);
  assert.ok(restored);
  assert.equal(restored.openEndpoints.length, 2);
  assert.equal(restored.openEndpoints[0].id, 'ep1');
  assert.equal(restored.openEndpoints[1].id, 'ep2');
  assert.equal(restored.activeEndpointId, 'ep2');
  assert.equal(restored.activeEndpoint?.id, 'ep2');
  assert.equal(restored.endpointDrafts?.['ep2']?.body, '{"item":1}');
  // Responses must be empty in storage to prevent quota exhaustion
  assert.deepEqual(restored.endpointResponses, {});

  // 4. Isolation between workspaces
  assert.equal(getStoredWorkspaceTabs('ws-2', mockStorage), null);

  const epB = createMockEndpoint('epB', 'Search Users');
  setStoredWorkspaceTabs('ws-2', {
    openEndpoints: [epB],
    activeEndpointId: 'epB',
    activeEndpoint: epB,
    endpointDrafts: {},
    endpointResponses: {},
  }, mockStorage);

  assert.equal(getStoredWorkspaceTabs('ws-2', mockStorage)?.openEndpoints.length, 1);
  assert.equal(getStoredWorkspaceTabs('ws-1', mockStorage)?.openEndpoints.length, 2);

  // 5. Remove workspace tabs
  removeStoredWorkspaceTabs('ws-1', mockStorage);
  assert.equal(getStoredWorkspaceTabs('ws-1', mockStorage), null);
  assert.equal(getStoredWorkspaceTabs('ws-2', mockStorage)?.openEndpoints.length, 1);
});

test('workspace tab persistence: safely handles corrupt or invalid json payload', () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  // Invalid JSON
  store[getWorkspaceTabsStorageKey('ws-bad-1')] = '{ broken-json';
  assert.equal(getStoredWorkspaceTabs('ws-bad-1', mockStorage), null);

  // Non-array openEndpoints
  store[getWorkspaceTabsStorageKey('ws-bad-2')] = JSON.stringify({ openEndpoints: 'not-array' });
  assert.equal(getStoredWorkspaceTabs('ws-bad-2', mockStorage), null);

  // Empty workspaceId
  assert.equal(getStoredWorkspaceTabs('', mockStorage), null);
});

test('switchWorkspaceTabs and removeWorkspaceTabs integrate with storage', () => {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  const epA = createMockEndpoint('epA', 'Ep A');
  const epB = createMockEndpoint('epB', 'Ep B');

  // Pre-seed storage for ws-2 (as if saved from previous session)
  setStoredWorkspaceTabs('ws-2', {
    openEndpoints: [epB],
    activeEndpointId: 'epB',
    activeEndpoint: epB,
    endpointDrafts: {},
    endpointResponses: {},
  }, mockStorage);

  const currentTabState: TabState = {
    openEndpoints: [epA],
    activeEndpointId: 'epA',
    activeEndpoint: epA,
    endpointDrafts: {},
    endpointResponses: {},
  };

  // Switch from ws-1 to ws-2 (ws-2 is not in memory, but in storage)
  const result = switchWorkspaceTabs({}, 'ws-1', currentTabState, 'ws-2', mockStorage);

  // ws-1 must be saved to storage
  const storedWs1 = getStoredWorkspaceTabs('ws-1', mockStorage);
  assert.equal(storedWs1?.openEndpoints[0].id, 'epA');

  // ws-2 must be restored from storage
  assert.equal(result.activeTabState.openEndpoints[0].id, 'epB');
  assert.equal(result.activeTabState.activeEndpointId, 'epB');

  // removeWorkspaceTabs cleans both memory and storage
  const cleaned = removeWorkspaceTabs(result.workspaceTabs, 'ws-2', mockStorage);
  assert.equal(cleaned['ws-2'], undefined);
  assert.equal(getStoredWorkspaceTabs('ws-2', mockStorage), null);
});

