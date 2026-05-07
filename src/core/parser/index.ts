import type { FileRecord } from '../scanner.js';
import { TsParser } from './tsParser.js';
import { PyParser } from './pyParser.js';

export interface ParsedEntity {
  id: string;
  kind: 'module' | 'class' | 'function' | 'method' | 'interface' | 'config';
  name: string;
  file: string;
  range: { startLine: number; endLine: number };
  parents: string[];
  doc: string | null;
}

export interface CodeRelation {
  from: string;
  to: string;
  type: 'CALLS' | 'IMPORTS' | 'INHERITS' | 'USES' | 'WRITES';
}

export interface ParseResult {
  entities: ParsedEntity[];
  relations: CodeRelation[];
}

export interface Parser {
  parseFile(file: FileRecord, source: string): ParseResult;
}

export function getParser(language: string): Parser {
  switch (language) {
    case 'py':
      return new PyParser();
    case 'ts':
    case 'js':
    default:
      return new TsParser();
  }
}
