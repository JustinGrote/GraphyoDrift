<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: Doesnt work with svelte
import { onMount } from 'svelte'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import appLogo from '/favicon.svg'
import { getGraphClient, signIn, signOut, getActiveAccount, isMsalConfigured, createConfigurationSnapshot, parseGraphErrorMessage } from './lib/GraphClient'

let isLoading = $state(false)
let errorMessage = $state<string | null>(null)
let accountName = $state<string | null>(null)
let snapshotJobs = $state<Array<Record<string, unknown>>>([])

const loadSnapshotJobs = async () => {
  errorMessage = null
  isLoading = true
  try {
    const client = await getGraphClient()
    const response = await client.admin.configurationManagement.configurationSnapshotJobs.get({
      queryParameters: {
        top: 25,
        orderby: ['createdDateTime desc'],
      },
    })
    snapshotJobs = (response?.value as Array<Record<string, unknown>> | undefined) ?? []
  } catch (error) {
    errorMessage = parseGraphErrorMessage(error)
  } finally {
    isLoading = false
  }
}

const handleSignIn = async () => {
  errorMessage = null
  isLoading = true
  try {
    const result = await signIn()
    accountName = result.account?.name ?? result.account?.username ?? null
    isLoading = false
    await loadSnapshotJobs()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed.'
    errorMessage = message
    isLoading = false
  }
}

const handleSignOut = async () => {
  errorMessage = null
  isLoading = true
  try {
    await signOut()
    accountName = null
    snapshotJobs = []
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-out failed.'
    errorMessage = message
  } finally {
    isLoading = false
  }
}

const handleCreateSnapshot = async () => {
  errorMessage = null
  isLoading = true
  try {
    await createConfigurationSnapshot()
    await loadSnapshotJobs()
  } catch (error) {
    errorMessage = parseGraphErrorMessage(error)
  } finally {
    isLoading = false
  }
}

onMount(async () => {
  if (!isMsalConfigured()) {
    errorMessage = 'Missing VITE_AAD_CLIENT_ID. Add it to a .env file to enable sign-in.'
    return
  }

  const existingAccount = getActiveAccount()
  if (existingAccount) {
    accountName = existingAccount.name ?? existingAccount.username ?? null
    await loadSnapshotJobs()
  }
})
</script>

<main class="page">
  <header class="hero">
    <img src={appLogo} class="logo" alt="GraphyoDrift Logo" />
    <div>
      <h1>GraphyoDrift</h1>
      <p class="subtitle">
        Monitor configuration drift in Microsoft Graph. GraphyoDrift snapshots configuration
        resources and highlights changes over time using Unified Configuration Tenant
        Management (UCTM) APIs.
      </p>
    </div>
  </header>

  <section class="card">
    <div class="card-header">
      <h2>Connect to Microsoft Graph</h2>
      {#if accountName}
        <span class="pill">Signed in as {accountName}</span>
      {/if}
    </div>
    <p>
      Sign in to request the <strong>ConfigurationMonitoring.ReadWrite.All</strong> scope and
      load your configuration snapshot jobs.
    </p>
    <div class="actions">
      {#if accountName}
        <button class="primary" onclick={handleSignOut} disabled={isLoading}>
          {isLoading ? 'Working…' : 'Sign out'}
        </button>
      {:else}
        <button class="primary" onclick={handleSignIn} disabled={isLoading || !isMsalConfigured()}>
          {isLoading ? 'Working…' : 'Sign in to Graph'}
        </button>
      {/if}
      {#if !isMsalConfigured()}
        <span class="hint">Set VITE_AAD_CLIENT_ID in a .env file.</span>
      {/if}
    </div>
    {#if errorMessage}
      <div class="callout error">{errorMessage}</div>
    {/if}
  </section>

  <section class="card">
    <div class="card-header">
      <h2>Snapshot jobs</h2>
      <span class="pill">{snapshotJobs.length} total</span>
    </div>
    <div class="actions">
      <button class="primary" onclick={handleCreateSnapshot} disabled={isLoading || !accountName}>
        Create snapshot
      </button>
      <button class="primary" onclick={loadSnapshotJobs} disabled={isLoading || !accountName}>
        Refresh
      </button>
    </div>
    {#if isLoading && snapshotJobs.length === 0}
      <p class="hint">Loading snapshot jobs…</p>
    {:else if snapshotJobs.length === 0}
      <p class="hint">No snapshot jobs found yet.</p>
    {:else}
      <div class="table">
        <div class="row header">
          <span>ID</span>
          <span>Status</span>
          <span>Created</span>
          <span>Last updated</span>
        </div>
        {#each snapshotJobs as job}
          <div class="row">
            <span>{(job.id as string) ?? '—'}</span>
            <span>{(job.status as string) ?? (job.state as string) ?? '—'}</span>
            <span>{(job.createdDateTime as string) ?? '—'}</span>
            <span>{(job.lastModifiedDateTime as string) ?? '—'}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>
