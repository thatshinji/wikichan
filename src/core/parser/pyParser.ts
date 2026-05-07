import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import path from 'node:path';
import type { FileRecord } from '../scanner.js';
import type { ParsedEntity, CodeRelation, ParseResult, Parser as IParser } from './index.js';

export class PyParser implements IParser {
  private createParser(): Parser {
    const parser = new Parser();
    parser.setLanguage(Python.language);
    return parser;
  }

  parseFile(file: FileRecord, source: string): ParseResult {
    const parser = this.createParser();
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
        case 'function_definition':
          this.extractFunction(child, filePath, moduleId, entities, source);
          break;
        case 'class_definition':
          this.extractClass(child, filePath, moduleId, entities, relations, source);
          break;
        case 'import_statement':
        case 'import_from_statement':
          this.extractImport(child, filePath, moduleId, relations);
          break;
        case 'decorated_definition':
          // Handle decorated functions/classes
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

    // Check for inheritance
    const argumentList = node.childForFieldName('superclasses');
    if (argumentList) {
      for (const arg of argumentList.namedChildren) {
        if (arg.type === 'identifier' || arg.type === 'attribute') {
          relations.push({
            from: classId,
            to: arg.text,
            type: 'INHERITS',
          });
        }
      }
    }

    // Extract methods from class body
    const body = node.childForFieldName('body');
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'function_definition') {
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

  private extractImport(
    node: Parser.SyntaxNode,
    filePath: string,
    moduleId: string,
    relations: CodeRelation[],
  ): void {
    if (node.type === 'import_statement') {
      // import module or import module as alias
      const moduleName = node.childForFieldName('name');
      if (moduleName) {
        relations.push({
          from: moduleId,
          to: moduleName.text,
          type: 'IMPORTS',
        });
      }
    } else if (node.type === 'import_from_statement') {
      // from module import name
      const moduleName = node.childForFieldName('module_name');
      if (moduleName) {
        relations.push({
          from: moduleId,
          to: moduleName.text,
          type: 'IMPORTS',
        });
      }
    }
  }

  private extractDoc(node: Parser.SyntaxNode, source: string): string | null {
    // Python docstrings are the first expression statement in a function/class body
    const body = node.childForFieldName('body');
    if (body && body.namedChildren.length > 0) {
      const firstChild = body.namedChildren[0];
      if (firstChild.type === 'expression_statement') {
        const expr = firstChild.namedChildren[0];
        if (expr && expr.type === 'string') {
          // Remove quotes and clean up
          let doc = expr.text;
          // Handle triple quotes
          if (doc.startsWith('"""') || doc.startsWith("'''")) {
            doc = doc.slice(3, -3);
          } else if (doc.startsWith('"') || doc.startsWith("'")) {
            doc = doc.slice(1, -1);
          }
          return doc.trim();
        }
      }
    }

    // Check for comment before the node
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.type === 'comment') {
        const text = sibling.text;
        if (text.startsWith('#')) {
          return text.slice(1).trim();
        }
        break;
      }
      if (sibling.text.trim() === '') {
        sibling = sibling.previousSibling;
        continue;
      }
      break;
    }

    return null;
  }
}
