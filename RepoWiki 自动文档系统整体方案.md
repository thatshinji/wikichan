
***

# RepoWiki 自动文档系统设计文档

## 目录

- [1. 背景与目标](#1-%E8%83%8C%E6%99%AF%E4%B8%8E%E7%9B%AE%E6%A0%87)
- [2. 技术栈与总体架构](#2-%E6%8A%80%E6%9C%AF%E6%A0%88%E4%B8%8E%E6%80%BB%E4%BD%93%E6%9E%B6%E6%9E%84)
- [3. 项目结构与模块划分](#3-%E9%A1%B9%E7%9B%AE%E7%BB%93%E6%9E%84%E4%B8%8E%E6%A8%A1%E5%9D%97%E5%88%92%E5%88%86)
- [4. 配置设计（含 LLM provider）](#4-%E9%85%8D%E7%BD%AE%E8%AE%BE%E8%AE%A1%E5%90%AB-llm-provider)
- [5. 阶段一：项目扫描](#5-%E9%98%B6%E6%AE%B5%E4%B8%80%E9%A1%B9%E7%9B%AE%E6%89%AB%E6%8F%8F)
- [6. 阶段二：静态分析与符号索引](#6-%E9%98%B6%E6%AE%B5%E4%BA%8C%E9%9D%99%E6%80%81%E5%88%86%E6%9E%90%E4%B8%8E%E7%AC%A6%E5%8F%B7%E7%B4%A2%E5%BC%95)
- [7. 阶段三：语义切片与向量索引-rag](#7-%E9%98%B6%E6%AE%B5%E4%B8%89%E8%AF%AD%E4%B9%89%E5%88%87%E7%89%87%E4%B8%8E%E5%90%91%E9%87%8F%E7%B4%A2%E5%BC%95-rag)
- [8. 阶段四：文档生成流水线](#8-%E9%98%B6%E6%AE%B5%E5%9B%9B%E6%96%87%E6%A1%A3%E7%94%9F%E6%88%90%E6%B5%81%E6%B0%B4%E7%BA%BF)
- [9. 阶段五：增量更新与-git-集成](#9-%E9%98%B6%E6%AE%B5%E4%BA%94%E5%A2%9E%E9%87%8F%E6%9B%B4%E6%96%B0%E4%B8%8E-git-%E9%9B%86%E6%88%90)
- [10. 阶段六：使用方式示例](#10-%E9%98%B6%E6%AE%B5%E5%85%AD%E4%BD%BF%E7%94%A8%E6%96%B9%E5%BC%8F%E7%A4%BA%E4%BE%8B)
- [11. 阶段七：演进路线与风险控制](#11-%E9%98%B6%E6%AE%B5%E4%B8%83%E6%BC%94%E8%BF%9B%E8%B7%AF%E7%BA%BF%E4%B8%8E%E9%A3%8E%E9%99%A9%E6%8E%A7%E5%88%B6)
- [12. CLI 交互设计](#12-cli-%E4%BA%A4%E4%BA%92%E8%AE%BE%E8%AE%A1)
    - [12.1 设计目标](#121-%E8%AE%BE%E8%AE%A1%E7%9B%AE%E6%A0%87)
    - [12.2 全局约定](#122-%E5%85%A8%E5%B1%80%E7%BA%A6%E5%AE%9A)
    - [12.3 命令一览](#123-%E5%91%BD%E4%BB%A4%E4%B8%80%E8%A7%88)
    - [12.4 各命令详细设计](#124-%E5%90%84%E5%91%BD%E4%BB%A4%E8%AF%A6%E7%BB%86%E8%AE%BE%E8%AE%A1)
    - [12.5 退出码规范](#125-%E9%80%80%E5%87%BA%E7%A0%81%E8%A7%84%E8%8C%83)
    - [12.6 日志规范](#126-%E6%97%A5%E5%BF%97%E8%A7%84%E8%8C%83)
    - [12.7 交互-ux-细节](#127-%E4%BA%A4%E4%BA%92-ux-%E7%BB%86%E8%8A%82)

***

## 1. 背景与目标

### 1.1 背景

Qoder 的 Repo Wiki、Google Code Wiki 等工具，都通过“静态代码分析 + LLM + 知识图谱 + 增量更新”为代码仓库生成结构化、可持续维护的项目文档。[^1][^2][^3]

这些系统的共同特点：

- 自动扫描仓库，提取 AST、符号表、依赖关系和注释。[^4][^1]
- 构建项目级代码知识图谱。
- 利用 LLM 对索引进行总结，生成项目概览、模块文档、API 文档等。[^5][^1]
- 在代码变更后执行增量分析，只更新受影响的文档部分。[^1][^4]


### 1.2 本项目目标

实现一个自托管的「Repo Wiki」系统：

- 以 TypeScript 编写，提供跨平台 CLI 工具 `repowiki`。[^6][^7][^8]
- 可在任意 Git 仓库中运行，生成/维护仓库内的 Markdown 文档。
- 通过静态分析 + 向量索引 + LLM 模板，自动生成和更新项目 Wiki。
- LLM provider 不写死，用户在配置文件中自行配置（支持 OpenAI、DeepSeek、Claude 等）。

***

## 2. 技术栈与总体架构

### 2.1 技术栈

- **语言**：TypeScript + Node.js。
    - TypeScript 适合写 CLI：类型安全、工具链成熟，社区已有大量示例。[^7][^8]
- **CLI 框架**：
    - `commander`（成熟度高、文档好、广泛使用）。[^9][^7]
- **静态分析 / AST**：
    - 第一阶段只支持：TypeScript/JavaScript + Python。
    - TypeScript：使用 TypeScript Compiler API 或 tree-sitter。
    - Python：使用 tree-sitter。
    - tree-sitter 支持多语言和统一 AST 抽象，并且适合用 query 做结构模式匹配。[^10]
- **存储与索引**：
    - 索引元数据：
        - MVP 阶段用 SQLite（file-based，部署简单）。
        - 后续可升级到 Postgres。
    - 向量存储：
        - 推荐直接使用 Postgres + `pgvector`（减少系统组件，MVP 简单）。[^11][^12][^13]
- **LLM \& Embedding**：
    - 不写死 provider：在配置文件中指定 provider 类型 + key + endpoint。
    - 内部定义一套通用接口 `LLMClient` / `EmbeddingClient`。
- **日志**：
    - 使用简单的 logging wrapper，输出到 stdout/stderr，遵循 12-factor「日志即事件流」的做法。[^14][^15][^16]


### 2.2 总体架构

三层架构（解析层 / 知识层 / 文档层）保持不变：

1. 解析层：文件扫描 → AST/符号提取 → 关系图构建。
2. 知识层：结构索引（SQLite/Postgres）+ 向量索引（pgvector）。
3. 文档层：LLM + 模板生成 Markdown 文档，并支持增量更新。

***

## 3. 项目结构与模块划分

建议项目结构（以 TS 为例）：

```text
repowiki/
  package.json
  tsconfig.json
  src/
    cli/
      index.ts           # 命令行入口
    core/
      config.ts          # 配置解析与默认值
      logger.ts          # 日志封装
      scanner.ts         # 仓库扫描与过滤
      parser/
        tsParser.ts      # TS/JS 解析
        pyParser.ts      # Python 解析
        index.ts         # 统一 parser 接口
      indexer/
        symbols.ts       # 符号与关系构建
        graph.ts         # 知识图谱接口（查询谁依赖谁）
        storage.ts       # 索引落盘（SQLite / Postgres）
      rag/
        chunker.ts       # 代码片段切分
        embedder.ts      # 向量生成（调用 embedding API）
        vectorStore.ts   # 向量存取（pgvector）
      llm/
        client.ts        # LLMClient 抽象 + provider 选择
        providers/
          openai.ts
          claude.ts
          deepseek.ts
      generator/
        overview.ts      # 项目概览生成
        moduleDoc.ts     # 模块文档生成
        apiDoc.ts        # API 文档生成
        configDoc.ts     # 配置/部署文档生成
        templates.ts     # Prompt 模板
      incremental/
        gitDiff.ts       # Git diff 计算
        impact.ts        # 影响分析（受影响模块/文档）
      state.ts           # 保存/读取上次成功生成的信息（commit 等）
  wiki/                   # 示例输出（实际输出路径可配置）
    ...
```


***

## 4. 配置设计（含 LLM provider）

### 4.1 配置文件示例：`.repowiki.yml`

```yaml
# 支持的语言列表（先从 ts/js + py 开始）
languages:
  - ts
  - js
  - py

# 扫描范围
include:
  - src/**
  - services/**

exclude:
  - node_modules/**
  - dist/**
  - .venv/**
  - tests/**

# 输出
output:
  root: docs/wiki
  structure:
    overview: overview.md
    modulesDir: modules
    apisDir: apis
    config: config.md

# 索引存储
storage:
  # MVP：默认 SQLite
  type: sqlite
  sqlite:
    file: .repowiki/index.db
  # 未来可选：postgres
  postgres:
    url: postgres://user:pass@localhost:5432/repowiki

# 向量存储（默认复用 Postgres + pgvector）
vector:
  enabled: true
  type: pgvector
  pgvector:
    url: postgres://user:pass@localhost:5432/repowiki
    table: embeddings

# LLM 配置（用户自行选择 provider）
llm:
  provider: openai     # openai | deepseek | claude | generic
  model: gpt-4.1       # 对应 provider 的模型名
  apiBase: https://api.openai.com/v1  # 可选，覆盖默认 endpoint
  apiKeyEnv: REPOWIKI_LLM_API_KEY     # 从环境变量读取 key
  maxTokens: 4096
  temperature: 0.2

embedding:
  provider: openai
  model: text-embedding-3-small
  apiBase: https://api.openai.com/v1
  apiKeyEnv: REPOWIKI_EMBEDDING_API_KEY
```

说明：

- 用户通过 `llm.provider` 选择具体 LLM 提供商；
- CLI 在运行时从 `process.env[apiKeyEnv]` 读取密钥，不写死在配置中；
- `embedding` 可与 `llm` provider 一致，也可单独设置（如用便宜模型做 embedding）。[^13]


### 4.2 LLM 抽象接口

```ts
// src/core/llm/client.ts
export interface ChatRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
}

export interface LLMClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
}
```

根据配置中的 `provider`，在运行时选择不同实现（`openai.ts`、`claude.ts`、`deepseek.ts` 等），模式参考常见 RAG TS 实现。[^13]

***

## 5. 阶段一：项目扫描

### 5.1 核心流程

1. 读取 `.repowiki.yml` 与 `.gitignore`。
2. 解析 include/exclude 规则，用 glob 过滤。
3. 按扩展名和配置中的 `languages` 过滤文件。
4. 生成 `FileRecord[]`：
```ts
export interface FileRecord {
  path: string;
  language: 'ts' | 'js' | 'py' | string;
  size: number;
  lastModified: number;
}
```


### 5.2 实现要点

- 若文件数超过某个阈值（如 10,000），输出警告并建议用户缩小 include 范围。
- 可以在配置中增加 `maxFiles` 限制。

***

## 6. 阶段二：静态分析与符号索引

### 6.1 Parser 抽象

```ts
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

export interface Parser {
  parseFile(file: FileRecord, source: string): Promise<{
    entities: ParsedEntity[];
    relations: CodeRelation[];
  }>;
}
```

`parser/index.ts` 根据语言分发到 `tsParser` 或 `pyParser`。

- TS/JS：使用 TypeScript Compiler API 或 tree-sitter，配合 query 来匹配函数/类/接口。[^17][^10]
- Python：使用 tree-sitter-python。


### 6.2 索引存储（SQLite）

SQLite 表结构示例：

- `files(id INTEGER PRIMARY KEY, path TEXT, language TEXT, hash TEXT)`
- `symbols(id TEXT PRIMARY KEY, file_id INTEGER, kind TEXT, name TEXT, start_line INT, end_line INT, parents TEXT, doc TEXT)`
- `relations(id INTEGER PRIMARY KEY, from_symbol_id TEXT, to_symbol_id TEXT, type TEXT)`

`storage.ts` 提供接口：

```ts
export interface IndexStorage {
  upsertFile(file: FileRecord): Promise<number>; // returns file_id
  upsertSymbols(fileId: number, entities: ParsedEntity[]): Promise<void>;
  upsertRelations(relations: CodeRelation[]): Promise<void>;
  getSymbolsByModule(moduleName: string): Promise<ParsedEntity[]>;
  // etc...
}
```


***

## 7. 阶段三：语义切片与向量索引 (RAG)

### 7.1 Chunk 策略

以符号为粒度：

```ts
export interface CodeChunk {
  chunkId: string;         // e.g. "src/user/UserService.ts:fetchUserById"
  file: string;
  symbolId: string;
  content: string;         // 实际代码片段 + 上下文
  meta: {
    module?: string;
    doc?: string | null;
    imports?: string[];
  };
}
```

`chunker.ts` 的职责：

- 根据 `ParsedEntity` 和源文件内容生成 `CodeChunk[]`：
    - 以函数/类为主，附带上下文行（如前后 5 行）。
    - 控制 token 数在安全范围内。


### 7.2 嵌入与向量存储

`embedder.ts` 使用 `EmbeddingClient`：

```ts
export async function embedChunk(chunk: CodeChunk): Promise<number[]> {
  const text = buildEmbeddingText(chunk); // content + doc + meta
  return embeddingClient.embed(text);
}
```

`vectorStore.ts` 使用 Postgres + `pgvector` 保存向量（或 SQLite with extension）：[^12][^11][^13]

- 表结构示例：`embeddings(chunk_id TEXT PRIMARY KEY, embedding VECTOR(1536), meta JSONB)`。
- 提供接口：

```ts
export interface VectorStore {
  upsertEmbedding(chunkId: string, embedding: number[], meta: any): Promise<void>;
  querySimilar(text: string, topK: number): Promise<CodeChunk[]>;
}
```

`querySimilar` 内部会先用 `EmbeddingClient` 对 text 做 embedding，再通过 `embedding <-> $1` 做向量相似度查询。[^13]

***

## 8. 阶段四：文档生成流水线

### 8.1 LLM Prompt 模板（示例）

`templates.ts` 中维护几个模板字符串/函数。

**项目概览（overview）模板示意：**

- 输入：
    - 语言/框架信息。
    - 顶层目录结构及模块名称列表。
    - 主要依赖（从 package.json / requirements.txt 解析）。
- 输出：
    - 1–2 页 Markdown，包含：
        - 项目描述；
        - 整体架构；
        - 模块划分；
        - 关键技术与外部依赖。

**模块文档模板示意：**

- 输入：
    - 模块内的符号列表（主要类/服务/控制器）；
    - 该模块与其他模块的关系；
    - 若干典型调用链。
- 输出：
    - 模块职责；
    - 对外提供的接口；
    - 内部关键类/函数列表；
    - 依赖关系说明；
    - 示例调用链。

**API 文档模板示意：**

- 输入：
    - 从 controller/router 中解析出的 HTTP 方法、URL、参数与响应类型。
- 输出：
    - 接口说明；
    - Request/Response 字段解释；
    - 示例请求/响应；
    - 常见错误码。


### 8.2 文档生成流程

对每种文档类型，统一采用以下模式：

1. 通过索引/向量库准备上下文：
    - overview：取顶层结构、主入口、主要模块的关键信息。
    - module：取该模块的所有符号 + 关系图信息。
    - api：取具体接口定义。
2. 用 prompt 模板构造 `systemPrompt + userPrompt`。
3. 调用 `LLMClient.chat()`，拿到生成结果。
4. 写入目标 Markdown 文件（路径由配置控制）。

***

## 9. 阶段五：增量更新与 Git 集成

### 9.1 Git diff

`gitDiff.ts` 提供：

```ts
export interface FileChange {
  status: 'A' | 'M' | 'D';
  path: string;
}

export async function getChanges(fromRev: string, toRev: string): Promise<FileChange[]> {
  // 调用 git diff --name-status fromRev..toRev
}
```

`state.ts` 记录与读取上一次成功生成时的 `commit`：

```ts
export interface RepoState {
  lastProcessedCommit: string;
  // 其他可能信息
}
```


### 9.2 影响分析

`impact.ts`：

- 输入：变更文件列表 + 符号/关系索引。
- 输出：受影响模块列表 + 受影响文档列表。

策略（MVP）：

- 对每个变更文件：
    - 找出其所属模块。
    - 模块即视为受影响。
- 对于 API：
    - 若文件中存在 controller/router 定义，则对应 API 文档受影响。

后续可改为图扩散：变更 symbol → 依赖图拓展 N 跳 → 映射到文档。

### 9.3 与 Git 工作流集成

- 本地：用户可在提交前手工执行 `repowiki update`。
- CI：添加 step：
    - 拉取代码后执行 `repowiki update`。
    - 若有变更，提交更新后的文档到同一个 PR 或单独自动 PR。

***

## 10. 阶段六：使用方式示例

```bash
# 1. 初始化（首次）
repowiki init

# 2. 日常开发后做增量更新
repowiki update

# 3. 强制重生成所有文档（调试/大改后）
repowiki gen --all

# 4. 只重生成某个模块的文档
repowiki gen --module user
```


***

## 11. 阶段七：演进路线与风险控制

### 11.1 MVP 路线建议

- v0：
    - 只支持 TypeScript 项目。
    - 实现 `init` 和 `gen --all`：
        - 简单 AST（文件级 + 函数级）。
        - 概览 + 模块文档（API 文档/向量库先不做）。
- v1：
    - 加入 Python 支持。
    - 添加向量库，改写 generator 使用 RAG。
- v2：
    - 实现 Git diff + 增量更新。
    - API 文档生成。
- v3：
    - 引入更完整的知识图谱与调用图。
    - 增强 CLI（doctor / chat 等）。


### 11.2 主要风险点与缓解

- AST/解析复杂度：
    - 限制语言种类和语法特性，优先支持你常用的项目类型。
- LLM 成本：
    - 通过过滤文件、分模块生成、缓存结果等手段控制 token 消耗。
- 增量更新复杂度：
    - 先实现「按模块重生成」的简单版，再逐步细化影响分析。

***

## 12. CLI 交互设计

### 12.1 设计目标

- 面向开发者：命令结构直观，遵循现代 CLI 设计指南。[^18][^19]
- 适合脚本与 CI：稳定退出码 + 可选 JSON 输出。
- 默认行为实用：单条命令完成「初始化」或「增量更新」。

***

### 12.2 全局约定

#### 12.2.1 命令结构

- 基本形式：`repowiki <command> [options]`。
- 子命令：`init`、`scan`、`gen`、`update`、`doctor`。


#### 12.2.2 全局参数

- `-h, --help`：显示帮助并退出。
- `-v, --verbose`：增加日志详细程度，可叠加 `-vv`。
- `-q, --quiet`：只输出警告和错误。
- `--config <path>`：指定配置文件路径，默认 `.repowiki.yml`。
- `--cwd <path>`：工作目录，默认当前目录。
- `--json`：输出 JSON 形式的结果（适用的命令）。

***

### 12.3 命令一览

| 命令 | 作用简述 |
| :-- | :-- |
| `init` | 初始化当前仓库、生成配置、首轮全量生成 |
| `scan` | 仅扫描并构建索引，不生成文档 |
| `gen` | 基于索引生成/重生成文档 |
| `update` | 基于 Git diff 做增量索引 + 文档更新 |
| `doctor` | 自检配置、索引、LLM 等健康状态 |


***

### 12.4 各命令详细设计

#### 12.4.1 `repowiki init`

```bash
repowiki init [options]
```

**选项**

- `--force`：存在配置或文档时仍强制覆盖。
- `--output-dir <dir>`：指定文档输出目录。
- `--no-docs`：只构建索引，不生成文档。

**退出码**

- `0`：成功。
- `2`：命令行使用错误。
- `66`：配置错误。
- `70`：内部错误。

***

#### 12.4.2 `repowiki scan`

```bash
repowiki scan [options]
```

**选项**

- `--full`：无视缓存，全量重扫。
- `--languages <list>`：覆盖配置文件中的语言列表。
- `--dry-run`：只展示将扫描文件的统计信息。

**退出码**

- `0`：成功。
- `1`：一般性错误。
- `65`：索引/数据格式错误。
- `70`：内部错误。

***

#### 12.4.3 `repowiki gen`

```bash
repowiki gen [options]
```

**选项**

- `--all`：重生成全部文档。
- `--module <name>`：只生成指定模块相关文档。
- `--type <type>`：`overview|module|api|config`。
- `--output-dir <dir>`：覆盖输出目录。
- `--dry-run`：只展示将被生成/覆盖的文件列表。

**退出码**

- `0`：成功。
- `69`：LLM/外部服务不可用。
- `73`：无法创建输出文件/目录。
- 其他：`1`、`2`、`70`。

***

#### 12.4.4 `repowiki update`

```bash
repowiki update [options]
```

**选项**

- `--from <rev>`：起始 Git 版本（默认为上次成功 commit）。
- `--to <rev>`：结束版本，默认 `HEAD`。
- `--no-docs`：只更新索引。
- `--dry-run`：只输出变更和将更新的文档，不执行。

**退出码**

- `0`：成功。
- `1`：Git 调用错误。
- `70`：内部错误。

***

#### 12.4.5 `repowiki doctor`

```bash
repowiki doctor [options]
```

**选项**

- `--json`：以 JSON 输出诊断结果。
- `--fix`：尝试自动修复（如重建 state/索引）。

**退出码**

- `0`：所有检查通过。
- `78`：配置问题。
- `69`：外部服务不可用。
- `70`：内部错误。

***

### 12.5 退出码规范

统一约定：[^20][^21]

- `0`：成功。
- `1`：通用错误。
- `2`：命令行使用错误。
- `65`：数据/索引格式错误。
- `66`：输入/配置不可读。
- `69`：外部服务不可用（LLM、向量库）。
- `70`：内部软件错误。
- `73`：无法创建输出文件/目录。
- `78`：配置错误。

***

### 12.6 日志规范

遵循 12-factor：应用只写 stdout/stderr，不管理日志文件。[^15][^16][^14]

- `stdout`：INFO、DEBUG 等正常输出。
- `stderr`：WARN、ERROR。

级别控制：

- 默认：INFO 及以上。
- `-v`：包括 DEBUG。
- `-vv`：更详细的 DEBUG。
- `-q`：只 WARN/ERROR。

格式：

```text
[2026-05-07T16:00:00.123Z] INFO  scan  Scanned 384 files (ts: 320, py: 64)
```

或在 `--log-json` 下输出 JSON。

***

### 12.7 交互 UX 细节

参考现代 CLI 指南：[^19][^22][^18]

- 任意错误都给出清晰的提示和建议用法。
- 覆盖性操作必须使用 `--force`。
- 支持 `--dry-run` 预览。
- 明确的 deprecation 策略，避免 breaking changes。

***
