module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'header'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  rules: {
    // Special ESLint rules or overrides go here.
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-namespace': 'off',
    'header/header': [2, 'HEADER.txt']
  },
};
