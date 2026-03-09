# TypeScript Coding Standards

## ESLint Config
- Parser: @typescript-eslint/parser
- Extends: airbnb-base, airbnb-typescript, prettier
- Max line length: 140 (code), 200 (comments)
- Mocha testing environment
- no-console: error (allow warn, error)
- no-exclusive-tests: error (no .only in tests)

## Formatting (Prettier)
- Print width: 120
- Tab width: 4
- Use tabs: false
- Single quotes: true (TypeScript/JavaScript)
- Semicolons: true
- Arrow parens: always

## Hardhat / TypeChain
- TypeChain target: ethers-v6
- TypeChain output: typechain-types/
- TypeScript target: ES2020
- Module: commonjs
- Strict mode: enabled

## Testing
- Framework: Hardhat + Chai matchers
- Test runner: Mocha
- Coverage target: 100%
- Foundry tests are supplementary, not primary
- Production builds MUST use Hardhat, never Foundry

## Linting
```bash
npm run lint        # Check all TS files
npm run lint:fix    # Autofix
```
