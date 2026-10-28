import React, { useState, useEffect } from 'react';
import { ArrowUpDown, BookOpen } from 'lucide-react';

export interface SpecificationField {
  name: string;
  type?: string;
  field_type?: string;
  required?: boolean;
  description?: string;
}

export interface SpecificationSection {
  typeName: string;
  fields: SpecificationField[];
}

interface StackLevel {
  typeName: string;
  fields: SpecificationField[];
}

export interface EndpointSpecificationViewProps {
  serviceName?: string;
  methodName: string;
  badge: {
    label: string;
    variant?: 'unary' | 'stream' | 'http';
    colorClass?: string;
  };
  request?: SpecificationSection | null;
  response?: SpecificationSection | null;
  schemas?: Record<string, SpecificationField[]>;
  emptyMessage?: string;
}

function getBaseTypeName(type: string): string {
  return type.replace(/\[\]$/, '').trim();
}

function resolveSchemaFields(
  baseType: string,
  schemas?: Record<string, SpecificationField[]>
): SpecificationField[] | null {
  if (!schemas || !baseType) return null;
  if (schemas[baseType]) return schemas[baseType];
  const short = baseType.split('.').pop() || baseType;
  if (schemas[short]) return schemas[short];
  return null;
}

export const EndpointSpecificationView: React.FC<EndpointSpecificationViewProps> = ({
  serviceName,
  methodName,
  badge,
  request,
  response,
  schemas,
  emptyMessage = 'Select an endpoint or method to view specification.',
}) => {
  const [reqStack, setReqStack] = useState<StackLevel[]>([]);
  const [resStack, setResStack] = useState<StackLevel[]>([]);

  useEffect(() => {
    if (request) {
      setReqStack([{ typeName: request.typeName, fields: request.fields }]);
    } else {
      setReqStack([]);
    }
  }, [request?.typeName, request?.fields]);

  useEffect(() => {
    if (response) {
      setResStack([{ typeName: response.typeName, fields: response.fields }]);
    } else {
      setResStack([]);
    }
  }, [response?.typeName, response?.fields]);

  if (!methodName && !request && !response) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500 select-none">
        <BookOpen size={24} className="text-zinc-600 mb-2" />
        <span className="text-xs font-semibold text-zinc-300">No Specification Available</span>
        <span className="text-[11px] text-zinc-500 mt-1">{emptyMessage}</span>
      </div>
    );
  }

  const renderBadge = () => {
    if (badge.colorClass) {
      return (
        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${badge.colorClass}`}>
          {badge.label}
        </span>
      );
    }

    if (badge.variant === 'unary') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-emerald-500/70 text-emerald-400 bg-emerald-500/10">
          {badge.label}
        </span>
      );
    }

    if (badge.variant === 'stream') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-amber-500/70 text-amber-400 bg-amber-500/10">
          {badge.label}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-medium border border-zinc-700 text-zinc-300 bg-zinc-850">
        {badge.label}
      </span>
    );
  };

  const renderTable = (
    currentLevel: StackLevel | null | undefined,
    onDrillDown: (level: StackLevel) => void
  ) => {
    if (!currentLevel || !currentLevel.fields || currentLevel.fields.length === 0) {
      return (
        <div className="py-3 text-[11px] text-zinc-500 italic font-mono">
          No schema fields defined.
        </div>
      );
    }

    return (
      <div className="w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs select-none">
              <th className="py-2.5 pr-4 font-medium w-1/2">Field</th>
              <th className="py-2.5 pl-4 font-medium w-1/2">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850 font-mono text-xs">
            {currentLevel.fields.map((field) => {
              const displayType = field.type || field.field_type || 'string';
              const baseType = getBaseTypeName(displayType);
              const targetSchemaFields = resolveSchemaFields(baseType, schemas);
              const isClickable = Boolean(targetSchemaFields && targetSchemaFields.length > 0);

              return (
                <tr key={field.name} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-2.5 pr-4 text-zinc-200">
                    <span>{field.name}</span>
                    {field.required && (
                      <span className="ml-1 text-[10px] text-amber-500/90">*</span>
                    )}
                    {field.description && (
                      <span className="ml-2 text-[10px] text-zinc-500 font-sans">
                        {field.description}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pl-4 text-zinc-400">
                    {isClickable ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (targetSchemaFields) {
                            onDrillDown({ typeName: baseType, fields: targetSchemaFields });
                          }
                        }}
                        className="underline underline-offset-2 cursor-pointer text-zinc-300 hover:text-white transition font-mono text-left"
                        title={`View ${baseType} specification`}
                      >
                        {displayType}
                      </button>
                    ) : (
                      <span
                        className={
                          displayType === 'OneOf'
                            ? 'text-amber-300/90 font-medium'
                            : displayType.includes('[]')
                            ? 'text-cyan-300/90'
                            : 'text-zinc-300'
                        }
                      >
                        {displayType}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const activeReq = reqStack.length > 0 ? reqStack[reqStack.length - 1] : request;
  const activeRes = resStack.length > 0 ? resStack[resStack.length - 1] : response;

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto space-y-6">
      {/* Top Header Row: ↑↓ Service / Method [ Tag ] */}
      <div className="flex items-center gap-2 select-none">
        <ArrowUpDown size={14} className="text-zinc-400 shrink-0" />
        <div className="flex items-center gap-1.5 font-medium text-xs text-zinc-200">
          {serviceName && (
            <>
              <span className="text-zinc-300 font-semibold">{serviceName}</span>
              <span className="text-zinc-500">/</span>
            </>
          )}
          <span className="text-white font-bold">{methodName}</span>
        </div>
        <div className="ml-2">{renderBadge()}</div>
      </div>

      {/* Responsive Grid: 1 column on smaller screens, 2 columns side-by-side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Request Section */}
        {request && (
          <div className="space-y-2">
            <div className="flex items-center flex-wrap gap-1 text-xs select-none">
              <span className="text-zinc-400 font-normal mr-1">request</span>
              {reqStack.map((level, idx) => {
                const isLast = idx === reqStack.length - 1;
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-zinc-600 font-normal mx-0.5">&gt;</span>}
                    {isLast ? (
                      <span className="text-zinc-100 font-bold">{level.typeName || 'Empty'}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReqStack((prev) => prev.slice(0, idx + 1))}
                        className="text-zinc-400 hover:text-zinc-100 font-medium underline transition"
                      >
                        {level.typeName}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {renderTable(activeReq, (level) => setReqStack((prev) => [...prev, level]))}
          </div>
        )}

        {/* Response Section */}
        {response && (
          <div className="space-y-2">
            <div className="flex items-center flex-wrap gap-1 text-xs select-none">
              <span className="text-zinc-400 font-normal mr-1">response</span>
              {resStack.map((level, idx) => {
                const isLast = idx === resStack.length - 1;
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-zinc-600 font-normal mx-0.5">&gt;</span>}
                    {isLast ? (
                      <span className="text-zinc-100 font-bold">{level.typeName || 'Empty'}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setResStack((prev) => prev.slice(0, idx + 1))}
                        className="text-zinc-400 hover:text-zinc-100 font-medium underline transition"
                      >
                        {level.typeName}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {renderTable(activeRes, (level) => setResStack((prev) => [...prev, level]))}
          </div>
        )}
      </div>

      {!request && !response && (
        <div className="p-4 text-xs text-zinc-500 italic">
          No request or response schema available for this endpoint.
        </div>
      )}
    </div>
  );
};
