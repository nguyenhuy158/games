import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_ROOTS = ['shared', 'backend/src', 'frontend/src'];
const MODULE_EXTENSION = /\.(?:m?js)$/;
const HTML_EXTENSION = '.html';
const SHARED = 'shared/';
const DOMAIN = 'backend/src/domain/';
const APPLICATION = 'backend/src/application/';
const PORTS = 'backend/src/ports.js';
const ADAPTERS = 'backend/src/adapters/';
const BACKEND = 'backend/src/';
const ENTRY = 'backend/src/index.js';
const FRONTEND = 'frontend/src/';
const RUNTIME_GLOBALS = new Set(['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'WebSocket', 'XMLHttpRequest', 'Worker', 'process', 'Buffer', 'Deno', 'Bun', 'self', 'globalThis', 'caches', 'crypto']);
const IMPORT_NODES = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression']);
const MEMBER_NODES = new Set(['MemberExpression', 'Property', 'MethodDefinition', 'PropertyDefinition']);
const PARSE_OPTIONS = { ecmaVersion: 'latest', sourceType: 'module' };
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const SCRIPT_SOURCE = /\bsrc\s*=\s*['"]([^'"]+)['"]/i;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function allowed(source, target, local) {
  if (source.startsWith(SHARED)) return local && target.startsWith(SHARED);
  if (source.startsWith(DOMAIN)) return local && (target.startsWith(SHARED) || target.startsWith(DOMAIN));
  if (source.startsWith(APPLICATION) || source === PORTS) return local && (target.startsWith(SHARED) || target.startsWith(DOMAIN) || target.startsWith(APPLICATION) || target === PORTS);
  if (source.startsWith(ADAPTERS)) return !local || target.startsWith(SHARED) || target.startsWith(BACKEND) && target !== ENTRY;
  if (source.startsWith(FRONTEND) || source === 'index.html') return local && (target.startsWith(FRONTEND) || target.startsWith(SHARED));
  return source === ENTRY && (!local || target.startsWith(BACKEND) || target.startsWith(SHARED));
}

export function checkDependencies(root = ROOT) {
  const errors = [];
  const files = SOURCE_ROOTS.flatMap((directory) => walk(join(root, directory))).filter((path) => MODULE_EXTENSION.test(path) || path.endsWith(HTML_EXTENSION));
  files.push(join(root, 'index.html'));
  for (const file of files) {
    const source = relative(root, file);
    const text = readFileSync(file, 'utf8');
    const imports = [];
    const scripts = [];
    if (file.endsWith(HTML_EXTENSION)) {
      for (const [, attributes, script] of text.matchAll(SCRIPT_BLOCK)) {
        const external = attributes.match(SCRIPT_SOURCE);
        if (external) imports.push({ specifier: external[1], asset: true });
        else scripts.push(script);
      }
    } else scripts.push(text);
    const visit = (node, parent, key) => {
      if (!node || typeof node !== 'object') return;
      if (IMPORT_NODES.has(node.type) && node.source) {
        if (typeof node.source.value === 'string') imports.push({ specifier: node.source.value });
        else errors.push(`${source}: non-literal import cannot be checked`);
      }
      if (source.startsWith(SHARED) && node.type === 'Identifier' && RUNTIME_GLOBALS.has(node.name)) {
        const property = MEMBER_NODES.has(parent?.type) && !parent.computed && (key === 'property' || key === 'key');
        if (!property) errors.push(`${source}: runtime global ${node.name}`);
      }
      for (const [childKey, child] of Object.entries(node)) {
        if (Array.isArray(child)) child.forEach((entry) => { visit(entry, node, childKey); });
        else if (child && typeof child === 'object') visit(child, node, childKey);
      }
    };
    for (const script of scripts) {
      try { visit(parse(script, PARSE_OPTIONS)); }
      catch (error) { errors.push(`${source}: ${error.message}`); }
    }
    for (const { specifier, asset } of imports) {
      const local = asset ? !/^[a-z][a-z\d+.-]*:|^\/\//i.test(specifier) : specifier.startsWith('.') || specifier.startsWith('/');
      let target = specifier;
      if (local) {
        const pathname = specifier.split(/[?#]/)[0];
        const browser = source.startsWith(FRONTEND) || source === 'index.html';
        const base = source === 'index.html' ? join(root, FRONTEND) : dirname(file);
        const path = browser && pathname.startsWith('/')
          ? resolve(root, pathname.startsWith(`/${SHARED}`) ? `.${pathname}` : `${FRONTEND}${pathname.slice(1)}`)
          : resolve(base, pathname);
        target = relative(root, path);
        try { if (!statSync(path).isFile()) errors.push(`${source}: missing module ${specifier}`); }
        catch { errors.push(`${source}: missing module ${specifier}`); }
      }
      if (!allowed(source, target, local)) errors.push(`${source} -> ${target}`);
    }
  }
  return errors;
}

const errors = checkDependencies();
if (errors.length) throw new Error(`Sai chiều phụ thuộc:\n  ${errors.join('\n  ')}`);
console.log('deps ok');
