.DEFAULT_GOAL := dev

.PHONY: install dev build lint test coverage e2e

install:
	pnpm install --frozen-lockfile

dev:
	pnpm dev

build:
	pnpm build

lint:
	pnpm lint

test:
	pnpm test

coverage:
	pnpm test:coverage

e2e:
	pnpm e2e
