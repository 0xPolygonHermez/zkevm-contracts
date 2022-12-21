module.exports = {
    plugins: [
        'mocha',
    ],
    env: {
        node: true,
        mocha: true,
    },
    extends: 'airbnb-base',
    rules: {
        indent: ['error', 4],
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
        'multiline-comment-style': 'error',
        'import/no-extraneous-dependencies': 'off'
    },
};
