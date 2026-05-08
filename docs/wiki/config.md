<cite>

**参考配置文件**

- `.env`
- `package.json`
- `tsconfig.json`

</cite>

# WikiChan 配置文档

本文档详细描述了 WikiChan 项目的所有配置项，包括环境变量、NPM 脚本以及 TypeScript 编译器选项。

---

## 目录

1. [环境变量](#环境变量)
   - [WIKICHAN_LLM_API_KEY](#wikichan_llm_api_key)
2. [NPM 脚本](#npm-脚本)
   - [build](#build)
   - [prepublishOnly](#prepublishonly)
   - [dev](#dev)
   - [start](#start)
   - [lint](#lint)
3. [TypeScript 编译器选项](#typescript-编译器选项)
   - [target](#target)
   - [module](#module)
   - [moduleResolution](#moduleresolution)
   - [outDir](#outdir)
   - [rootDir](#rootdir)
   - [strict](#strict)
   - [esModuleInterop](#esmoduleinterop)
   - [resolveJsonModule](#resolvejsonmodule)
   - [declaration](#declaration)
   - [sourceMap](#sourcemap)
   - [skipLibCheck](#skiplibcheck)
   - [forceConsistentCasingInFileNames](#forceconsistentcasinginfilenames)
4. [配置示例](#配置示例)
   - [开发环境配置示例](#开发环境配置示例)
   - [生产环境配置示例](#生产环境配置示例)

---

## 环境变量

### WIKICHAN_LLM_API_KEY

**配置名称**：`WIKICHAN_LLM_API_KEY`

**类型**：字符串 (string)

**描述**：用于连接大型语言模型 (LLM) API 的认证密钥。该密钥用于验证用户身份并授权访问 WikiChan 的 LLM 功能。在使用 Claude、OpenAI 或其他 LLM 服务时需要此密钥。

**默认值**：`sk-cp-vdCMbXXQ-NTWn8NF_EE4rFmFpsp34_2HNyhbn7JTg92P_Z4RCN4zrENR9sTKDF6gq-aLlEf1dnPhrI2KXzVJhobgTHwblAEzLBvLbNj_vR6LpivKEvEHPbk`

**是否必需**：是

**配置文件位置**：`.env`

**示例**：

```bash
# .env 文件
WIKICHAN_LLM_API_KEY=sk-cp-vdCMbXXQ-NTWn8NF_EE4rFmFpsp34_2HNyhbn7JTg92P_Z4RCN4zrENR9sTKDF6gq-aLlEf1dnPhrI2KXzVJhobgTHwblAEzLBvLbNj_vR6LpivKEvEHPbk
```

> **安全提示**：请勿将 API 密钥直接提交到版本控制系统。建议使用环境变量管理工具（如 `dotenv`）或 CI/CD 平台的安全存储功能来管理敏感配置。

---

## NPM 脚本

### build

**脚本名称**：`build`

**类型**：构建脚本

**描述**：TypeScript 编译脚本，用于将 `src` 目录中的 TypeScript 源代码编译为 JavaScript 代码并输出到 `dist` 目录。此脚本是项目构建的核心步骤，在发布或部署前必须执行。

**执行命令**：`tsc`

**是否必需**：是

**配置文件位置**：`package.json`

**示例**：

```bash
# 在终端执行
npm run build

# 输出示例
$ tsc
# 编译成功，无错误输出
```

---

### prepublishOnly

**脚本名称**：`prepublishOnly`

**类型**：生命周期钩子脚本

**描述**：在 `npm publish` 发布包之前自动执行的脚本。该脚本确保在发布前完成代码编译，确保分发的包包含最新的编译产物。此脚本是 NPM 生命周期钩子的一部分，在包发布前自动触发。

**执行命令**：`npm run build`

**是否必需**：是

**配置文件位置**：`package.json`

**示例**：

```bash
# 执行发布前准备
npm run prepublishOnly

# 将自动执行 build 脚本
$ npm run build
> tsc
```

---

### dev

**脚本名称**：`dev`

**类型**：开发脚本

**描述**：开发模式启动脚本，使用 `tsx` 运行时直接执行 TypeScript 源代码文件。此脚本用于开发阶段的实时调试和测试，无需预先编译即可运行代码。`tsx` 提供了即时编译和执行功能，支持 TypeScript 的类型检查和 ES 模块语法。

**执行命令**：`tsx src/cli/index.ts`

**是否必需**：否（仅开发环境使用）

**配置文件位置**：`package.json`

**示例**：

```bash
# 启动开发模式
npm run dev

# 输出示例
$ tsx src/cli/index.ts
WikiChan CLI 已启动...
```

---

### start

**脚本名称**：`start`

**类型**：运行时脚本

**描述**：生产环境启动脚本，用于执行已编译的 JavaScript 代码。此脚本运行 `dist/cli/index.js` 文件，这是经过 TypeScript 编译后的产物，适用于生产环境部署和执行。

**执行命令**：`node dist/cli/index.js`

**是否必需**：否（仅生产环境使用）

**配置文件位置**：`package.json`

**示例**：

```bash
# 确保代码已编译
npm run build

# 启动生产版本
npm start

# 输出示例
$ node dist/cli/index.js
WikiChan CLI 已启动...
```

---

### lint

**脚本名称**：`lint`

**类型**：代码检查脚本

**描述**：TypeScript 类型检查脚本，使用 `tsc --noEmit` 对代码进行类型检查而不生成任何输出文件。此脚本用于在提交代码前验证类型安全性，确保代码符合项目的类型规范，但不执行实际的编译操作。

**执行命令**：`tsc --noEmit`

**是否必需**：否（建议使用）

**配置文件位置**：`package.json`

**示例**：

```bash
# 执行类型检查
npm run lint

# 成功时无输出
# 存在类型错误时会显示详细错误信息
```

---

## TypeScript 编译器选项

### target

**配置名称**：`target`

**类型**：字符串 (string)

**描述**：指定编译生成的 JavaScript 代码的目标 ECMAScript 版本。`ES2022` 表示生成的代码兼容 ECMAScript 2022 规范，支持最新的 JavaScript 特性如顶级 await、私有字段等。

**默认值**：`"ES2022"`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "target": "ES2022"
  }
}
```

---

### module

**配置名称**：`module`

**类型**：字符串 (string)

**描述**：指定生成模块的代码格式。`NodeNext` 模式支持 Node.js 的 ESM (ES Modules) 和 CJS (CommonJS) 混合使用，启用 `.js` 文件扩展名和 `package.json` 的 `exports` 字段解析。

**默认值**：`"NodeNext"`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "module": "NodeNext"
  }
}
```

---

### moduleResolution

**配置名称**：`moduleResolution`

**类型**：字符串 (string)

**描述**：指定模块解析策略。`NodeNext` 与 `module: NodeNext` 配合使用，采用与 Node.js 相同的模块解析算法，支持 `exports` 字段和 ESM 导入语法。

**默认值**：`"NodeNext"`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "moduleResolution": "NodeNext"
  }
}
```

---

### outDir

**配置名称**：`outDir`

**类型**：字符串 (string)

**描述**：指定编译输出目录的路径。所有生成的 JavaScript 文件、声明文件和源映射文件都将输出到此目录，保持与源文件相同的目录结构。

**默认值**：`"./dist"`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "outDir": "./dist"
  }
}
```

---

### rootDir

**配置名称**：`rootDir`

**类型**：字符串 (string)

**描述**：指定源代码根目录的路径。TypeScript 编译器将以此目录为基准计算输出文件的相对路径结构。

**默认值**：`"./src"`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "rootDir": "./src"
  }
}
```

---

### strict

**配置名称**：`strict`

**类型**：布尔值 (boolean)

**描述**：启用所有严格类型检查选项的集合，包括 `strictNullChecks`、`strictFunctionTypes`、`strictBindCallApply`、`strictPropertyInitialization`、`noImplicitAny`、`noImplicitThis`、`alwaysStrict`、`useUnknownInCatchVariables`。启用此选项后，TypeScript 将执行更严格的类型检查，帮助捕获潜在的运行时错误。

**默认值**：`true`

**是否必需**：否（强烈建议启用）

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

---

### esModuleInterop

**配置名称**：`esModuleInterop`

**类型**：布尔值 (boolean)

**描述**：启用 ES 模块与 CommonJS 模块之间的互操作性。启用后，TypeScript 编译器会自动处理默认导入与命名导入的转换，使 `import fs from 'fs'` 和 `const fs = require('fs')` 都能正常工作。

**默认值**：`true`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "esModuleInterop": true
  }
}
```

---

### resolveJsonModule

**配置名称**：`resolveJsonModule`

**类型**：布尔值 (boolean)

**描述**：允许从 `.json` 文件导入模块。启用后，可以在 TypeScript 代码中直接导入 JSON 文件作为模块使用，编译器会自动解析 JSON 文件的内容。

**默认值**：`true`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

---

### declaration

**配置名称**：`declaration`

**类型**：布尔值 (boolean)

**描述**：生成对应的 `.d.ts` 类型声明文件。这些声明文件为 TypeScript 项目提供类型信息，使得其他项目在依赖此库时能够获得完整的类型检查支持。

**默认值**：`true`

**是否必需**：否（库项目建议启用）

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "declaration": true
  }
}
```

---

### sourceMap

**配置名称**：`sourceMap`

**类型**：布尔值 (boolean)

**描述**：生成源映射文件（`.js.map` 和 `.d.ts.map`）。源映射文件建立了编译后的 JavaScript 代码与原始 TypeScript 源代码之间的映射关系，便于调试时能够在浏览器或 IDE 中直接查看和断点调试原始源代码。

**默认值**：`true`

**是否必需**：否（开发环境建议启用）

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "sourceMap": true
  }
}
```

---

### skipLibCheck

**配置名称**：`skipLibCheck`

**类型**：布尔值 (boolean)

**描述**：跳过声明文件（`.d.ts`）的类型检查。启用后，TypeScript 编译器将跳过对第三方库声明文件的类型检查，显著加快编译速度。此选项主要用于避免第三方库声明文件中的类型冲突问题。

**默认值**：`true`

**是否必需**：否

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

---

### forceConsistentCasingInFileNames

**配置名称**：`forceConsistentCasingInFileNames`

**类型**：布尔值 (boolean)

**描述**：强制要求导入文件时使用一致的大小写格式。启用后，如果文件系统中存在 `MyFile.ts`，但导入时使用 `myfile.ts`，TypeScript 将报告错误。这有助于避免跨平台（特别是 macOS 与 Windows 之间）开发时的文件名大小写不一致问题。

**默认值**：`true`

**是否必需**：否（强烈建议启用）

**配置文件位置**：`tsconfig.json`

**示例**：

```json
{
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## 配置示例

### 开发环境配置示例

在开发环境中，以下配置组合能够提供最佳的开发体验：

**`.env` 文件配置**

```bash
# 开发环境 API 密钥
WIKICHAN_LLM_API_KEY=sk-cp-vdCMbXXQ-NTWn8NF_EE4rFmFpsp34_2HNyhbn7JTg92P_Z4RCN4zrENR9sTKDF6gq-aLlEf1dnPhrI2KXzVJhobgTHwblAEzLBvLbNj_vR6LpivKEvEHPbk
```

**`tsconfig.json` 配置**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**开发工作流程**

```bash
# 启动开发模式
npm run dev

# 执行类型检查
npm run lint

# 完成后构建生产版本
npm run build
```

---

### 生产环境配置示例

在生产环境中部署时，请确保执行完整的构建流程：

**`package.json` 脚本配置**

```json
{
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build",
    "dev": "tsx src/cli/index.ts",
    "start": "node dist/cli/index.js",
    "lint": "tsc --noEmit"
  }
}
```

**生产部署步骤**

```bash
# 1. 安装依赖
npm install

# 2. 执行类型检查
npm run lint

# 3. 构建项目
npm run build

# 4. 启动生产服务
npm start
```

---

## 快速参考表

| 配置项 | 类型 | 默认值 | 是否必需 |
|--------|------|--------|----------|
| `WIKICHAN_LLM_API_KEY` | string | (见上文) | 是 |
| `target` | string | `ES2022` | 否 |
| `module` | string | `NodeNext` | 否 |
| `moduleResolution` | string | `NodeNext` | 否 |
| `outDir` | string | `./dist` | 否 |
| `rootDir` | string | `./src` | 否 |
| `strict` | boolean | `true` | 否 |
| `esModuleInterop` | boolean | `true` | 否 |
| `resolveJsonModule` | boolean | `true` | 否 |
| `declaration` | boolean | `true` | 否 |
| `sourceMap` | boolean | `true` | 否 |
| `skipLibCheck` | boolean | `true` | 否 |
| `forceConsistentCasingInFileNames` | boolean | `true` | 否 |