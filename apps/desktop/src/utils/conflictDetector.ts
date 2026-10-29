import type { Endpoint } from '@api-lab/api-types';

export interface ConflictDiffRow {
  field: string;
  localVal: string;
  remoteVal: string;
}

/**
 * Computes side-by-side configuration differences between a local draft and remote server endpoint.
 * Independently testable pure function without React component lifecycle.
 */
export function computeConflictDiffs(
  localEndpoint: Endpoint,
  remoteEndpoint: Endpoint,
  localConfig: any
): ConflictDiffRow[] {
  const isHttp = localEndpoint.protocol === 'http';
  const remoteConfig = remoteEndpoint.config || {};
  const diffs: ConflictDiffRow[] = [];

  if (isHttp) {
    const localMethod = String(localConfig.method || 'GET').toUpperCase();
    const remoteMethod = String(remoteConfig.method || 'GET').toUpperCase();
    if (localMethod !== remoteMethod) {
      diffs.push({ field: 'Method', localVal: localMethod, remoteVal: remoteMethod });
    }

    const localUrl = String(localConfig.url || '');
    const remoteUrl = String(remoteConfig.url || '');
    if (localUrl !== remoteUrl) {
      diffs.push({ field: 'URL', localVal: localUrl, remoteVal: remoteUrl });
    }

    const localBody = String(localConfig.body || '').trim();
    const remoteBody = String(remoteConfig.body || '').trim();
    if (localBody !== remoteBody) {
      diffs.push({
        field: 'Body',
        localVal: localBody.length > 200 ? localBody.slice(0, 200) + '...' : localBody || '(empty)',
        remoteVal: remoteBody.length > 200 ? remoteBody.slice(0, 200) + '...' : remoteBody || '(empty)',
      });
    }

    const localPre = String(localConfig.pre_request_script || '').trim();
    const remotePre = String(remoteConfig.pre_request_script || '').trim();
    if (localPre !== remotePre) {
      diffs.push({
        field: 'Pre-request Script',
        localVal: localPre || '(empty)',
        remoteVal: remotePre || '(empty)',
      });
    }

    const localPost = String(localConfig.post_response_script || localConfig.post_request_script || '').trim();
    const remotePost = String(remoteConfig.post_response_script || remoteConfig.post_request_script || '').trim();
    if (localPost !== remotePost) {
      diffs.push({
        field: 'Post-response Script',
        localVal: localPost || '(empty)',
        remoteVal: remotePost || '(empty)',
      });
    }
  } else {
    const localAddr = String(localConfig.server_address || '');
    const remoteAddr = String(remoteConfig.server_address || '');
    if (localAddr !== remoteAddr) {
      diffs.push({ field: 'Server Address', localVal: localAddr, remoteVal: remoteAddr });
    }

    const localSvc = String(localConfig.service || '');
    const remoteSvc = String(remoteConfig.service || '');
    if (localSvc !== remoteSvc) {
      diffs.push({ field: 'Service', localVal: localSvc, remoteVal: remoteSvc });
    }

    const localMethod = String(localConfig.method || '');
    const remoteMethod = String(remoteConfig.method || '');
    if (localMethod !== remoteMethod) {
      diffs.push({ field: 'Method', localVal: localMethod, remoteVal: remoteMethod });
    }

    const localPayload = JSON.stringify(localConfig.payload || {});
    const remotePayload = JSON.stringify(remoteConfig.payload || {});
    if (localPayload !== remotePayload) {
      diffs.push({
        field: 'Payload',
        localVal: localPayload.length > 200 ? localPayload.slice(0, 200) + '...' : localPayload,
        remoteVal: remotePayload.length > 200 ? remotePayload.slice(0, 200) + '...' : remotePayload,
      });
    }
  }

  return diffs;
}

/**
 * Checks if a tab's endpoint version is behind the latest version cached from the server.
 */
export function isTabConflicted(
  tabEndpoint: Endpoint,
  serverEndpoints?: Endpoint[]
): boolean {
  if (!serverEndpoints || serverEndpoints.length === 0) return false;
  const server = serverEndpoints.find((item) => item.id === tabEndpoint.id);
  if (!server) return false;
  return server.version > tabEndpoint.version;
}
