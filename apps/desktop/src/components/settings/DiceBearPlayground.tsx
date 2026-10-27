import React, { useState, useEffect } from 'react';
import {
  Dices,
  Copy,
  Download,
  RotateCcw,
  Check,
  Link,
  ChevronDown,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import {
  type DiceBearStyle,
  getDiceBearUrl,
  generateRandomSeed,
  type AvatarOptions,
} from '../../utils/dicebear';
import {
  DICEBEAR_STYLE_DEFINITIONS,
  getStyleDefinition,
  sanitizeExtraComponents,
} from '../../utils/dicebearSchema';

interface DiceBearPlaygroundProps {
  style: DiceBearStyle;
  seed: string;
  options: AvatarOptions;
  onChange: (style: DiceBearStyle, seed: string, options: AvatarOptions) => void;
}

const COLOR_PRESETS = [
  { label: 'None', value: 'transparent' },
  { label: 'Slate', value: '1e293b' },
  { label: 'Dark', value: '18181b' },
  { label: 'Ice Blue', value: 'b6e3f4' },
  { label: 'Lavender', value: 'c0aede' },
  { label: 'Rose', value: 'ffd5dc' },
  { label: 'Mint', value: 'd1fae5' },
  { label: 'Cobalt', value: '2563eb' },
  { label: 'Emerald', value: '10b981' },
  { label: 'Amber', value: 'f59e0b' },
];

export const DiceBearPlayground: React.FC<DiceBearPlaygroundProps> = ({
  style,
  seed,
  options,
  onChange,
}) => {
  const [activeComponentTab, setActiveComponentTab] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'svg' | 'url' | null>(null);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [styleDropdownOpen, setStyleDropdownOpen] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<boolean>(false);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const styleDef = getStyleDefinition(style);

  // Sync active component tab when style changes or current tab no longer exists
  useEffect(() => {
    if (styleDef.components.length > 0) {
      if (!styleDef.components.some((c) => c.id === activeComponentTab)) {
        setActiveComponentTab(styleDef.components[0].id);
      }
    } else {
      setActiveComponentTab('');
    }
    // Clear preview error on style change to allow re-rendering
    setPreviewError(false);
  }, [style, styleDef.components, activeComponentTab]);

  const radius = options.radius ?? 0;
  const flip = Boolean(options.flip);
  const rotate = options.rotate ?? 0;
  const scale = options.scale ?? 100;
  const bgColor = options.backgroundColor || 'transparent';
  const extraComponents = options.extra || {};

  const avatarUrl = getDiceBearUrl(style, seed, options);

  const handleStyleSelect = (newStyle: DiceBearStyle) => {
    const cleanedExtra = sanitizeExtraComponents(newStyle, options.extra);
    onChange(newStyle, seed, {
      ...options,
      extra: Object.keys(cleanedExtra).length > 0 ? cleanedExtra : undefined,
    });
    setStyleDropdownOpen(false);
    setPreviewError(false);
  };

  const handleRandomize = () => {
    onChange(style, generateRandomSeed(), options);
  };

  const handleReset = () => {
    onChange(style, seed, {
      backgroundColor: undefined,
      radius: undefined,
      flip: undefined,
      rotate: undefined,
      scale: undefined,
      extra: undefined,
    });
    setPreviewError(false);
  };

  const handleSelectVariant = (componentId: string, variant: string) => {
    const nextExtra = { ...extraComponents };
    if (nextExtra[componentId] === variant) {
      delete nextExtra[componentId];
    } else {
      nextExtra[componentId] = variant;
    }
    onChange(style, seed, {
      ...options,
      extra: Object.keys(nextExtra).length > 0 ? nextExtra : undefined,
    });
    setPreviewError(false);
  };

  const handleClearComponentVariant = (componentId: string) => {
    const nextExtra = { ...extraComponents };
    delete nextExtra[componentId];
    onChange(style, seed, {
      ...options,
      extra: Object.keys(nextExtra).length > 0 ? nextExtra : undefined,
    });
    setPreviewError(false);
  };

  const handleCopySvg = async () => {
    try {
      const res = await fetch(avatarUrl);
      if (!res.ok) throw new Error('Fetch failed');
      const svgText = await res.text();
      await navigator.clipboard.writeText(svgText);
      setCopiedType('svg');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      await navigator.clipboard.writeText(avatarUrl);
      setCopiedType('url');
      setTimeout(() => setCopiedType(null), 2000);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(avatarUrl);
      setCopiedType('url');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadSvg = async () => {
    setDownloading(true);
    try {
      const res = await fetch(avatarUrl);
      if (!res.ok) throw new Error('Fetch failed');
      const svgText = await res.text();
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${style}-${seed}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(avatarUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  const currentComponent = styleDef.components.find((c) => c.id === activeComponentTab);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start h-full min-h-0">
      {/* Left Column: Interactive Controls */}
      <div className="flex-1 w-full space-y-4 overflow-y-auto max-h-[500px] pr-2">
        {/* Style Selector Card */}
        <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Avatar Style
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">DiceBear 10.x</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-700/80 hover:border-zinc-600 rounded text-xs text-zinc-100 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={getDiceBearUrl(style, 'preview', { radius: 50 })}
                  alt=""
                  className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex-shrink-0"
                />
                <span className="font-medium truncate">{styleDef.label}</span>
                <span className="text-[10px] text-zinc-500 truncate hidden sm:inline">
                  — {styleDef.description}
                </span>
              </div>
              <ChevronDown size={14} className="text-zinc-400 ml-2 flex-shrink-0" />
            </button>

            {styleDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-60 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1 divide-y divide-zinc-800">
                {DICEBEAR_STYLE_DEFINITIONS.map((def) => {
                  const isCurrent = def.id === style;
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => handleStyleSelect(def.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition ${
                        isCurrent
                          ? 'bg-zinc-800 text-blue-400'
                          : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100'
                      }`}
                    >
                      <img
                        src={getDiceBearUrl(def.id, 'sample', { radius: 50 })}
                        alt=""
                        className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{def.label}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{def.description}</div>
                      </div>
                      {isCurrent && <Check size={12} className="text-blue-400 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Seed & Randomizer */}
        <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Seed Generator
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Deterministic Hash</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={seed}
              onChange={(e) => {
                onChange(style, e.target.value, options);
                setPreviewError(false);
              }}
              placeholder="Seed key..."
              className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-blue-500 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none"
            />
            <button
              type="button"
              onClick={handleRandomize}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition flex-shrink-0"
              title="Roll new random seed"
            >
              <Dices size={13} />
              <span>Roll</span>
            </button>
          </div>
        </div>

        {/* Transforms */}
        <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Transform
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
            >
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Flip */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Flip</label>
              <div className="flex rounded border border-zinc-800 overflow-hidden p-0.5 bg-zinc-950">
                <button
                  type="button"
                  onClick={() => onChange(style, seed, { ...options, flip: undefined })}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition ${
                    !flip ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={() => onChange(style, seed, { ...options, flip: true })}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition ${
                    flip ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Horizontal
                </button>
              </div>
            </div>

            {/* Corner Radius */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>Radius</span>
                <span className="font-mono text-zinc-300">{radius}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={radius}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange(style, seed, {
                    ...options,
                    radius: val > 0 ? val : undefined,
                  });
                }}
                className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Rotate */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>Rotate</span>
                <span className="font-mono text-zinc-300">{rotate}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="15"
                value={rotate}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange(style, seed, {
                    ...options,
                    rotate: val > 0 ? val : undefined,
                  });
                }}
                className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Scale */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>Scale</span>
                <span className="font-mono text-zinc-300">{scale}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="150"
                step="5"
                value={scale}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange(style, seed, {
                    ...options,
                    scale: val !== 100 ? val : undefined,
                  });
                }}
                className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Components / Feature Variants */}
        {styleDef.components.length > 0 && (
          <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Components
              </span>
              <span className="text-[10px] text-zinc-500">Pick variants</span>
            </div>

            {/* Component Tabs */}
            <div className="flex items-center gap-1 border-b border-zinc-800 pb-2 overflow-x-auto">
              {styleDef.components.map((comp) => {
                const isActive = comp.id === activeComponentTab;
                const selectedVariant = extraComponents[comp.id];
                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => setActiveComponentTab(comp.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    <span>{comp.label}</span>
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                        selectedVariant
                          ? 'bg-blue-900/80 text-blue-200 font-semibold'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {comp.variants.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Component Variants Grid */}
            {currentComponent && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">
                    Variants ({currentComponent.variants.length})
                  </span>
                  {extraComponents[currentComponent.id] && (
                    <button
                      type="button"
                      onClick={() => handleClearComponentVariant(currentComponent.id)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-mono transition"
                    >
                      Revert to seed default
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 bg-zinc-950/40 rounded border border-zinc-800/80">
                  {currentComponent.variants.map((v) => {
                    const isSelected = extraComponents[currentComponent.id] === v;
                    const isFailed = failedThumbs[v];
                    const previewThumbUrl = getDiceBearUrl(style, 'preview', {
                      extra: { [currentComponent.id]: v },
                    });
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleSelectVariant(currentComponent.id, v)}
                        className={`p-1.5 rounded border flex flex-col items-center gap-1 transition ${
                          isSelected
                            ? 'border-blue-500 bg-blue-950/40 text-blue-300 ring-1 ring-blue-500'
                            : 'border-zinc-800/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                        title={v}
                      >
                        {!isFailed ? (
                          <img
                            src={previewThumbUrl}
                            alt={v}
                            onError={() => setFailedThumbs((prev) => ({ ...prev, [v]: true }))}
                            className="w-9 h-9 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded bg-zinc-800/80 flex items-center justify-center text-[10px] text-zinc-400 font-mono">
                            {v.slice(0, 3)}
                          </div>
                        )}
                        <span className="text-[9px] font-mono truncate w-full text-center">
                          {v}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Background Colors */}
        <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Background Color
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {bgColor === 'transparent' ? 'None' : `#${bgColor}`}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((p) => {
              const isSelected = bgColor === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() =>
                    onChange(style, seed, {
                      ...options,
                      backgroundColor: p.value !== 'transparent' ? p.value : undefined,
                    })
                  }
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition ${
                    isSelected
                      ? 'border-blue-500 bg-zinc-800 text-zinc-100 ring-1 ring-blue-500'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-zinc-700 flex-shrink-0"
                    style={{
                      backgroundColor: p.value === 'transparent' ? 'transparent' : `#${p.value}`,
                    }}
                  />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Sticky Live Preview & Action Bar */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
        {/* Preview Frame */}
        <div className="p-4 bg-zinc-900/60 rounded border border-zinc-800 flex flex-col items-center">
          <div className="w-full flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-3">
            <span>Live Output</span>
            <span className="font-mono text-zinc-500">{styleDef.label}</span>
          </div>

          {/* Checkerboard container */}
          <div
            className="w-48 h-48 rounded border border-zinc-700/80 flex items-center justify-center p-3 relative overflow-hidden shadow-inner bg-zinc-950"
            style={{
              backgroundImage:
                'radial-gradient(#27272a 1px, transparent 1px), radial-gradient(#27272a 1px, #09090b 1px)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 8px 8px',
            }}
          >
            {!previewError ? (
              <img
                src={avatarUrl}
                alt="Avatar preview"
                onError={() => setPreviewError(true)}
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div className="text-center p-2 space-y-1">
                <AlertCircle size={24} className="text-amber-400 mx-auto" />
                <div className="text-[11px] font-medium text-zinc-300">Preview Unavailable</div>
                <div className="text-[9px] text-zinc-500 font-mono">Check connection or options</div>
                <button
                  type="button"
                  onClick={() => setPreviewError(false)}
                  className="mt-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px]"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 text-center">
            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded truncate max-w-[200px] inline-block">
              {seed}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleCopySvg}
            className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded text-xs font-medium flex items-center justify-center gap-2 border border-zinc-700/60 transition"
          >
            {copiedType === 'svg' ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span className="text-emerald-400">SVG Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy SVG</span>
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={downloading}
              className="py-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center justify-center gap-1.5 border border-zinc-800 transition disabled:opacity-50"
            >
              <Download size={13} />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={handleCopyUrl}
              className="py-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded text-xs font-medium flex items-center justify-center gap-1.5 border border-zinc-800 transition"
            >
              {copiedType === 'url' ? (
                <>
                  <Check size={13} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Link size={13} />
                  <span>Copy URL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Details Card */}
        <div className="p-3 bg-zinc-900/40 rounded border border-zinc-800/80 space-y-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <Sparkles size={12} className="text-amber-400" />
            <span>SVG Characteristics</span>
          </div>
          <div className="text-zinc-500 space-y-0.5 font-mono text-[10px]">
            <div>Format: Vector SVG</div>
            <div>Public HTTP: api.dicebear.com/10.x</div>
            <div className="truncate text-zinc-400">Style: {style}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
