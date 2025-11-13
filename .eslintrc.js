module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2020,
    },
    plugins: [
        'mocha',
        '@typescript-eslint',
        'prettier'
    ],
    env: {
        node: true,
        mocha: true,
        es2020: true,
    },
    extends: [
        'airbnb-base',
        'airbnb-typescript/base',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
    ],
    rules: {
        'prettier/prettier': ['error'],
        'mocha/no-exclusive-tests': 'error',
        'max-len': ['error', {
            code: 140, comments: 200, ignoreStrings: true, ignoreTemplateLiterals: true,
        }],
        'no-unused-vars': [2, { varsIgnorePattern: 'export^' }],
        'no-return-assign': [0],
        'no-underscore-dangle': [0],
        'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
        'func-names': [0],
        'class-methods-use-this': [0],
        'no-bitwise': [0],
        'no-param-reassign': 'off',
        'no-console': [2, { allow: ['warn', 'error'] }],
        'import/prefer-default-export': [0],
        'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
        'import/no-extraneous-dependencies': 'off',
        'import/extensions': 'off',
        '@typescript-eslint/no-unused-vars': ['error'],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
    },
};