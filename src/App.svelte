<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: Doesnt work with svelte
import { onMount } from 'svelte'
import appLogo from '/favicon.svg'
import { getGraphClient, signIn, signOut, getActiveAccount, isMsalConfigured, createConfigurationSnapshot, parseGraphErrorMessage } from './lib/GraphClient'
import SnapshotModal from './lib/SnapshotModal.svelte'
import { Button, Card, Badge, Table, TableBody, TableHead, TableHeadCell, TableBodyRow, TableBodyCell, Alert } from 'flowbite-svelte'
import type { ConfigurationSnapshotJob } from '../Generated/graphChangeSdk/models';

let isLoading = $state(false)
let errorMessage = $state<string | null>(null)
let accountName = $state<string | null>(null)
let snapshotJobs = $state<ConfigurationSnapshotJob[]>([])
let showModal = $state(false)
let currentSnapshotUri = $state<string | null>(null)

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

const handleViewSnapshot = (snapshotUri?: string | null) => {
  currentSnapshotUri = snapshotUri ?? null
  showModal = true
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

<main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Hero Section -->
  <div class="flex flex-col sm:flex-row gap-6 items-start sm:items-center mb-8 bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
    <img src={appLogo} class="w-16 h-16 flex-shrink-0" alt="GraphyoDrift Logo" />
    <div>
      <h1 class="text-4xl font-bold mb-2">GraphyoDrift</h1>
      <p class="text-gray-600 max-w-2xl">
        Monitor configuration drift in Microsoft Graph. GraphyoDrift snapshots configuration
        resources and highlights changes over time using Unified Configuration Tenant
        Management (UCTM) APIs.
      </p>
    </div>
  </div>

  <!-- Sign In Card -->
  <Card>
    <div class="mb-4">
      <h2 class="text-2xl font-bold mb-2">Connect to Microsoft Graph</h2>
      {#if accountName}
        <Badge large>{accountName}</Badge>
      {/if}
    </div>
    <p class="mb-4">
      Sign in to request the <strong>ConfigurationMonitoring.ReadWrite.All</strong> scope and
      load your configuration snapshot jobs.
    </p>
    <div class="flex gap-4">
      {#if accountName}
        <Button color="red" onclick={handleSignOut} disabled={isLoading}>
          {isLoading ? 'Working…' : 'Sign out'}
        </Button>
      {:else}
        <Button color="blue" onclick={handleSignIn} disabled={isLoading || !isMsalConfigured()}>
          {isLoading ? 'Working…' : 'Sign in to Graph'}
        </Button>
      {/if}
    </div>
    {#if !isMsalConfigured()}
      <p class="text-sm text-gray-500">Set VITE_AAD_CLIENT_ID in a .env file.</p>
    {/if}
    {#if errorMessage}
      <Alert color="red" class="mt-4">{errorMessage}</Alert>
    {/if}
  </Card>

  <!-- Snapshot Jobs Card -->
  <Card>
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <h2 class="text-2xl font-bold">Snapshot jobs</h2>
      <Badge large>{snapshotJobs.length} total</Badge>
    </div>
    <div class="flex gap-2 mb-6">
      <Button color="blue" onclick={handleCreateSnapshot} disabled={isLoading || !accountName}>
        Create snapshot
      </Button>
      <Button color="alternative" onclick={loadSnapshotJobs} disabled={isLoading || !accountName}>
        Refresh
      </Button>
    </div>

    {#if isLoading && snapshotJobs.length === 0}
      <p class="text-gray-500">Loading snapshot jobs…</p>
    {:else if snapshotJobs.length === 0}
      <p class="text-gray-500">No snapshot jobs found yet.</p>
    {:else}
      <div class="overflow-x-auto">
        <Table>
          <TableHead>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Created by</TableHeadCell>
            <TableHeadCell>Created</TableHeadCell>
            <TableHeadCell>Completed</TableHeadCell>
            <TableHeadCell>Expires</TableHeadCell>
            <TableHeadCell>Result</TableHeadCell>
          </TableHead>
          <TableBody>
            {#each snapshotJobs as job}
              <TableBodyRow>
                <TableBodyCell>{job.displayName ?? '—'}</TableBodyCell>
                <TableBodyCell>{job.status ?? '—'}</TableBodyCell>
                <TableBodyCell>{job.createdBy?.user?.displayName ?? job.createdBy?.application?.displayName ?? job.createdBy?.device?.displayName ?? '—'}</TableBodyCell>
                <TableBodyCell>{job.createdDateTime?.toLocaleString() ?? '—'}</TableBodyCell>
                <TableBodyCell>
                  {#if (job.status as string) === 'successful' || (job.status as string) === 'partiallySuccessful'}
                    {job.completedDateTime?.toLocaleString() ?? '—'}
                  {:else}
                    —
                  {/if}
                </TableBodyCell>
                <TableBodyCell class={isExpiringSoon(job.completedDateTime ?? null) ? 'text-red-600 font-semibold' : ''}>
                  {#if (job.status as string) === 'successful' || (job.status as string) === 'partiallySuccessful'}
                    {formatExpiresAt(job.completedDateTime ?? null)}
                  {:else}
                    —
                  {/if}
                </TableBodyCell>
                <TableBodyCell>
                  {#if ((job.status as string) === 'successful' || (job.status as string) === 'partiallySuccessful') && job.resourceLocation}
                    <Button color="alternative" size="sm" onclick={() => handleViewSnapshot(job.resourceLocation)}>View</Button>
                  {:else}
                    —
                  {/if}
                </TableBodyCell>
              </TableBodyRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    {/if}
  </Card>

  <SnapshotModal
    bind:show={showModal}
    bind:snapshotUri={currentSnapshotUri}
    {snapshotJobs}
    onError={(msg) => errorMessage = msg}
  />
</main>
