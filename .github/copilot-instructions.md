# Copilot Instructions for GraphyoDrift

## Project Overview
**GraphyoDrift** is a Svelte 5 + TypeScript PWA that monitors and detects changes in Microsoft Graph using Unified Configuration Tenant Management (uctm) APIs. It captures Graph snapshots and tracks configuration drifts.

## Architecture & Key Components

### Tech Stack
- **Frontend**: Svelte 5, TypeScript, Vite
- **Build Tool**: Vite with Rolldown backend (uses `npm:rolldown-vite`)
- **SDK**: Microsoft Kiota-generated GraphClient (`/Generated/graphChangeSdk/`) and msal.js for auth
- **PWA**: vite-plugin-pwa
- **Cloudflare Workers**: Hosting platform for the PWA. Use wrangler for deployment.
- **DataTable**: AG Grid for data presentation, snapshot content display, and drift reports

### Critical Structure
- **`/src`**: Svelte components and application logic
- **`/Generated`**: Auto-generated code (DO NOT manually edit)
  - `graphClient.ts`: Kiota-generated Graph SDK client
  - `uctm.schema.json`: A list of all available resource endpoints for Unified Configuration Tenant Management. Read this to understand what resources can be managed.
  - `graphBeta.openapi.yml`: OpenAPI spec used to generate the SDK.

# API limits
## Tenant monitoring
The following API limits apply to the configurationMonitor API:

* You can create up to 30 configurationMonitor objects per tenant.
* Each configurationMonitor runs at a fixed interval of six hours. A monitor cannot be configured to run at any other frequency.
* An administrator can monitor up to 800 configuration resources per day per tenant, across all monitors. Administrators decide how to use this quota—through a single monitor or multiple monitors. Example: If an admin includes 20 transport rules and 30 conditional access policies in a monitor's baseline, that monitor tracks 50 resources per cycle. Since the monitor runs every six hours (4 cycles/day), this results in 200 monitored resources per day. Additional monitors can be created until the daily 800‑resource limit is reached.
* When an administrator updates the baseline of an existing monitor, all previously generated monitoring results and detected drifts for that monitor are automatically deleted.

## Drifts
The following API limits apply to the configurationDrift API:

* All active drifts are retained and available for administrators to review at any time.
* Each fixed drift is deleted 30 days after it is resolved.

## Snapshot
The following API limits apply to the configurationSnapshotJob API:

* You can extract a maximum of 20000 resources per tenant per month. This is a cumulative limit across all snapshots.
* There is no maximum number of snapshots you can create per day or per month. You may generate as many snapshots as needed, as long as the total number of resources extracted stays within the 20,000-resource monthly quota for the tenant.
* A maximum of 12 snapshot jobs are visible to the administrator. If the administrator wants to create more snapshot jobs, they have to delete one or more of the existing jobs.
* A snapshot is retained for a maximum of seven days, after which it is automatically deleted.

### UI Style
- Attempt to mimic the look and feel of the Microsoft Azure Portal where possible.

### Build Commands (all use `pnpm`)
```
pnpm dev       # Start Vite dev server (HMR enabled)
pnpm build     # Production build
pnpm preview   # Preview production build locally
pnpm check     # TypeScript + Svelte type checking
```

## Svelte 5 Conventions & Patterns

### Runes & Reactivity (Svelte 5 Style)
- **State**: Use `$state` rune directly on variables (e.g., `let count = $state(0)`)
- **Props**: Use `$props()` in component scripts (e.g., `let { message } = $props()`)
- **Events**: Use `on:click`, `on:change` syntax (NOT `onclick`)
- **Stores**: External state uses `writable()` from `svelte/store` to persist across HMR

### Component Example Pattern
```svelte
<script lang="ts">
  let count = $state(0);
  const increment = () => { count += 1; }
</script>
<button on:click={increment}>count is {count}</button>
```

### Key Svelte 5 Files
- [src/Counter.svelte](../src/lib/Counter.svelte): Basic rune + event pattern
- [src/App.svelte](../src/App.svelte): Main app layout with component composition

## Microsoft Graph & Kiota SDK Integration

### SDK Generation
- SDK is generated from `graphBeta.openapi.yml` via Kiota
- **DO NOT manually edit files in `/Generated/graphChangeSdk/`** — regenerate via Kiota CLI if API changes
- Client created via `createGraphClient(requestAdapter)` factory function

### Admin Endpoints (Key Paths)
- `admin.configurationManagement.configurationSnapshots`: List/manage snapshots
- `admin.configurationManagement.configurationDrifts`: Query detected drifts
- `admin.configurationManagement.configurationMonitors`: Monitor configurations
- Each supports `.count()` suffix and `.item()` accessors (RESTful patterns)

### Integration Pattern
Request adapter typically injected from auth service; SDK uses JSON + text serializers.

## Development Workflows

### TypeScript Checking
Run `pnpm check` before commits to catch type errors across Svelte and Node configs.

### HMR Limitations
- Component state resets on file save (HMR state preservation disabled)
- Workaround: Move persistent state to external `svelte/store` (see README)

### PWA Configuration
- Manifest defined in `vite.config.ts` (name: "GraphyoDrift")
- Workbox caches `**/*.{js,css,html,svg,png,ico}`
- Auto-update enabled via `registerType: 'autoUpdate'`

## Project-Specific Conventions
- File extensions: `.svelte`, `.ts`, `.js` only
- No SvelteKit routing—handle routing client-side if needed
- TypeScript strict mode enforced; use `@ts-ignore` sparingly on generated files only
- Imports use ES modules (`import...from`)

## Common Tasks for AI Agents
1. **Add UI Components**: Create `.svelte` files in `/src/lib/`, use Svelte 5 `$state` rune
2. **Call Microsoft Graph**: Use `graphClient.admin.configurationManagement.*` endpoints
3. **Type Safety**: Always run `pnpm check` after changes
4. **Debug**: Check browser console + Network tab; Vite logs in terminal
