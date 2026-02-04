<script lang="ts">
import JsonDiffViewer from './JsonDiffViewer.svelte'
import { getGraphClient, parseGraphErrorMessage } from './GraphClient'
import type { ConfigurationBaseline, ConfigurationSnapshotJob } from '../../Generated/graphChangeSdk/models'

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

{#if show}
  <div class="modal-overlay" role="button" tabindex="0" onclick={closeModal} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeModal()}></div>

  <dialog class="modal" open onkeydown={(e) => e.key === 'Escape' && closeModal()}>
    <div class="modal-header">
      <h2>Configuration Snapshot</h2>
      <button type="button" class="close-button" onclick={closeModal}>✕</button>
    </div>
    <div class="modal-body">
      {#if isLoadingSnapshot}
        <p>Loading snapshot...</p>
      {:else if selectedSnapshot}
        <div class="compare-section">
          <div class="compare-controls">
            <label for="compare-snapshot">Compare with:</label>
            <select id="compare-snapshot" bind:value={compareSnapshotUri}>
              <option value="">-- Select a snapshot --</option>
              {#each getAvailableSnapshots() as job (job.resourceLocation ?? job.id ?? job.displayName ?? '')}
                <option value={job.resourceLocation}>
                  {job.displayName ?? 'Unnamed'} - {job.completedDateTime?.toLocaleString() ?? ''}
                </option>
              {/each}
            </select>
            <button class="primary" onclick={handleCompare} disabled={!compareSnapshotUri || isLoadingSnapshot}>
              Compare
            </button>
          </div>
        </div>

        {#if showDiff && comparisonSnapshot}
          <div class="diff-section">
            <h3>Differences</h3>
            <JsonDiffViewer
              left={comparisonSnapshot?.resources ?? {}}
              right={selectedSnapshot?.resources ?? {}}
              height="500px"
            />
          </div>
        {:else}
          <div class="detail-row">
            <strong>Content:</strong>
            <pre>{JSON.stringify(selectedSnapshot.resources, null, 2)}</pre>
          </div>
        {/if}
      {/if}
    </div>
    <div class="modal-footer">
      <button class="primary" onclick={closeModal}>Close</button>
    </div>
  </dialog>
{/if}
