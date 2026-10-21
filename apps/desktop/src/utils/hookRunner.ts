export interface HookTestResult {
  name: string;
  passed: boolean;
  status?: 'pass' | 'fail' | 'warn';
  warning?: string;
  error?: string;
}

export interface HttpRequestContext {
  url: string;
  method: string;
  headers: Record<string, string>;
  query_params?: [string, string][];
  body?: string;
  body_type?: string;
  auth?: any;
}

export interface HttpResponseContext {
  status_code: number;
  status_text?: string;
  headers: Record<string, string>;
  body: string;
  response_time_ms?: number;
  response_size_bytes?: number;
}

export interface GrpcRequestContext {
  server_address: string;
  service: string;
  method: string;
  metadata: Record<string, string>;
  payload: any;
  use_tls?: boolean;
}

export interface GrpcResponseContext {
  status_code: number;
  status_message?: string;
  metadata: Record<string, string>;
  body: any;
  response_time_ms?: number;
  response_size_bytes?: number;
}

export type HookRequestContext = HttpRequestContext | GrpcRequestContext;
export type HookResponseContext = HttpResponseContext | GrpcResponseContext;

export interface HookExecutionResult<TReq> {
  request: TReq;
  variables: Record<string, string>;
  tests: HookTestResult[];
  logs: string[];
  error?: string;
}

function isGrpcResponse(res: any): res is GrpcResponseContext {
  return 'status_message' in res || ('metadata' in res && !('headers' in res));
}

/**
 * Runs a Before (Pre-request) hook script written in JavaScript.
 * Allows modifying request parameters and reading/writing environment variables.
 */
export async function runBeforeHook<TReq extends HookRequestContext>(
  script: string,
  request: TReq,
  variables: Record<string, string>
): Promise<HookExecutionResult<TReq>> {
  if (!script || !script.trim()) {
    return {
      request,
      variables: { ...variables },
      tests: [],
      logs: [],
    };
  }

  // Deep clone request and variables so mutations are controlled
  const reqClone = JSON.parse(JSON.stringify(request)) as TReq;
  const varMap = { ...variables };
  const tests: HookTestResult[] = [];
  const logs: string[] = [];
  const pendingPromises: Promise<void>[] = [];

  const pm = buildPmContext(reqClone, undefined, varMap, tests, pendingPromises);

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction(
      'pm',
      'request',
      'variables',
      'console',
      script
    );

    const safeConsole = {
      log: (...args: any[]) => logs.push(args.map(formatLogArg).join(' ')),
      warn: (...args: any[]) => logs.push('[WARN] ' + args.map(formatLogArg).join(' ')),
      error: (...args: any[]) => logs.push('[ERROR] ' + args.map(formatLogArg).join(' ')),
    };

    await runner(pm, reqClone, varMap, safeConsole);
    if (pendingPromises.length > 0) {
      await Promise.all(pendingPromises);
    }

    return {
      request: reqClone,
      variables: varMap,
      tests,
      logs,
    };
  } catch (err: any) {
    return {
      request: reqClone,
      variables: varMap,
      tests,
      logs,
      error: `Pre-request Script Error: ${err.message}`,
    };
  }
}

/**
 * Runs an After (Post-response / Test) hook script written in JavaScript.
 * Allows assertions, inspecting response data, and updating environment variables.
 */
export async function runAfterHook<
  TReq extends HookRequestContext,
  TRes extends HookResponseContext,
>(
  script: string,
  request: TReq,
  response: TRes,
  variables: Record<string, string>
): Promise<HookExecutionResult<TReq>> {
  if (!script || !script.trim()) {
    return {
      request,
      variables: { ...variables },
      tests: [],
      logs: [],
    };
  }

  const reqClone = JSON.parse(JSON.stringify(request)) as TReq;
  const varMap = { ...variables };
  const tests: HookTestResult[] = [];
  const logs: string[] = [];
  const pendingPromises: Promise<void>[] = [];

  const pm = buildPmContext(reqClone, response, varMap, tests, pendingPromises);

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction(
      'pm',
      'request',
      'response',
      'variables',
      'console',
      script
    );

    const safeConsole = {
      log: (...args: any[]) => logs.push(args.map(formatLogArg).join(' ')),
      warn: (...args: any[]) => logs.push('[WARN] ' + args.map(formatLogArg).join(' ')),
      error: (...args: any[]) => logs.push('[ERROR] ' + args.map(formatLogArg).join(' ')),
    };

    await runner(pm, reqClone, response, varMap, safeConsole);
    if (pendingPromises.length > 0) {
      await Promise.all(pendingPromises);
    }

    return {
      request: reqClone,
      variables: varMap,
      tests,
      logs,
    };
  } catch (err: any) {
    return {
      request: reqClone,
      variables: varMap,
      tests,
      logs,
      error: `Post-response Script Error: ${err.message}`,
    };
  }
}

function formatLogArg(arg: any): string {
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function buildPmContext(
  req: HookRequestContext,
  res: HookResponseContext | undefined,
  varMap: Record<string, string>,
  tests: HookTestResult[],
  pendingPromises?: Promise<void>[]
) {
  let currentAssertionCount = 0;

  const pmVariables = {
    get: (key: string) => varMap[key],
    set: (key: string, val: any) => {
      varMap[key] = String(val);
    },
    has: (key: string) => Object.prototype.hasOwnProperty.call(varMap, key),
    toObject: () => ({ ...varMap }),
  };

  const pmRequest: any = req;
  if ('headers' in req) {
    if (!req.headers) (req as any).headers = {};
    (req.headers as any).get = (k: string) => req.headers[k];
    (req.headers as any).set = (k: string, v: string) => {
      req.headers[k] = v;
    };
    (req.headers as any).add = (k: string, v: string) => {
      req.headers[k] = v;
    };
  }
  if ('metadata' in req) {
    if (!req.metadata) (req as any).metadata = {};
    (req.metadata as any).get = (k: string) => req.metadata[k];
    (req.metadata as any).set = (k: string, v: string) => {
      req.metadata[k] = v;
    };
  }

  let pmResponse: any = undefined;
  if (res) {
    const isGrpc = isGrpcResponse(res);
    pmResponse = {
      code: res.status_code,
      status: isGrpc
        ? (res as GrpcResponseContext).status_message || ''
        : (res as HttpResponseContext).status_text || '',
      responseTime: res.response_time_ms || 0,
      headers: isGrpc
        ? (res as GrpcResponseContext).metadata || {}
        : (res as HttpResponseContext).headers || {},
      text: () => {
        if (typeof res.body === 'string') return res.body;
        return JSON.stringify(res.body);
      },
      json: () => {
        if (typeof res.body === 'object' && res.body !== null) {
          return res.body;
        }
        if (typeof res.body === 'string') {
          return JSON.parse(res.body || '{}');
        }
        return res.body;
      },
    };
  }

  const pm = {
    variables: pmVariables,
    environment: pmVariables,
    request: pmRequest,
    response: pmResponse,
    test: (name: string, fn: () => void | Promise<void>) => {
      currentAssertionCount = 0;
      try {
        const ret = fn();
        if (ret && typeof (ret as any).then === 'function') {
          const promise = (ret as Promise<void>)
            .then(() => {
              if (currentAssertionCount === 0) {
                tests.push({
                  name,
                  passed: false,
                  status: 'warn',
                  warning: 'zero assertions',
                });
              } else {
                tests.push({ name, passed: true, status: 'pass' });
              }
            })
            .catch((err) => {
              tests.push({
                name,
                passed: false,
                status: 'fail',
                error: err.message,
              });
            });
          if (pendingPromises) {
            pendingPromises.push(promise);
          }
        } else {
          if (currentAssertionCount === 0) {
            tests.push({
              name,
              passed: false,
              status: 'warn',
              warning: 'zero assertions',
            });
          } else {
            tests.push({ name, passed: true, status: 'pass' });
          }
        }
      } catch (err: any) {
        tests.push({
          name,
          passed: false,
          status: 'fail',
          error: err.message,
        });
      }
    },
    expect: (val: any) => {
      currentAssertionCount++;
      return {
        to: {
          equal: (expected: any) => {
            if (val !== expected) throw new Error(`Expected ${expected} but got ${val}`);
          },
          be: {
            equal: (expected: any) => {
              if (val !== expected) throw new Error(`Expected ${expected} but got ${val}`);
            },
            true: () => {
              if (val !== true) throw new Error(`Expected true but got ${val}`);
            },
            false: () => {
              if (val !== false) throw new Error(`Expected false but got ${val}`);
            },
            below: (expected: number) => {
              if (typeof val !== 'number' || val >= expected) {
                throw new Error(`Expected ${val} to be below ${expected}`);
              }
            },
            above: (expected: number) => {
              if (typeof val !== 'number' || val <= expected) {
                throw new Error(`Expected ${val} to be above ${expected}`);
              }
            },
            an: (expectedType: string) => {
              const actualType = Array.isArray(val) ? 'array' : typeof val;
              if (actualType !== expectedType) {
                throw new Error(`Expected type ${expectedType} but got ${actualType}`);
              }
            },
            a: (expectedType: string) => {
              const actualType = Array.isArray(val) ? 'array' : typeof val;
              if (actualType !== expectedType) {
                throw new Error(`Expected type ${expectedType} but got ${actualType}`);
              }
            },
          },
          include: (needle: any) => {
            if (typeof val === 'string' && !val.includes(needle)) {
              throw new Error(`Expected string to include ${needle}`);
            }
            if (Array.isArray(val) && !val.includes(needle)) {
              throw new Error(`Expected array to include ${needle}`);
            }
          },
        },
      };
    },
  };

  return pm;
}
