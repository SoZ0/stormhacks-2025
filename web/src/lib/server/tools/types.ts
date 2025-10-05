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

export type ToolExecutor = (name: string, rawArgs: unknown) => Promise<unknown>;
