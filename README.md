# GraphyoDrift

Monitor configuration drift in Microsoft Graph using Unified Configuration Tenant Management (UCTM) APIs.

## Overview

**GraphyoDrift** is a Svelte 5 + TypeScript PWA that captures Microsoft Graph configuration snapshots and detects changes over time. Track resource configuration drifts across your tenant with an intuitive Azure Portal–inspired interface.

## Features

- 📸 **Configuration Snapshots** – Capture up to 20,000 resources per month per tenant
- 🔍 **Drift Detection** – Monitor configuration changes across resources
- 📊 **AG Grid Dashboard** – View snapshots, drifts, and monitors in an interactive table
- 🔐 **Microsoft Graph Auth** – Secure sign-in via MSAL with `ConfigurationMonitoring.ReadWrite.All` scope
- 🚀 **PWA Support** – Install as an app; works offline with Workbox caching
- ☁️ **Cloudflare Workers** – Deployed via wrangler

## Quick Start

### Prerequisites
- Node.js 18+
- `pnpm` package manager
- `.env` file with `VITE_AAD_CLIENT_ID` (Azure app registration)

### Setup
```bash
pnpm install
pnpm dev       # Start dev server (http://localhost:5173)
pnpm build     # Production build
pnpm check     # TypeScript validation
```

### Deploy
```bash
pnpm build
wrangler deploy
```

## Architecture

- **Frontend**: Svelte 5, TypeScript, Vite + Rolldown
- **SDK**: Kiota-generated Microsoft Graph client (`/Generated/graphChangeSdk/`)
- **Auth**: msal.js
- **Data UI**: AG Grid
- **Hosting**: Cloudflare Workers

## API Limits

- **Monitors**: 30 per tenant; 800 resources/day quota
- **Drifts**: Retained indefinitely; fixed drifts deleted after 30 days
- **Snapshots**: 20,000 resources/month; 12 jobs visible; 7-day retention

## Development

See `/github/copilot-instructions.md` for detailed conventions, Svelte 5 patterns, and Microsoft Graph integration guidance.

### Name Etymology
A play on [Tokyo Drift](https://en.wikipedia.org/wiki/The_Fast_and_the_Furious:_Tokyo_Drift)