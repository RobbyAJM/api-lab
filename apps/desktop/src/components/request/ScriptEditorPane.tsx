import React, { useState } from 'react';
import type { HookTestResult } from '../../utils/hookRunner';
import { JavaScriptEditor } from '../common/JavaScriptEditor';
import { CheckCircle, XCircle, Terminal, Check } from 'lucide-react';

export interface ScriptSnippet {
  title: string;
  description: string;
  code: string;
}

export const HTTP_PRE_SNIPPETS: ScriptSnippet[] = [
  {
    title: 'Set environment variable',
    description: 'Save key-value pair to environment',
    code: `pm.environment.set("API_KEY", "your-key-here");\n`,
  },
  {
    title: 'Set request header',
    description: 'Add or modify request header',
    code: `pm.request.headers["X-Request-ID"] = Date.now().toString();\n`,
  },
  {
    title: 'Generate timestamp',
    description: 'Save current timestamp to variable',
    code: `pm.environment.set("TIMESTAMP", Date.now());\n`,
  },
  {
    title: 'Log message',
    description: 'Print message to script console',
    code: `console.log("Sending request to:", pm.request.url);\n`,
  },
];

export const HTTP_POST_SNIPPETS: ScriptSnippet[] = [
  {
    title: 'Status code: 200 OK',
    description: 'Assert status code is 200',
    code: `pm.test("Status code is 200", () => {\n  pm.expect(pm.response.code).to.equal(200);\n});\n`,
  },
  {
    title: 'Save token from JSON',
    description: 'Extract token property to environment',
    code: `const data = pm.response.json();\nif (data && data.token) {\n  pm.environment.set("AUTH_TOKEN", data.token);\n}\n`,
  },
  {
    title: 'Response time < 500ms',
    description: 'Assert latency threshold',
    code: `pm.test("Response time is under 500ms", () => {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});\n`,
  },
  {
    title: 'Check JSON field',
    description: 'Verify field value in JSON body',
    code: `const data = pm.response.json();\npm.test("Success is true", () => {\n  pm.expect(data.success).to.equal(true);\n});\n`,
  },
];

export const GRPC_PRE_SNIPPETS: ScriptSnippet[] = [
  {
    title: 'Set metadata',
    description: 'Attach authorization metadata',
    code: `pm.request.metadata["authorization"] = "Bearer " + (pm.variables.get("TOKEN") || "");\n`,
  },
  {
    title: 'Set payload field',
    description: 'Inject variable into request payload',
    code: `pm.request.payload["client_id"] = "client_" + Date.now();\n`,
  },
  {
    title: 'Set environment variable',
    description: 'Save key-value pair to environment',
    code: `pm.environment.set("REQ_ID", "req_" + Date.now());\n`,
  },
  {
    title: 'Log method call',
    description: 'Print call to script console',
    code: `console.log("Invoking:", pm.request.service + "/" + pm.request.method);\n`,
  },
];

export const GRPC_POST_SNIPPETS: ScriptSnippet[] = [
  {
    title: 'Status code is 0 (OK)',
    description: 'Verify gRPC status code is 0',
    code: `pm.test("Status code is 0 (OK)", () => {\n  pm.expect(pm.response.code).to.equal(0);\n});\n`,
  },
  {
    title: 'Save token from response',
    description: 'Extract token from response details',
    code: `const body = pm.response.json();\nif (body?.details?.token) {\n  pm.environment.set("GRPC_TOKEN", body.details.token);\n}\n`,
  },
  {
    title: 'Check response object',
    description: 'Verify response body exists',
    code: `const body = pm.response.json();\npm.test("Response is valid object", () => {\n  pm.expect(body).to.be.an("object");\n});\n`,
  },
  {
    title: 'Response time < 500ms',
    description: 'Assert latency threshold',
    code: `pm.test("Latency is under 500ms", () => {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});\n`,
  },
];

interface ScriptEditorPaneProps {
  protocol: 'http' | 'grpc';
  activeSubTab: 'pre' | 'post';
  onSubTabChange: (tab: 'pre' | 'post') => void;
  preScript: string;
  onPreScriptChange: (val: string) => void;
  postScript: string;
  onPostScriptChange: (val: string) => void;
  tests: HookTestResult[];
  logs: string[];
}

export const ScriptEditorPane: React.FC<ScriptEditorPaneProps> = ({
  protocol,
  activeSubTab,
  onSubTabChange,
  preScript,
  onPreScriptChange,
  postScript,
  onPostScriptChange,
  tests,
  logs,
}) => {
  const [copiedSnippetIdx, setCopiedSnippetIdx] = useState<number | null>(null);

  const snippets =
    protocol === 'http'
      ? activeSubTab === 'pre'
        ? HTTP_PRE_SNIPPETS
        : HTTP_POST_SNIPPETS
      : activeSubTab === 'pre'
      ? GRPC_PRE_SNIPPETS
      : GRPC_POST_SNIPPETS;

  const currentScript = activeSubTab === 'pre' ? preScript : postScript;
  const setScript = activeSubTab === 'pre' ? onPreScriptChange : onPostScriptChange;

  function handleInsertSnippet(snippet: ScriptSnippet, idx: number) {
    const existing = currentScript.trim();
    const updated = existing ? `${existing}\n\n${snippet.code}` : snippet.code;
    setScript(updated);
    setCopiedSnippetIdx(idx);
    setTimeout(() => setCopiedSnippetIdx(null), 1500);
  }

  return (
    <div className="h-full flex flex-col space-y-2.5">
      {/* Top Simple Sub-tab Switcher */}
      <div className="flex items-center gap-1 border-b border-zinc-800/80 pb-2 select-none flex-shrink-0">
        <button
          type="button"
          onClick={() => onSubTabChange('pre')}
          className={`px-3 py-1 rounded text-xs font-medium transition ${
            activeSubTab === 'pre'
              ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          Pre-request
        </button>
        <button
          type="button"
          onClick={() => onSubTabChange('post')}
          className={`px-3 py-1 rounded text-xs font-medium transition ${
            activeSubTab === 'post'
              ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          Post-response
        </button>
      </div>

      {/* Main Split: Left Editor, Right Snippets */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        {/* Left: Code Editor + Test Results / Logs */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 min-h-[160px] overflow-hidden">
            <JavaScriptEditor
              key={activeSubTab}
              value={currentScript}
              onChange={setScript}
              placeholder={
                activeSubTab === 'pre'
                  ? '// Add JavaScript to run before request execution'
                  : '// Add tests or response handlers (pm.test, pm.response)'
              }
            />
          </div>

          {/* Test Results & Logs Output */}
          {(tests.length > 0 || logs.length > 0) && (
            <div className="mt-2 p-2.5 bg-zinc-900/80 border border-zinc-800 rounded space-y-2 max-h-36 overflow-y-auto font-mono text-xs flex-shrink-0">
              {tests.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-zinc-300 block mb-1">
                    Test Results:
                  </span>
                  <div className="space-y-1">
                    {tests.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        {t.passed ? (
                          <CheckCircle size={13} className="text-emerald-400" />
                        ) : (
                          <XCircle size={13} className="text-rose-400" />
                        )}
                        <span className={t.passed ? 'text-zinc-200' : 'text-rose-300'}>
                          {t.name}
                        </span>
                        {t.error && (
                          <span className="text-[10px] text-rose-400 ml-1">
                            ({t.error})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {logs.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1 mb-1">
                    <Terminal size={11} /> Logs:
                  </span>
                  <div className="bg-zinc-950 p-2 rounded text-[11px] text-zinc-300 space-y-0.5">
                    {logs.map((log, idx) => (
                      <div key={idx} className="break-all">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Snippets Pane */}
        <aside className="w-56 md:w-64 border-l border-zinc-800/80 pl-3 flex flex-col flex-shrink-0 select-none overflow-y-auto">
          <div className="pb-2 border-b border-zinc-800/80 mb-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Snippets
            </h4>
            <p className="text-[10px] text-zinc-500">Click to append to script</p>
          </div>

          <div className="space-y-1 overflow-y-auto pr-1">
            {snippets.map((snip, idx) => (
              <button
                key={snip.title}
                type="button"
                onClick={() => handleInsertSnippet(snip, idx)}
                className="w-full text-left p-2 rounded-md hover:bg-zinc-900 border border-transparent hover:border-zinc-800/80 transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300 group-hover:text-white truncate">
                    {snip.title}
                  </span>
                  {copiedSnippetIdx === idx && (
                    <Check size={11} className="text-emerald-400 flex-shrink-0 ml-1" />
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                  {snip.description}
                </p>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
