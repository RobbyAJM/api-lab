/**
 * Dictionary-backed FIX metadata used by the parsed message inspector.
 *
 * The JSON files are pinned copies of the Apache-2.0 Boar FIX dictionary data,
 * generated from QuickFIX / FIX Repository structure plus FIX Orchestra prose.
 */

export type FixReqd = 'Y' | 'N' | 'C';

export interface FixEnumValue {
  value: string;
  name: string;
  description: string;
}

export interface FixFieldDefinition {
  tag: number;
  name: string;
  type: string;
  enumValues?: FixEnumValue[];
  isGroupCounter?: boolean;
  lengthField?: number;
  description?: string;
}

export interface FixDataTypeDefinition {
  name: string;
  base: 'int' | 'float' | 'char' | 'String' | 'data';
  parent?: string;
  formatPattern?: string;
  lengthPrefixed?: boolean;
  multiValueDelimiter?: string;
  description?: string;
}

export interface FixFieldMember {
  kind: 'field';
  tag: number;
  reqd: FixReqd;
}

export interface FixComponentMember {
  kind: 'component';
  name: string;
  reqd: FixReqd;
}

export interface FixGroupMember {
  kind: 'group';
  counterTag: number;
  reqd: FixReqd;
  members: FixMemberRef[];
}

export type FixMemberRef = FixFieldMember | FixComponentMember | FixGroupMember;

export interface FixComponentDefinition {
  name: string;
  members: FixMemberRef[];
}

export interface FixMessageDefinition {
  name: string;
  msgType: string;
  category: 'admin' | 'app';
  members: FixMemberRef[];
}

export interface FixDictionaryJSON {
  version: string;
  beginString: string;
  datatypes: Record<string, FixDataTypeDefinition>;
  fields: Record<string, FixFieldDefinition>;
  components: Record<string, FixComponentDefinition>;
  messages: FixMessageDefinition[];
  coverageGaps?: Array<{
    kind: string;
    where: string;
    detail: string;
  }>;
}

export interface FixScope {
  directTags: Set<number>;
  groups: Map<number, FixGroupSchema>;
}

export interface FixGroupSchema extends FixScope {
  counterTag: number;
  delimiterTag?: number;
  definition: FixGroupMember;
}

/**
 * Runtime index over one bundled FIX dictionary.
 */
export class FixDictionary {
  readonly data: FixDictionaryJSON;
  readonly fieldsByTag = new Map<number, FixFieldDefinition>();
  readonly fieldsByName = new Map<string, FixFieldDefinition>();
  readonly messagesByType = new Map<string, FixMessageDefinition>();
  readonly headerTags = new Set<number>();
  readonly trailerTags = new Set<number>();
  private readonly scopeCache = new Map<string, FixScope | null>();

  constructor(data: FixDictionaryJSON) {
    this.data = data;
    for (const field of Object.values(data.fields)) {
      this.fieldsByTag.set(field.tag, field);
      this.fieldsByName.set(field.name, field);
    }
    for (const message of data.messages) {
      if (!this.messagesByType.has(message.msgType)) {
        this.messagesByType.set(message.msgType, message);
      }
    }
    this.collectEnvelopeTags();
  }

  get version(): string {
    return this.data.version;
  }

  get beginString(): string {
    return this.data.beginString;
  }

  fieldByTag(tag: number | string): FixFieldDefinition | undefined {
    const numeric = typeof tag === 'number' ? tag : Number(tag);
    return Number.isInteger(numeric) ? this.fieldsByTag.get(numeric) : undefined;
  }

  fieldByName(name: string): FixFieldDefinition | undefined {
    return this.fieldsByName.get(name);
  }

  messageByMsgType(msgType: string): FixMessageDefinition | undefined {
    return this.messagesByType.get(msgType);
  }

  componentByName(name: string): FixComponentDefinition | undefined {
    return Object.prototype.hasOwnProperty.call(this.data.components, name)
      ? this.data.components[name]
      : undefined;
  }

  /**
   * Builds or returns the cached top-level scope for a message.
   */
  messageScope(msgType: string): FixScope | null {
    if (this.scopeCache.has(msgType)) {
      return this.scopeCache.get(msgType) || null;
    }
    const message = this.messageByMsgType(msgType);
    if (!message) {
      this.scopeCache.set(msgType, null);
      return null;
    }
    const scope = this.buildScope(message.members, new Set(), 0);
    this.scopeCache.set(msgType, scope);
    return scope;
  }

  /**
   * Resolves the first field tag in a repeating-group entry.
   */
  groupDelimiter(group: FixGroupMember): number | undefined {
    return this.firstWireTag(group.members, new Set(), 0);
  }

  /**
   * Full QuickFIX/FIX Orchestra description for a field's datatype.
   */
  datatypeForField(field: FixFieldDefinition): FixDataTypeDefinition | undefined {
    return this.data.datatypes[field.type];
  }

  private buildScope(
    members: FixMemberRef[],
    seenComponents: Set<string>,
    depth: number
  ): FixScope {
    const scope: FixScope = { directTags: new Set(), groups: new Map() };
    if (depth > 32) return scope;

    for (const member of members) {
      switch (member.kind) {
        case 'field':
          scope.directTags.add(member.tag);
          break;
        case 'group': {
          scope.directTags.add(member.counterTag);
          const nested = this.buildScope(
            member.members,
            new Set(seenComponents),
            depth + 1
          );
          scope.groups.set(member.counterTag, {
            ...nested,
            counterTag: member.counterTag,
            delimiterTag: this.groupDelimiter(member),
            definition: member,
          });
          break;
        }
        case 'component': {
          if (seenComponents.has(member.name)) break;
          const component = this.componentByName(member.name);
          if (!component) break;
          seenComponents.add(member.name);
          const expanded = this.buildScope(component.members, seenComponents, depth + 1);
          for (const tag of expanded.directTags) scope.directTags.add(tag);
          for (const [tag, group] of expanded.groups) scope.groups.set(tag, group);
          component.members
            .filter((child): child is FixGroupMember => child.kind === 'group')
            .forEach((group) => scope.directTags.add(group.counterTag));
          break;
        }
      }
    }
    return scope;
  }

  private firstWireTag(
    members: FixMemberRef[],
    seenComponents: Set<string>,
    depth: number
  ): number | undefined {
    if (depth > 32) return undefined;
    for (const member of members) {
      if (member.kind === 'field') return member.tag;
      if (member.kind === 'group') return member.counterTag;
      if (seenComponents.has(member.name)) continue;
      const component = this.componentByName(member.name);
      if (!component) continue;
      seenComponents.add(member.name);
      const tag = this.firstWireTag(component.members, seenComponents, depth + 1);
      if (tag !== undefined) return tag;
    }
    return undefined;
  }

  private collectEnvelopeTags(): void {
    for (const message of this.data.messages) {
      const first = message.members[0];
      const last = message.members[message.members.length - 1];
      if (first?.kind === 'component' && isHeaderComponent(first.name)) {
        this.collectComponentTags(first.name, this.headerTags, new Set());
      }
      if (last?.kind === 'component' && isTrailerComponent(last.name)) {
        this.collectComponentTags(last.name, this.trailerTags, new Set());
      }
    }
  }

  private collectComponentTags(
    name: string,
    target: Set<number>,
    seenComponents: Set<string>
  ): void {
    if (seenComponents.has(name)) return;
    const component = this.componentByName(name);
    if (!component) return;
    seenComponents.add(name);
    collectMemberTags(component.members, target);
    for (const member of component.members) {
      if (member.kind === 'component') {
        this.collectComponentTags(member.name, target, seenComponents);
      }
    }
  }
}

/**
 * Creates a synchronous dictionary index, primarily for tests and tools.
 */
export function createFixDictionary(data: FixDictionaryJSON): FixDictionary {
  return new FixDictionary(data);
}

const dictionaryCache = new Map<string, Promise<FixDictionary | null>>();

const DICTIONARY_LOADERS: Record<string, () => Promise<unknown>> = {
  'FIX.4.2': () => import('../data/fix/fix42.json'),
  'FIX.4.4': () => import('../data/fix/fix44.json'),
};

/**
 * Lazily loads and caches the dictionary matching a FIX BeginString.
 *
 * Unknown or custom BeginString values return `null`; callers then use the raw
 * flat message view.
 */
export function loadFixDictionary(
  beginString?: string | null
): Promise<FixDictionary | null> {
  const normalized = beginString?.trim() || '';
  const loader = DICTIONARY_LOADERS[normalized];
  if (!loader) return Promise.resolve(null);
  const cached = dictionaryCache.get(normalized);
  if (cached) return cached;

  const pending = loader()
    .then((module) => {
      const data = unwrapDictionaryModule(module);
      return data ? new FixDictionary(data) : null;
    })
    .catch(() => null);
  dictionaryCache.set(normalized, pending);
  return pending;
}

function unwrapDictionaryModule(module: unknown): FixDictionaryJSON | null {
  if (!module || typeof module !== 'object') return null;
  const candidate =
    'default' in module
      ? (module as { default?: unknown }).default
      : module;
  if (!candidate || typeof candidate !== 'object') return null;
  const value = candidate as Partial<FixDictionaryJSON>;
  return value.beginString && value.fields && value.messages
    ? (candidate as FixDictionaryJSON)
    : null;
}

function isHeaderComponent(name: string): boolean {
  return /standard.*header|message header/i.test(name);
}

function isTrailerComponent(name: string): boolean {
  return /standard.*trailer|message trailer/i.test(name);
}

function collectMemberTags(members: FixMemberRef[], target: Set<number>): void {
  for (const member of members) {
    if (member.kind === 'field') target.add(member.tag);
    else if (member.kind === 'group') {
      target.add(member.counterTag);
      collectMemberTags(member.members, target);
    }
  }
}
