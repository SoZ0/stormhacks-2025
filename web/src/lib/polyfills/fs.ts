// Minimal browser stub for Node's fs module so dependencies can load without runtime errors.
const notSupported = (method: string) => {
  throw new Error(`fs.${method} is not available in the browser`);
};

export const existsSync = (_path: string): boolean => false;

export const readFileSync = (_path: string, _encoding?: string): never => notSupported('readFileSync');

export const statSync = (_path: string): never => notSupported('statSync');

export const promises = new Proxy({}, {
  get: () => async () => {
    throw new Error('fs.promises API is not available in the browser');
  }
});

const fs = {
  existsSync,
  readFileSync,
  statSync,
  promises
};

export default fs;
