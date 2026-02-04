<script lang="ts">
import JsonDiffViewer from './JsonDiffViewer.svelte'
import { getGraphClient, parseGraphErrorMessage } from './GraphClient'
import type { ConfigurationBaseline, ConfigurationSnapshotJob } from '../../Generated/graphChangeSdk/models'
import { Button, Modal, Label, Select, Spinner } from 'flowbite-svelte'

let {
  show = $bindable(false),
  snapshotUri = $bindable<string | null>(null),
  snapshotJobs = [],
  onError = (message: string) => {}
}: {
  show: boolean
  snapshotUri: string | null
  snapshotJobs: ConfigurationSnapshotJob[]
  onError?: (message: string) => void
} = $props()

let selectedSnapshot = $state<ConfigurationBaseline | undefined>(undefined)
let isLoadingSnapshot = $state(false)
let compareSnapshotUri = $state<string>('')
let comparisonSnapshot = $state<ConfigurationBaseline | undefined>(undefined)
let showDiff = $state(false)
let isMaximized = $state(false)

const loadSnapshot = async (uri: string) => {
  isLoadingSnapshot = true
  selectedSnapshot = undefined
  try {
    const client = await getGraphClient()
    const snapshot = await client.admin.configurationManagement.configurationSnapshots
      .byConfigurationBaselineId('fromWithUrl').withUrl(uri).get()
    selectedSnapshot = snapshot
  } catch (error) {
    onError(parseGraphErrorMessage(error))
    show = false
  } finally {
    isLoadingSnapshot = false
  }
}

const closeModal = () => {
  show = false
  selectedSnapshot = undefined
  snapshotUri = null
  compareSnapshotUri = ''
  comparisonSnapshot = undefined
  showDiff = false
}

const exitDiffView = () => {
  showDiff = false
  comparisonSnapshot = undefined
}

const getAvailableSnapshots = () => {
  return snapshotJobs.filter(job =>
    ((job.status as string) === 'successful' || (job.status as string) === 'partiallySuccessful') &&
    job.resourceLocation &&
    job.resourceLocation !== snapshotUri
  )
}

const handleCompare = async () => {
  if (!compareSnapshotUri) return

  showDiff = false
  isLoadingSnapshot = true
  try {
    const client = await getGraphClient()
    const snapshot = await client.admin.configurationManagement.configurationSnapshots
      .byConfigurationBaselineId('fromWithUrl').withUrl(compareSnapshotUri).get()
    comparisonSnapshot = snapshot
    showDiff = true
  } catch (error) {
    onError(parseGraphErrorMessage(error))
  } finally {
    isLoadingSnapshot = false
  }
}

$effect(() => {
  if (show && snapshotUri) {
    loadSnapshot(snapshotUri)
  }
})
</script>

<Modal bind:open={show} size="lg" onclose={closeModal} class={isMaximized ? 'w-full h-screen' : ''}>
  <div class="flex justify-between items-center">
    <h3 class="text-lg font-bold">Configuration Snapshot</h3>
    <div class="flex gap-1">
      {#if showDiff && comparisonSnapshot}
        <Button size="sm" color="light" onclick={exitDiffView}>← Back</Button>
      {/if}
      <Button size="sm" color="light" onclick={() => isMaximized = !isMaximized} title={isMaximized ? 'Restore' : 'Maximize'}>
        {isMaximized ? '▢' : '□'}
      </Button>
    </div>
  </div>

  <div class={showDiff && comparisonSnapshot ? 'overflow-y-auto h-96' : ''}>
    {#if isLoadingSnapshot}
      <div class="flex justify-center py-8">
        <Spinner />
      </div>
    {:else if selectedSnapshot}
      {#if showDiff && comparisonSnapshot}
        <JsonDiffViewer
          left={comparisonSnapshot?.resources ?? {}}
          right={selectedSnapshot?.resources ?? {}}
        />
      {:else}
        <div class="space-y-4">
          <fieldset class="space-y-2">
            <Label for="compare-snapshot">Compare with:</Label>
            <Select id="compare-snapshot" bind:value={compareSnapshotUri}>
              <option value="">-- Select a snapshot --</option>
              {#each getAvailableSnapshots() as job (job.resourceLocation ?? job.id ?? job.displayName ?? '')}
                <option value={job.resourceLocation}>
                  {job.displayName ?? 'Unnamed'} - {job.completedDateTime?.toLocaleString() ?? ''}
                </option>
              {/each}
            </Select>
            <Button class="mt-3" color="blue" onclick={handleCompare} disabled={!compareSnapshotUri || isLoadingSnapshot}>
              Compare
            </Button>
          </fieldset>

          <div>
            <h4 class="font-semibold mb-2">Content:</h4>
            <pre class="p-3 rounded text-xs overflow-x-auto max-h-96 bg-gray-50 border border-gray-200">{JSON.stringify(selectedSnapshot.resources, null, 2)}</pre>
          </div>

          {#if !(showDiff && comparisonSnapshot)}
            <Button color="blue" class="w-full mt-4" onclick={closeModal}>Close</Button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</Modal>
