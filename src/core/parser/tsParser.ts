import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import path from 'node:path';
import fs from 'node:fs';
import type { FileRecord } from '../scanner.js';
import type { ParsedEntity, CodeRelation, ParseResult, Parser as IParser } from './index.js';

export class TsParser implements IParser {
  private createParser(filePath: string): Parser {
    const parser = new Parser();
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.tsx') {
      parser.setLanguage(TypeScript.tsx);
    } else {
      parser.setLanguage(TypeScript.typescript);
    }
    return parser;
  }

  parseFile(file: FileRecord, source: string): ParseResult {
    const parser = this.createParser(file.path);
    const tree = parser.parse(source);
    const entities: ParsedEntity[] = [];
    const relations: CodeRelation[] = [];

    // Module entity (every file is a module)
    const moduleName = path.basename(file.path, path.extname(file.path));
    const moduleId = file.path;
    const lineCount = source.split('\n').length;
    entities.push({
      id: moduleId,
      kind: 'module',
      name: moduleName,
      file: file.path,
      range: { startLine: 1, endLine: lineCount },
      parents: [],
      doc: null,
    });

    // Extract entities via cursor walk
    this.walkTree(tree.rootNode, file.path, moduleId, entities, relations, source);

    return { entities, relations };
  }

  private walkTree(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    entities: ParsedEntity[],
    relations: CodeRelation[],
    source: string,
  ): void {
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'function_declaration':
          this.extractFunction(child, filePath, moduleId, entities, source);
          break;
        case 'class_declaration':
          this.extractClass(child, filePath, moduleId, entities, relations, source);
          break;
        case 'interface_declaration':
          this.extractInterface(child, filePath, moduleId, entities, source);
          break;
        case 'lexical_declaration':
          this.extractLexicalDeclaration(child, filePath, moduleId, entities, source);
          break;
        case 'import_statement':
        case 'import_declaration':
          this.extractImport(child, filePath, moduleId, relations);
          break;
        case 'export_statement':
          // Recurse into export statements to find the actual declaration
          this.walkTree(child, filePath, moduleId, entities, relations, source);
          break;
      }
    }
  }

  private extractFunction(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    entities: ParsedEntity[],
    source: string,
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const id = `${filePath}:${nameNode.text}`;
    const doc = this.extractDoc(node, source);

    entities.push({
      id,
      kind: 'function',
      name: nameNode.text,
      file: filePath,
      range: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      },
      parents: [moduleId],
      doc,
    });
  }

  private extractClass(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    entities: ParsedEntity[],
    relations: CodeRelation[],
    source: string,
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const classId = `${filePath}:${nameNode.text}`;
    const doc = this.extractDoc(node, source);

    entities.push({
      id: classId,
      kind: 'class',
      name: nameNode.text,
      file: filePath,
      range: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      },
      parents: [moduleId],
      doc,
    });

    // Check for inheritance (extends)
    const heritage = node.childForFieldName('heritage');
    if (heritage) {
      for (const clause of heritage.namedChildren) {
        if (clause.type === 'extends_clause') {
          const parentClass = clause.namedChildren[0];
          if (parentClass) {
            // Use class name as ID - will be resolved during graph building
            relations.push({
              from: classId,
              to: parentClass.text,
              type: 'INHERITS',
            });
          }
        }
      }
    }

    // Extract methods
    const body = node.childForFieldName('body');
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'method_definition') {
          this.extractMethod(member, filePath, classId, entities, source);
        }
      }
    }
  }

  private extractMethod(
    node: Parser.SyntaxNode,
    filePath: string,
    classId: string,
    entities: ParsedEntity[],
    source: string,
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const className = classId.split(':').pop() ?? '';
    const id = `${filePath}:${className}.${nameNode.text}`;
    const doc = this.extractDoc(node, source);

    entities.push({
      id,
      kind: 'method',
      name: nameNode.text,
      file: filePath,
      range: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      },
      parents: [classId],
      doc,
    });
  }

  private extractInterface(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    entities: ParsedEntity[],
    source: string,
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const id = `${filePath}:${nameNode.text}`;
    const doc = this.extractDoc(node, source);

    entities.push({
      id,
      kind: 'interface',
      name: nameNode.text,
      file: filePath,
      range: {
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      },
      parents: [moduleId],
      doc,
    });
  }

  private extractLexicalDeclaration(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    entities: ParsedEntity[],
    source: string,
  ): void {
    // Check if this is a const arrow function or function expression
    for (const child of node.namedChildren) {
      if (child.type === 'variable_declarator') {
        const value = child.childForFieldName('value');
        if (value && (value.type === 'arrow_function' || value.type === 'function')) {
          const nameNode = child.childForFieldName('name');
          if (!nameNode) continue;

          const id = `${filePath}:${nameNode.text}`;
          const doc = this.extractDoc(node, source);

          entities.push({
            id,
            kind: 'function',
            name: nameNode.text,
            file: filePath,
            range: {
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
            },
            parents: [moduleId],
            doc,
          });
        }
      }
    }
  }

  private extractImport(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    relations: CodeRelation[],
  ): void {
    const sourceNode = node.childForFieldName('source');
    if (!sourceNode) return;

    // Remove quotes from the source string
    const importPath = sourceNode.text.replace(/^['"]|['"]$/g, '');

    // Only track relative imports (local modules)
    if (importPath.startsWith('.')) {
      const resolved = this.resolveImportPath(importPath, filePath);
      relations.push({
        from: moduleId,
        to: resolved,
        type: 'IMPORTS',
      });
    }
  }

  private resolveImportPath(importPath: string, fromFile: string): string {
    const dir = path.dirname(fromFile);
    const resolved = path.join(dir, importPath);

    // If already has a recognized extension, return as-is
    const ext = path.extname(resolved);
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return resolved.replace(/^\.\//, '');
    }

    // Try extensions in order
    for (const tryExt of ['.ts', '.tsx', '.js', '.jsx']) {
      const candidate = resolved + tryExt;
      if (fs.existsSync(candidate)) {
        return candidate.replace(/^\.\//, '');
      }
    }

    // Try index files in directory
    for (const tryExt of ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']) {
      const candidate = resolved + tryExt;
      if (fs.existsSync(candidate)) {
        return candidate.replace(/^\.\//, '');
      }
    }

    // Fallback: append .ts
    return (resolved + '.ts').replace(/^\.\//, '');
  }

  private extractDoc(node: Parser.SyntaxNode, source: string): string | null {
    // Walk backwards through siblings, skipping whitespace, to find JSDoc comment
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.type === 'comment') {
        const text = sibling.text;
        if (text.startsWith('/**')) {
          // JSDoc comment - clean it up
          return text
            .replace(/^\/\*\*\s*/, '')
            .replace(/\s*\*\/$/, '')
            .split('\n')
            .map(line => line.replace(/^\s*\*\s?/, ''))
            .join('\n')
            .trim();
        }
        // Found a non-JSDoc comment, stop searching
        break;
      }
      // Skip whitespace nodes
      if (sibling.type !== 'comment' && sibling.text.trim() === '') {
        sibling = sibling.previousSibling;
        continue;
      }
      // Found non-whitespace, non-comment node, stop
      break;
    }
    return null;
  }
}
