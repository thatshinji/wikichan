# WikiChan

**自动项目文档生成系统** — 基于静态代码分析 + LLM，一键生成高质量项目文档。

## 简介

WikiChan 是一个 TypeScript CLI 工具，能够自动扫描项目源码，通过 tree-sitter 进行 AST 解析提取代码符号和关系，结合 LLM（大语言模型）智能生成项目文档。支持增量更新，只重新生成受变更影响的文档，大幅降低文档维护成本。

## 核心特性

- **多语言支持** — TypeScript、JavaScript、Python 源码解析
- **智能文档生成** — 项目总览、模块文档、API 文档、配置文档，支持 Mermaid 图表和源码引用
- **多语言输出** — 支持中文、英文、西班牙文、日文等多语言文档生成
- **增量更新** — 基于 git diff 分析变更影响，只更新受影响的文档
- **RAG 增强** — 可选的向量检索增强生成，提供更精准的代码上下文
- **多 LLM 支持** — OpenAI、Claude、DeepSeek 三大提供商，内置指数退避重试
- **知识图谱** — 自动构建符号依赖关系图，支持传递依赖分析
- **多存储后端** — SQLite（同步）和 PostgreSQL + pgvector（异步）
- **安全加固** — 输出路径遍历防护、git ref 注入校验、配置严格验证
- **大仓库优化** — 文件分批处理（200 文件/批）、按修改时间排序截断

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Layer                          │
│         init │ scan │ gen │ update │ doctor             │
├─────────────────────────────────────────────────────────┤
│                    Core Pipeline                        │
│  Scanner → Parser → Indexer → Generator → Output        │
├──────────┬──────────┬───────────┬───────────────────────┤
│ tree-    │ SQLite   │ LLM       │ RAG Pipeline          │
│ sitter   │ / Pg     │ Providers │ (chunk → embed →      │
│ Parsers  │ Storage  │           │  vector store → query)│
└──────────┴──────────┴───────────┴───────────────────────┘
```

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/thatshinji/wikichan.git
cd wikichan

# 安装依赖
npm install

# 构建项目
npm run build
```

### 初始化项目

```bash
# 在目标项目目录下运行
npx wikichan init

# 跳过文档生成，只创建配置文件
npx wikichan init --skip-docs

# 覆盖已有配置
npx wikichan init --force
```

初始化将：
1. 生成 `.wikichan.yml` 配置文件
2. 创建 `.wikichan/` 工作目录
3. 扫描项目源码并构建索引
4. 调用 LLM 生成文档（除非 `--skip-docs`）

### 扫描索引

```bash
# 增量扫描（跳过未变更文件）
npx wikichan scan

# 全量重新扫描
npx wikichan scan --full

# 预览模式
npx wikichan scan --dry-run

# 指定语言
npx wikichan scan --languages ts,py
```

### 生成文档

```bash
# 生成所有文档
npx wikichan gen

# 只生成项目总览
npx wikichan gen --type overview

# 只生成模块文档
npx wikichan gen --type module

# 只生成 API 文档
npx wikichan gen --type api

# 只生成配置文档
npx wikichan gen --type config

# 生成指定模块
npx wikichan gen --type module --module parser

# 预览模式
npx wikichan gen --dry-run
```

### 增量更新

```bash
# 基于上次状态自动检测变更并更新
npx wikichan update

# 指定 git 范围
npx wikichan update --from abc1234 --to HEAD

# 只更新索引，不重新生成文档
npx wikichan update --skip-docs
```

### 健康检查

```bash
# 检查配置、数据库、LLM、Git 状态
npx wikichan doctor

# JSON 格式输出
npx wikichan doctor --json

# 自动修复问题
npx wikichan doctor --fix
```

## 配置文件

项目根目录下的 `.wikichan.yml`：

```yaml
# 支持的编程语言
languages:
  - ts
  - js
  - py

# 生成文档的语言（zh/en/es/ja，默认 zh）
language: zh

# 扫描包含的文件模式
include:
  - "src/**"

# 排除的文件模式
exclude:
  - "node_modules/**"
  - "dist/**"
  - ".venv/**"
  - "tests/**"

# 文件数量限制（可选）
maxFiles: 5000

# 输出配置
output:
  root: "docs/wiki"
  structure:
    overview: "overview.md"
    modulesDir: "modules"
    apisDir: "apis"
    config: "config.md"

# 存储后端
storage:
  type: sqlite           # sqlite 或 postgres
  sqlite:
    file: ".wikichan/index.db"
  postgres:
    url: "postgresql://localhost:5432/wikichan"

# 向量检索（RAG）
vector:
  enabled: false
  type: sqlite            # sqlite 或 pgvector

# 嵌入模型配置
embedding:
  provider: openai
  model: text-embedding-3-small
  apiKeyEnv: WIKICHAN_EMBEDDING_API_KEY

# LLM 配置
llm:
  provider: openai        # openai / claude / deepseek
  model: gpt-4.1
  apiBase: ""             # 自定义 API 地址（可选，用于 Minimax 等兼容 API）
  apiKeyEnv: WIKICHAN_LLM_API_KEY
  maxTokens: 4096
  temperature: 0.2
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `WIKICHAN_LLM_API_KEY` | LLM API 密钥 | — |
| `WIKICHAN_EMBEDDING_API_KEY` | 嵌入模型 API 密钥 | — |

### LLM 提供商示例

```yaml
# OpenAI
llm:
  provider: openai
  model: gpt-4.1
  apiKeyEnv: WIKICHAN_LLM_API_KEY

# Claude
llm:
  provider: claude
  model: claude-sonnet-4-20250514
  apiKeyEnv: WIKICHAN_LLM_API_KEY

# DeepSeek
llm:
  provider: deepseek
  model: deepseek-chat
  apiKeyEnv: WIKICHAN_LLM_API_KEY

# Minimax（Claude 兼容 API）
llm:
  provider: claude
  model: MiniMax-M2.7-highspeed
  apiBase: https://api.minimaxi.com/anthropic
  apiKeyEnv: WIKICHAN_LLM_API_KEY
```

## 生成的文档结构

```
docs/wiki/
├── overview.md          # 项目总览（架构、模块、技术栈）
├── modules/
│   ├── core.md          # 各模块详细文档
│   ├── cli.md
│   └── ...
├── apis/
│   └── api.md           # API 端点文档
└── config.md            # 配置说明文档
```

### 文档风格

生成的文档采用结构化风格，包含：

- **引用块** — `<cite>` 标签列出所有引用的源文件
- **目录导航** — 自动生成带锚点的目录
- **Mermaid 图表** — 架构图、流程图、序列图、状态图、依赖图
- **源码引用** — 图表和章节后标注来源文件和行号
- **标准章节** — 简介→项目结构→核心组件→架构总览→详细分析→依赖分析→性能考虑→故障排查→结论→附录

## CLI 全局选项

| 选项 | 说明 |
|------|------|
| `-v, --verbose` | 启用 DEBUG 级别日志 |
| `-vv` | 启用 TRACE 级别日志（更详细） |
| `-q, --quiet` | 只显示警告和错误 |
| `--log-json` | JSON 格式日志输出 |
| `--config <path>` | 指定配置文件路径 |
| `--cwd <path>` | 指定工作目录 |

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 69 | 服务不可用（LLM 连接失败） |
| 70 | 内部错误 |
| 73 | 输出错误 |
| 78 | 配置错误 |

## 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript (ESM) |
| CLI 框架 | Commander.js |
| AST 解析 | tree-sitter（TypeScript / JavaScript / Python） |
| 数据库 | better-sqlite3 / PostgreSQL + pgvector |
| LLM SDK | OpenAI SDK / Anthropic SDK |
| 嵌入模型 | OpenAI Embeddings API |
| 配置 | js-yaml |
| 文件扫描 | glob |

## API 框架检测

WikiChan 自动识别以下框架的路由定义：

| 框架 | 检测模式 |
|------|---------|
| Express | `app.get('/path', handler)` / `router.post(...)` |
| Fastify | `fastify.get('/path', handler)` |
| NestJS | `@Get('/path')` / `@Post(...)` 装饰器 |
| Flask | `@app.route('/path', methods=[...])` |
| 通用函数命名 | `getUserById` → `GET /user-by-id` |

## 项目结构

```
src/
├── cli/
│   ├── index.ts                 # CLI 入口，命令注册
│   └── commands/
│       ├── init.ts              # 初始化命令
│       ├── scan.ts              # 扫描命令
│       ├── gen.ts               # 文档生成命令
│       ├── update.ts            # 增量更新命令
│       └── doctor.ts            # 健康检查命令
├── core/
│   ├── config.ts                # 配置加载与验证
│   ├── errors.ts                # 自定义错误类
│   ├── logger.ts                # 日志系统（12-factor）
│   ├── scanner.ts               # 文件扫描器
│   ├── state.ts                 # 状态持久化
│   ├── utils.ts                 # 工具函数
│   ├── parser/
│   │   ├── index.ts             # 解析器接口与分发
│   │   ├── tsParser.ts          # TypeScript/JavaScript 解析器
│   │   └── pyParser.ts          # Python 解析器
│   ├── indexer/
│   │   ├── storage.ts           # SQLite 存储
│   │   ├── postgresStorage.ts   # PostgreSQL 存储
│   │   ├── storageFactory.ts    # 存储工厂
│   │   ├── symbols.ts           # 符号索引构建
│   │   └── graph.ts             # 知识图谱与依赖图
│   ├── llm/
│   │   ├── client.ts            # LLM 客户端接口
│   │   └── providers/
│   │       ├── openai.ts        # OpenAI 提供商
│   │       ├── claude.ts        # Claude 提供商
│   │       └── deepseek.ts      # DeepSeek 提供商
│   ├── generator/
│   │   ├── templates.ts         # Prompt 模板
│   │   ├── overview.ts          # 项目总览生成
│   │   ├── moduleDoc.ts         # 模块文档生成
│   │   ├── apiDoc.ts            # API 文档生成
│   │   └── configDoc.ts         # 配置文档生成
│   ├── incremental/
│   │   ├── gitDiff.ts           # Git diff 解析
│   │   └── impact.ts            # 变更影响分析
│   └── rag/
│       ├── chunker.ts           # 代码分块
│       ├── embedder.ts          # 嵌入向量生成
│       ├── vectorStore.ts       # 向量存储
│       └── pipeline.ts          # RAG 管道集成
```

## 工作流程

### 全量流程（init）

```
项目源码 → Scanner（glob 扫描）
         → Parser（tree-sitter AST 解析）
         → Indexer（符号/关系存储到 SQLite）
         → LLM Generator（调用 LLM 生成文档）
         → Markdown 输出
```

### 增量流程（update）

```
git diff → 变更文件列表（ref 校验防注入）
         → Impact Analyzer（影响分析 + BFS 传递依赖）
         → 重新扫描受影响文件
         → 更新索引
         → 只重新生成受影响的模块文档
```

### RAG 增强流程（可选）

```
源码 → Chunker（按符号分块）
     → Embedder（生成嵌入向量）
     → Vector Store（存储向量）
     → Generator 查询相关上下文
     → 注入 LLM Prompt 生成更精准的文档
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev -- scan --dry-run

# 构建
npm run build

# 类型检查
npm run lint
```

## License

MIT
