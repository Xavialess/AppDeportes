const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.unstable_enableSymlinks = true;

// Fallback: redirect any unresolved module to the monorepo root node_modules.
// Required for pnpm workspaces where transitive deps live in the virtual store.
config.resolver.extraNodeModules = new Proxy(
  {},
  { get: (_, name) => path.join(monorepoRoot, 'node_modules', String(name)) },
);

module.exports = config;
