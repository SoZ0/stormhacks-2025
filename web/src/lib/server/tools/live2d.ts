export type ToolFunctionDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

const parseArgs = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore; fallthrough
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
};

export const LIVE2D_TOOLS: ToolFunctionDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'live2d_react',
      description:
        'Trigger a Live2D avatar reaction by choosing an expression and/or a motion id. Use when the assistant should visibly react to the current message (e.g., happy, surprised, thinking).',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Expression name available on the current model.' },
          motionId: {
            type: 'string',
            description:
              'Motion identifier as "Group:Index" (for example, "Tap:0"). Must correspond to a motion available on the current model.'
          }
        }
      }
    }
  }
];

export const executeLive2DTool = async (name: string, rawArgs: unknown) => {
  if (name !== 'live2d_react') throw new Error(`Unsupported tool: ${name}`);
  const args = parseArgs(rawArgs);
  const expression = typeof args.expression === 'string' ? args.expression : undefined;
  const motionId = typeof args.motionId === 'string' ? args.motionId : undefined;
  return { source: 'live2d', tool: name, expression, motionId };
};

