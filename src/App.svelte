<script lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: Doesnt work with svelte
import { onMount } from 'svelte'
import appLogo from '/favicon.svg'
import { getGraphClient, signIn, signOut, getActiveAccount, isMsalConfigured, createConfigurationSnapshot, parseGraphErrorMessage } from './lib/GraphClient'
import SnapshotModal from './lib/SnapshotModal.svelte'
import { Button, Card, Badge, Table, TableBody, TableHead, TableHeadCell, TableBodyRow, TableBodyCell, Alert, Heading, P, ButtonGroup } from 'flowbite-svelte'
import { Section } from 'flowbite-svelte-blocks'
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
    snapshotJobs = getSnapshotJobs()
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

<main class="p-8 space-y-6">
  <Alert>
    <span class="font-medium">Info alert!</span>
    Change a few things up and try submitting again.
  </Alert>

  <!-- Hero Section -->
  <Section class="flex flex-col gap-4">
    <img src={appLogo} class="w-16 h-16" alt="GraphyoDrift Logo" />
    <div>
      <Heading tag="h1" class="mb-2">GraphyoDrift</Heading>
      <P>
        Monitor configuration drift in Microsoft Graph. GraphyoDrift snapshots configuration
        resources and highlights changes over time using Unified Configuration Tenant
        Management (UCTM) APIs.
      </P>
    </div>
  </Section>

  <!-- Sign In Card -->
  <Card>
    <div class="space-y-4">
      <div>
        <Heading tag="h2" class="mb-2">Connect to Microsoft Graph</Heading>
        {#if accountName}
          <Badge large>{accountName}</Badge>
        {/if}
      </div>
      <P>
        Sign in to request the <strong>ConfigurationMonitoring.ReadWrite.All</strong> scope and
        load your configuration snapshot jobs.
      </P>
      <ButtonGroup>
        {#if accountName}
          <Button color="red" onclick={handleSignOut} disabled={isLoading}>
            {isLoading ? 'Working…' : 'Sign out'}
          </Button>
        {:else}
          <Button color="blue" onclick={handleSignIn} disabled={isLoading || !isMsalConfigured()}>
            {isLoading ? 'Working…' : 'Sign in to Graph'}
          </Button>
        {/if}
      </ButtonGroup>
      {#if !isMsalConfigured()}
        <P size="sm" class="text-gray-500">Set VITE_AAD_CLIENT_ID in a .env file.</P>
      {/if}
      {#if errorMessage}
        <Alert color="red">{errorMessage}</Alert>
      {/if}
    </div>
  </Card>

  <!-- Snapshot Jobs Card -->
  <Card>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Heading tag="h2">Snapshot jobs</Heading>
        <Badge large>{snapshotJobs.length} total</Badge>
      </div>
      <ButtonGroup>
        <Button color="blue" onclick={handleCreateSnapshot} disabled={isLoading || !accountName}>
          Create snapshot
        </Button>
        <Button color="alternative" onclick={loadSnapshotJobs} disabled={isLoading || !accountName}>
          Refresh
        </Button>
      </ButtonGroup>

      {#if isLoading && snapshotJobs.length === 0}
        <P class="text-gray-500">Loading snapshot jobs…</P>
      {:else if snapshotJobs.length === 0}
        <P class="text-gray-500">No snapshot jobs found yet.</P>
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
    </div>
  </Card>

  <SnapshotModal
    bind:show={showModal}
    bind:snapshotUri={currentSnapshotUri}
    {snapshotJobs}
    onError={(msg) => errorMessage = msg}
  />
</main>
