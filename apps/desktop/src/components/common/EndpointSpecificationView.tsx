import React from 'react';
import { ArrowUpDown, BookOpen } from 'lucide-react';

export interface SpecificationField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface SpecificationSection {
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
  emptyMessage?: string;
}

export const EndpointSpecificationView: React.FC<EndpointSpecificationViewProps> = ({
  serviceName,
  methodName,
  badge,
  request,
  response,
  emptyMessage = 'Select an endpoint or method to view specification.',
}) => {
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

  const renderTable = (section: SpecificationSection) => {
    if (!section.fields || section.fields.length === 0) {
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
            {section.fields.map((field) => (
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
                  <span
                    className={
                      field.type === 'OneOf'
                        ? 'text-amber-300/90 font-medium'
                        : field.type.includes('[]')
                        ? 'text-cyan-300/90'
                        : 'text-zinc-300'
                    }
                  >
                    {field.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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

      {/* Request Section */}
      {request && (
        <div className="space-y-2">
          <div className="flex items-center text-xs">
            <span className="text-zinc-400 font-normal mr-2">request</span>
            <span className="text-zinc-100 font-bold">{request.typeName || 'Empty'}</span>
          </div>
          {renderTable(request)}
        </div>
      )}

      {/* Response Section */}
      {response && (
        <div className="space-y-2">
          <div className="flex items-center text-xs">
            <span className="text-zinc-400 font-normal mr-2">response</span>
            <span className="text-zinc-100 font-bold">{response.typeName || 'Empty'}</span>
          </div>
          {renderTable(response)}
        </div>
      )}

      {!request && !response && (
        <div className="p-4 text-xs text-zinc-500 italic">
          No request or response schema available for this endpoint.
        </div>
      )}
    </div>
  );
};
