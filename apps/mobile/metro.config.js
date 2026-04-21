const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Preserve Expo's defaults and add the workspace root for monorepo resolution.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];

// Prefer local packages first, then fall back to the workspace root.
config.resolver.nodeModulesPaths = [
  ...new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ]),
];

// Allow Metro to traverse the workspace for shared packages and files.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
