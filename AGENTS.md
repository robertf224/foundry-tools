# AGENTS instructions

## Development environment instructions

- Run `pnpm install --filter <project_name>` to add a project to your workspace so TypeScript, ESLint, and other tools can see it.
- Run `pnpm turbo watch build dev --filter <project_name>` to run a project in development mode with all its dependencies.

## Testing instructions

- Find the CI plan in the .github/workflows folder.
- Run `pnpm turbo run lint test --filter <project_name>` to run every check defined for that package.
- From the package root you can just call `pnpm turbo test`. The commit should pass all tests before you merge.
- Fix any test or type errors until the whole suite is green.
- After moving files or changing imports, run `pnpm build lint --filter <project_name>` to be sure ESLint and TypeScript rules still pass.
- Add or update tests for the code you change, even if nobody asked.

## PR instructions

- Title format: [<project_name>] <Title>
- Always run `pnpm turbo lint` and `pnpm turbo test` before committing.
