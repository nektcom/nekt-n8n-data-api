module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['tsconfig.json'],
    sourceType: 'module',
    extraFileExtensions: ['.json'],
  },
  ignorePatterns: ['.eslintrc.js', '**/*.js', '**/node_modules/**', '**/dist/**'],
  plugins: ['eslint-plugin-n8n-nodes-base'],
  extends: ['plugin:n8n-nodes-base/nodes'],
  rules: {
    'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'warn',
  },
};
