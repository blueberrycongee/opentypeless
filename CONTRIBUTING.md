# Contributing

Thanks for contributing to OpenTypeless.

## Prerequisites

- [Node.js 24+](https://nodejs.org/) (see `.nvmrc`)
- npm 11+
- macOS (primary) or Linux

## Getting started

```bash
git clone https://github.com/blueberrycongee/opentypeless.git
cd opentypeless/apps/desktop
npm install
npm run start
```

## Development commands

From `apps/desktop/`:

| Command             | Purpose                      |
| ------------------- | ---------------------------- |
| `npm run start`     | Launch Electron dev build    |
| `npm run test`      | Run unit tests               |
| `npm run lint`      | Run ESLint                   |
| `npm run typecheck` | Run TypeScript type checking |

From the repo root:

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run format`       | Format all files with Prettier   |
| `npm run format:check` | Check formatting without writing |

## Before you start

- Read the project README
- Check open issues and discussions first
- Keep pull requests focused and small
- Explain the user problem, not only the code change

## Development expectations

- Prefer clear, maintainable solutions
- Avoid unrelated refactors
- Add or update docs when behavior changes
- Validate the smallest relevant behavior before claiming success

## Code style

This project uses [Prettier](https://prettier.io/) for formatting and [ESLint](https://eslint.org/) for linting. CI checks both automatically.

## Pull request checklist

- [ ] The change solves a real user-facing or developer-facing problem
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Docs were updated if needed
- [ ] The scope is focused
- [ ] Known limitations are called out clearly

## Communication

Be respectful, specific, and collaborative.
