import type { ToolExecutor, ToolFunctionDefinition } from '$lib/shared/tools/types';
import { SFU_OUTLINES_TOOLS, executeSfuOutlinesTool } from '$lib/shared/tools/sfuOutlines';
import { WEB_BROWSING_TOOLS, executeWebBrowsingTool } from '$lib/shared/tools/webBrowsing';

const definitionList: ToolFunctionDefinition[] = [];
const executorMap = new Map<string, ToolExecutor>();

const register = (definitions: ToolFunctionDefinition[], executor: ToolExecutor) => {
  for (const definition of definitions) {
    const name = definition.function.name?.trim();
    if (!name) continue;
    if (executorMap.has(name)) {
      throw new Error(`Duplicate tool registration detected for ${name}`);
    }
    executorMap.set(name, executor);
    definitionList.push(definition);
  }
};

register(SFU_OUTLINES_TOOLS, executeSfuOutlinesTool);
register(WEB_BROWSING_TOOLS, executeWebBrowsingTool);

export const REGISTERED_TOOLS: ToolFunctionDefinition[] = [...definitionList];

export const executeRegisteredTool: ToolExecutor = async (name, rawArgs) => {
  const normalized = name.trim();
  const executor = executorMap.get(normalized);
  if (!executor) {
    throw new Error(`Unsupported tool: ${normalized}`);
  }
  return executor(normalized, rawArgs);
};
