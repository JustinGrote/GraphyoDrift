<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: Doesnt work with svelte
import { onMount } from 'svelte'
import appLogo from '/favicon.svg'
import { getGraphClient, signIn, signOut, getActiveAccount, isMsalConfigured, createConfigurationSnapshot, parseGraphErrorMessage } from './lib/GraphClient'
import type { ConfigurationBaseline, ConfigurationSnapshotJob } from '../Generated/graphChangeSdk/models';

let isLoading = $state(false)
let errorMessage = $state<string | null>(null)
let accountName = $state<string | null>(null)
let snapshotJobs = $state<ConfigurationSnapshotJob[]>([])
let showModal = $state(false)
let selectedSnapshot = $state<ConfigurationBaseline | undefined>(undefined)
let isLoadingSnapshot = $state(false)

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
    snapshotJobs = response?.value ?? []
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

const handleViewSnapshot = async (snapshotUri?: string | null) => {
  isLoadingSnapshot = true
  showModal = true
  selectedSnapshot = undefined
  try {
    if (!snapshotUri) {
      throw new Error('Invalid snapshot URI.')
    }

    const client = await getGraphClient()
    const snapshot = await client.admin.configurationManagement.configurationSnapshots
      .byConfigurationBaselineId('fromWithUrl').withUrl(snapshotUri).get()
    selectedSnapshot = snapshot
  } catch (error) {
    errorMessage = parseGraphErrorMessage(error)
    showModal = false
  } finally {
    isLoadingSnapshot = false
  }
}

const closeModal = () => {
  showModal = false
  selectedSnapshot = undefined
}

const formatExpiresAt = (completed?: Date | string | null) => {
  if (!completed) {
    return '—'
  }

  const base = typeof completed === 'string' ? new Date(completed) : completed
  if (Number.isNaN(base.getTime())) {
    return '—'
  }

  const expires = new Date(base)
  expires.setDate(expires.getDate() + 7)
  return expires.toLocaleString()
}

const isExpiringSoon = (completed?: Date | string | null) => {
  if (!completed) {
    return false
  }

  const base = typeof completed === 'string' ? new Date(completed) : completed
  if (Number.isNaN(base.getTime())) {
    return false
  }

  const expires = new Date(base)
  expires.setDate(expires.getDate() + 7)
  const hoursLeft = (expires.getTime() - Date.now()) / (1000 * 60 * 60)
  return hoursLeft <= 24
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
          <span>Name</span>
          <span>Status</span>
          <span>Created by</span>
          <span>Created</span>
          <span>Completed</span>
          <span>Expires</span>
          <span>Result</span>
        </div>
        {#each snapshotJobs as job}
          <div class="row">
            <span>{job.displayName ?? '—'}</span>
            <span>{job.status ?? '—'}</span>
            <span>{job.createdBy?.user?.displayName ?? job.createdBy?.application?.displayName ?? job.createdBy?.device?.displayName ?? '—'}</span>
            <span>{job.createdDateTime?.toLocaleString() ?? '—'}</span>
            <span>{job.completedDateTime?.toLocaleString() ?? '—'}</span>
            <span class:expires-soon={isExpiringSoon(job.completedDateTime ?? null)}>
              {formatExpiresAt(job.completedDateTime ?? null)}
            </span>
            <span>
              {#if ((job.status as string) === 'successful' || (job.status as string) === 'partiallySuccessful') && job.resourceLocation}
                <button class="text-button" onclick={() => handleViewSnapshot(job.resourceLocation)}>View</button>
              {:else}
                —
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  {#if showModal}
    <div class="modal-overlay" onclick={closeModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Configuration Snapshot</h2>
          <button class="close-button" onclick={closeModal}>✕</button>
        </div>
        <div class="modal-body">
          {#if isLoadingSnapshot}
            <p>Loading snapshot...</p>
          {:else if selectedSnapshot}
            <div class="detail-row">
              <strong>Content:</strong>
              <pre>{JSON.stringify(selectedSnapshot.resources, null, 2)}</pre>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="primary" onclick={closeModal}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</main>
