const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.unstable_enableSymlinks = true;

// Fallback: redirect unresolved modules to the correct node_modules location.
// Prefer the workspace's own node_modules so that packages installed as direct
// dependencies (e.g. expo-image-picker) are found before Metro falls through to
// the monorepo root — where pnpm may not have hoisted them.
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => {
      const localPath = path.join(projectRoot, 'node_modules', String(name));
      if (fs.existsSync(localPath)) return localPath;
      return path.join(monorepoRoot, 'node_modules', String(name));
    },
  },
);

module.exports = config;
