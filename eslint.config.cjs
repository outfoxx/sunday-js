const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettier = require('eslint-config-prettier/flat');
const globals = require('globals');
const fs = require('fs');
const path = require('path');

const headerText = fs
  .readFileSync(path.join(__dirname, 'HEADER.txt'), 'utf8')
  .trimEnd();

const headerRule = {
  meta: {
    type: 'layout',
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const sourceCode =
          context.sourceCode ?? (context.getSourceCode && context.getSourceCode());
        const text = sourceCode?.text ?? '';

        if (!text.startsWith(headerText)) {
          context.report({
            node,
            message: 'missing header',
          });
        }
      },
    };
  },
};

const relativeJsExtensionRule = {
  meta: {
    type: 'problem',
    schema: [],
  },
  create(context) {
    function check(node, source) {
      if (!source || typeof source.value !== 'string') {
        return;
      }

      const specifier = source.value;
      if (!specifier.startsWith('.')) {
        return;
      }
      if (specifier.endsWith('.js')) {
        return;
      }

      context.report({
        node: source,
        message: `Relative import/export "${specifier}" must include a .js extension`,
      });
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          check(node, node.source);
        }
      },
      ImportExpression(node) {
        if (node.source && node.source.type === 'Literal') {
          check(node, node.source);
        }
      },
    };
  },
};

module.exports = [
  {
    ignores: ['build/**', 'docs/**', 'reports/**', 'node_modules/**'],
  },
  js.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.build.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      header: {
        rules: {
          header: headerRule,
          'relative-js-extension': relativeJsExtensionRule,
        },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-constant-binary-expression': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'header/header': 'error',
      'header/relative-js-extension': 'error',
    },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      header: {
        rules: {
          header: headerRule,
        },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-constant-binary-expression': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'header/header': 'error',
    },
  },
];
