<script lang="ts">
	import 'json-diff-viewer-component'

	// json-diff-viewer-component is JS only
	type JsonDiffViewer = {
		left: any,
		right: any,
		setData(left: any, right: any): void
	}

	let viewer: JsonDiffViewer
	let { left, right, height = '420px' }: { left: any; right: any; height?: string } = $props()

	$effect(() => {
		if (viewer) {
			viewer.setData(left, right)
		}
	})

</script>

<json-diff-viewer bind:this={viewer} style={`width: 100%; height: ${height};`}></json-diff-viewer>