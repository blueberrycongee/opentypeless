# GitHub Repo Maturity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the opentypeless repository follow open-source best practices with CI, code formatting, dependency management, and improved documentation.

**Architecture:** Add GitHub Actions CI pipeline (lint + typecheck + test on macOS and Ubuntu), Dependabot for automated dependency updates, Prettier for code formatting, a root package.json as monorepo entry point, and improve existing community docs (README badges, SECURITY contact, CONTRIBUTING dev setup).

**Tech Stack:** GitHub Actions, Dependabot, Prettier, Node.js 24, npm workspaces

---

### Task 1: Add root package.json

**Files:**
- Create: `package.json`

**Step 1: Create root package.json**

```json
{
  "name": "opentypeless",
  "private": true,
  "description": "Desktop-first open source AI dictation layer.",
  "license": "MIT",
  "engines": {
    "node": ">=24"
  },
  "workspaces": [
    "apps/desktop"
  ],
  "scripts": {
    "lint": "npm run lint --workspace=apps/desktop",
    "typecheck": "npm run typecheck --workspace=apps/desktop",
    "test": "npm run test --workspace=apps/desktop",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add root package.json with workspace config"
```

---

### Task 2: Add .nvmrc

**Files:**
- Create: `.nvmrc`

**Step 1: Create .nvmrc**

```
24
```

**Step 2: Commit**

```bash
git add .nvmrc
git commit -m "chore: add .nvmrc to pin Node.js 24"
```

---

### Task 3: Add Prettier config

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`

**Step 1: Create .prettierrc**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

**Step 2: Create .prettierignore**

```
node_modules/
dist/
build/
out/
coverage/
.cache/
.webpack/
*.log
package-lock.json
```

**Step 3: Commit**

```bash
git add .prettierrc .prettierignore
git commit -m "chore: add Prettier config and ignore file"
```

---

### Task 4: Add CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  lint-and-test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-latest]
        node-version: [24]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
          cache-dependency-path: apps/desktop/package-lock.json

      - name: Install dependencies
        working-directory: apps/desktop
        run: npm ci

      - name: Lint
        working-directory: apps/desktop
        run: npm run lint

      - name: Typecheck
        working-directory: apps/desktop
        run: npm run typecheck

      - name: Test
        working-directory: apps/desktop
        run: npm run test

      - name: Format check
        run: npx prettier --check .
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, test, and format check workflow"
```

---

### Task 5: Add Dependabot config

**Files:**
- Create: `.github/dependabot.yml`

**Step 1: Create dependabot.yml**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /apps/desktop
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 10
    labels:
      - dependencies
    commit-message:
      prefix: "chore(deps):"

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    labels:
      - dependencies
    commit-message:
      prefix: "ci(deps):"
```

**Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add Dependabot config for npm and GitHub Actions"
```

---

### Task 6: Add Dependabot auto-merge workflow

**Files:**
- Create: `.github/workflows/dependabot-automerge.yml`

**Step 1: Create auto-merge workflow**

```yaml
name: Dependabot Auto-Merge

on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  automerge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - uses: dependabot/fetch-metadata@v2
        id: metadata
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge patch updates
        if: steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Step 2: Commit**

```bash
git add .github/workflows/dependabot-automerge.yml
git commit -m "ci: add Dependabot auto-merge for patch updates"
```

---

### Task 7: Add FUNDING.yml

**Files:**
- Create: `.github/FUNDING.yml`

**Step 1: Create FUNDING.yml**

```yaml
github: [blueberrycongee]
```

**Step 2: Commit**

```bash
git add .github/FUNDING.yml
git commit -m "chore: add GitHub Sponsors funding config"
```

---

### Task 8: Improve SECURITY.md

**Files:**
- Modify: `SECURITY.md`

**Step 1: Update SECURITY.md to use GitHub Private Vulnerability Reporting**

```markdown
# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public issue.

Use [GitHub Private Vulnerability Reporting](https://github.com/blueberrycongee/opentypeless/security/advisories/new) to report it securely. Include:

- a clear description of the issue
- impact and affected area
- reproduction steps if available
- suggested mitigation if known

We will acknowledge reports within 7 days and aim to provide a fix or mitigation plan within 30 days.

## Supported versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |
```

**Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: improve SECURITY.md with private reporting link"
```

---

### Task 9: Improve CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

**Step 1: Update CONTRIBUTING.md with dev setup instructions**

```markdown
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

| Command | Purpose |
|---------|---------|
| `npm run start` | Launch Electron dev build |
| `npm run test` | Run unit tests |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |

From the repo root:

| Command | Purpose |
|---------|---------|
| `npm run format` | Format all files with Prettier |
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
```

**Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: improve CONTRIBUTING.md with dev setup and commands"
```

---

### Task 10: Update README.md with badges and quickstart

**Files:**
- Modify: `README.md`

**Step 1: Add badges and quickstart section to README.md**

Add badges after the `# OpenTypeless` heading:

```markdown
# OpenTypeless

[![CI](https://github.com/blueberrycongee/opentypeless/actions/workflows/ci.yml/badge.svg)](https://github.com/blueberrycongee/opentypeless/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](.nvmrc)
```

Add a Quickstart section after "Current status":

```markdown
## Quickstart

```bash
git clone https://github.com/blueberrycongee/opentypeless.git
cd opentypeless/apps/desktop
npm install
npm run start
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full development setup.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add badges and quickstart to README"
```

---

### Task 11: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Append additional entries**

Add to end of `.gitignore`:

```
# OS
Thumbs.db
Desktop.ini

# Prettier
.prettierignore

# npm workspace
node_modules/
package-lock.json
!/apps/desktop/package-lock.json
```

Wait — the root `package-lock.json` should actually be tracked if we use npm workspaces. Skip the `package-lock.json` ignore. Just add:

```
# OS
Thumbs.db
Desktop.ini
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add Windows OS entries to .gitignore"
```

---
