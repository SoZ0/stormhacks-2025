// Browser-safe stand-ins used to satisfy imports from PostCSS/Tailwind while running in the client.
export class SourceMapConsumer {
  constructor(_map: unknown) {
    throw new Error('SourceMapConsumer is not available in the browser');
  }
  static async initialize() {
    throw new Error('SourceMapConsumer.initialize is not available in the browser');
  }
  destroy() {}
  static async with() {
    throw new Error('SourceMapConsumer.with is not available in the browser');
  }
}

export class SourceMapGenerator {
  addMapping(): void {}
  setSourceContent(): void {}
  toString(): string {
    return '';
  }
  static fromSourceMap(): SourceMapGenerator {
    return new SourceMapGenerator();
  }
}

export class SourceNode {
  constructor(..._args: unknown[]) {
    throw new Error('SourceNode is not available in the browser');
  }
}

export default {
  SourceMapConsumer,
  SourceMapGenerator,
  SourceNode
};
