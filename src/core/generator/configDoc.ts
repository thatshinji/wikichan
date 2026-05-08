import fs from 'node:fs';
import path from 'node:path';
import type { IndexStorage } from '../indexer/storage.js';
import type { WikichanConfig } from '../config.js';
import type { LLMClient } from '../llm/client.js';
import { getModules } from '../indexer/graph.js';
import { info } from '../logger.js';
import { buildLanguageInstruction } from './templates.js';

export interface ConfigInfo {
  name: string;
  type: string;
  description: string;
  defaultValue?: string;
  required?: boolean;
}

export async function generateConfigDocs(
  storage: IndexStorage,
  config: WikichanConfig,
  llm: LLMClient,
  cwd: string,
): Promise<void> {
  info('gen', 'Generating configuration documentation...');

  // Find configuration files and environment variables
  const configInfo = extractConfigInfo(cwd);

  if (configInfo.length === 0) {
    info('gen', 'No configuration found');
    return;
  }

  info('gen', `Found ${configInfo.length} configuration items`);

  // Generate configuration documentation
  const lang = config.language ?? 'zh';
  const langName = buildLanguageInstruction(lang);

  const systemPrompt = `You are a technical documentation expert. Generate a comprehensive, well-structured Markdown configuration document based on the provided configuration items.

Requirements:
- Write ALL content in ${langName}
- Start the document with a <cite> block listing all referenced configuration files
- Include a table of contents with anchor links
- Group configuration items by category (environment variables, config files, scripts, etc.)
- Each item includes: name, type, description, default value, whether required, examples
- Provide common configuration patterns and usage examples
- Output ONLY Markdown content, no preamble or explanations`;

  const configList = configInfo.map(c => {
    const defaultVal = c.defaultValue ? `\n  Default: ${c.defaultValue}` : '';
    const required = c.required ? '\n  Required: Yes' : '';
    return `- **${c.name}** (${c.type})\n  ${c.description}${defaultVal}${required}`;
  }).join('\n\n');

  const configFiles = [
    fs.existsSync(path.join(cwd, '.env')) ? '.env' : null,
    fs.existsSync(path.join(cwd, '.env.example')) ? '.env.example' : null,
    fs.existsSync(path.join(cwd, 'package.json')) ? 'package.json' : null,
    fs.existsSync(path.join(cwd, 'tsconfig.json')) ? 'tsconfig.json' : null,
  ].filter(Boolean);

  const userPrompt = `Generate configuration documentation in ${langName} for the following configuration items:

${configList}

## Configuration Files
${configFiles.map(f => `- ${f}`).join('\n')}

Generate the complete Markdown configuration document in ${langName}.`;

  const response = await llm.chat({
    systemPrompt,
    userPrompt,
  });

  // Write to output
  const outputPath = path.resolve(cwd, config.output.root, config.output.structure.config);
  if (!outputPath.startsWith(path.resolve(cwd))) {
    throw new Error(`Output path escapes project directory: ${outputPath}`);
  }
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, response.content, 'utf-8');

  info('gen', `Configuration documentation written to ${outputPath}`);
}

function extractConfigInfo(cwd: string): ConfigInfo[] {
  const configInfo: ConfigInfo[] = [];

  // Check for .env file
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envVars = parseEnvFile(envContent);
      configInfo.push(...envVars);
    } catch {
      // Ignore read errors
    }
  }

  // Check for .env.example
  const envExamplePath = path.join(cwd, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    try {
      const envContent = fs.readFileSync(envExamplePath, 'utf-8');
      const envVars = parseEnvFile(envContent);
      configInfo.push(...envVars);
    } catch {
      // Ignore read errors
    }
  }

  // Check for package.json scripts
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts) {
        for (const [name, script] of Object.entries(pkg.scripts)) {
          configInfo.push({
            name: `npm run ${name}`,
            type: 'script',
            description: `Run script: ${script}`,
          });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for tsconfig.json
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      if (tsconfig.compilerOptions) {
        for (const [key, value] of Object.entries(tsconfig.compilerOptions)) {
          configInfo.push({
            name: `compilerOptions.${key}`,
            type: typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'object',
            description: `TypeScript compiler option: ${key}`,
            defaultValue: JSON.stringify(value),
          });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for .eslintrc or eslint.config
  const eslintPaths = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js'];
  for (const eslintPath of eslintPaths) {
    const fullPath = path.join(cwd, eslintPath);
    if (fs.existsSync(fullPath)) {
      configInfo.push({
        name: 'ESLint Configuration',
        type: 'file',
        description: `ESLint configuration file: ${eslintPath}`,
      });
      break;
    }
  }

  // Check for Docker files
  const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'];
  for (const dockerFile of dockerFiles) {
    const fullPath = path.join(cwd, dockerFile);
    if (fs.existsSync(fullPath)) {
      configInfo.push({
        name: dockerFile,
        type: 'file',
        description: `Docker configuration file: ${dockerFile}`,
      });
    }
  }

  return configInfo;
}

function parseEnvFile(content: string): ConfigInfo[] {
  const vars: ConfigInfo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    // Parse VAR=value or VAR="value"
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const name = match[1];
      let value = match[2].trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Check if it's a placeholder
      const isPlaceholder = value === '' || value.startsWith('<') || value.startsWith('your_');

      vars.push({
        name,
        type: 'environment',
        description: `Environment variable: ${name}`,
        defaultValue: isPlaceholder ? undefined : value,
        required: isPlaceholder,
      });
    }
  }

  return vars;
}
