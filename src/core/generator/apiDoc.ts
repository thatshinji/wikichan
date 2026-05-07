import fs from 'node:fs';
import path from 'node:path';
import type { IndexStorage } from '../indexer/storage.js';
import type { WikichanConfig } from '../config.js';
import type { LLMClient } from '../llm/client.js';
import type { ParsedEntity } from '../parser/index.js';
import { getModules } from '../indexer/graph.js';
import { info } from '../logger.js';

export interface APIEndpoint {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
  doc: string | null;
  params: string[];
  requestType: string | null;
  responseType: string | null;
}

export async function generateApiDocs(
  storage: IndexStorage,
  config: WikichanConfig,
  llm: LLMClient,
  cwd: string,
): Promise<void> {
  info('gen', 'Generating API documentation...');

  // Find all modules that might contain API endpoints
  const modules = getModules(storage);
  const apiEndpoints: APIEndpoint[] = [];

  for (const mod of modules) {
    const endpoints = extractEndpoints(mod.symbols, storage, cwd);
    apiEndpoints.push(...endpoints);
  }

  if (apiEndpoints.length === 0) {
    info('gen', 'No API endpoints found');
    return;
  }

  info('gen', `Found ${apiEndpoints.length} API endpoints`);

  // Generate API documentation
  const systemPrompt = `You are a technical documentation writer. Generate clear, well-structured API documentation in Markdown format.
Output ONLY the Markdown content, no preamble or explanations.`;

  const endpointList = apiEndpoints.map(ep => {
    const params = ep.params.length > 0 ? `\n  Parameters: ${ep.params.join(', ')}` : '';
    const doc = ep.doc ? `\n  Description: ${ep.doc}` : '';
    const reqType = ep.requestType ? `\n  Request Type: ${ep.requestType}` : '';
    const resType = ep.responseType ? `\n  Response Type: ${ep.responseType}` : '';
    return `- ${ep.method} ${ep.path}\n  Handler: ${ep.handler}\n  File: ${ep.file}:${ep.line}${params}${doc}${reqType}${resType}`;
  }).join('\n\n');

  const userPrompt = `Generate API documentation for the following endpoints:

${endpointList}

Please generate a Markdown document with:
1. API Overview
2. Base URL (if inferable)
3. Authentication (if inferable)
4. Endpoints grouped by resource
5. Each endpoint with:
   - Method and path
   - Description
   - Request parameters
   - Response format (if inferable)
   - Example request/response (if inferable)`;

  const response = await llm.chat({
    systemPrompt,
    userPrompt,
  });

  // Write to output
  const outputPath = path.join(cwd, config.output.root, config.output.structure.apisDir, 'api.md');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, response.content, 'utf-8');

  info('gen', `API documentation written to ${outputPath}`);
}

function extractEndpoints(
  symbols: ParsedEntity[],
  storage: IndexStorage,
  cwd: string,
): APIEndpoint[] {
  const endpoints: APIEndpoint[] = [];

  for (const symbol of symbols) {
    // Look for route decorators or function names that suggest API endpoints
    if (symbol.kind === 'function' || symbol.kind === 'method') {
      const endpoint = detectEndpoint(symbol, storage, cwd);
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }
  }

  return endpoints;
}

function detectEndpoint(
  symbol: ParsedEntity,
  storage: IndexStorage,
  cwd: string,
): APIEndpoint | null {
  // Common patterns for API endpoints:
  // 1. Express-style: app.get('/path', handler), router.post('/path', handler)
  // 2. Decorators: @Get('/path'), @Post('/path')
  // 3. Function names: getUserById, createUser, etc.

  const filePath = path.join(cwd, symbol.file);
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = source.split('\n');
  const startLine = Math.max(0, symbol.range.startLine - 1);
  const endLine = Math.min(lines.length, symbol.range.endLine);
  const code = lines.slice(startLine, endLine).join('\n');

  const { requestType, responseType } = extractTypes(code);

  // Check for Express-style route definitions
  const expressMatch = code.match(/(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
  if (expressMatch) {
    return {
      method: expressMatch[1].toUpperCase(),
      path: expressMatch[2],
      handler: symbol.name,
      file: symbol.file,
      line: symbol.range.startLine,
      doc: symbol.doc,
      params: extractParams(code),
      requestType,
      responseType,
    };
  }

  // Check for decorator-style route definitions
  const decoratorMatch = code.match(/@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]+)['"]/);
  if (decoratorMatch) {
    return {
      method: decoratorMatch[1].toUpperCase(),
      path: decoratorMatch[2],
      handler: symbol.name,
      file: symbol.file,
      line: symbol.range.startLine,
      doc: symbol.doc,
      params: extractParams(code),
      requestType,
      responseType,
    };
  }

  // Check for common API function naming patterns
  const apiPatterns = [
    { pattern: /^(get|fetch|find)(.+)$/i, method: 'GET' },
    { pattern: /^(create|add|insert)(.+)$/i, method: 'POST' },
    { pattern: /^(update|modify|edit)(.+)$/i, method: 'PUT' },
    { pattern: /^(delete|remove)(.+)$/i, method: 'DELETE' },
  ];

  for (const { pattern, method } of apiPatterns) {
    const match = symbol.name.match(pattern);
    if (match) {
      // Infer path from function name
      const resource = match[2]
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');

      return {
        method,
        path: `/${resource}`,
        handler: symbol.name,
        file: symbol.file,
        line: symbol.range.startLine,
        doc: symbol.doc,
        params: extractParams(code),
        requestType,
        responseType,
      };
    }
  }

  return null;
}

function extractTypes(code: string): { requestType: string | null; responseType: string | null } {
  let requestType: string | null = null;
  let responseType: string | null = null;

  // Extract request type from function parameter annotations
  // Pattern: (req: RequestType, res: ResponseType) or (req: RequestType)
  const reqTypeMatch = code.match(/\(\s*(?:req|request)\s*:\s*([A-Z][a-zA-Z0-9<>[\]|\s&]+?)(?:\s*[,)])/);
  if (reqTypeMatch) {
    requestType = reqTypeMatch[1].trim();
  }

  // Extract return type from function signature
  // Pattern: ): ReturnType { or ): Promise<ReturnType> {
  const returnTypeMatch = code.match(/\)\s*:\s*(Promise<([^>]+)>|([A-Z][a-zA-Z0-9<>[\]|\s&]+?))\s*\{/);
  if (returnTypeMatch) {
    responseType = (returnTypeMatch[2] ?? returnTypeMatch[3])?.trim() ?? null;
  }

  return { requestType, responseType };
}

function extractParams(code: string): string[] {
  const params: string[] = [];

  // Extract function parameters
  const paramMatch = code.match(/\(([^)]*)\)/);
  if (paramMatch) {
    const paramStr = paramMatch[1];
    // Split by comma and clean up
    const paramList = paramStr.split(',').map(p => p.trim()).filter(p => p);
    for (const param of paramList) {
      // Remove type annotations and default values
      const cleanParam = param.split(':')[0].split('=')[0].trim();
      if (cleanParam && !['req', 'res', 'next', 'request', 'response'].includes(cleanParam)) {
        params.push(cleanParam);
      }
    }
  }

  return params;
}
