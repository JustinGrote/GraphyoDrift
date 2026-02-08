<script lang="ts">
	import { setContext, getContext } from 'svelte'
	import type { GraphClient } from '../Generated/graphChangeSdk/graphClient'
	import { getGraphClient } from './graphClient'

	interface Props {
		children?: any
	}

	let { children } = $props()

	const graphClient: GraphClient = getGraphClient()
	const GRAPH_CLIENT_KEY = Symbol('graphClient')

	setContext(GRAPH_CLIENT_KEY, graphClient)

	export function useGraphClient(): GraphClient {
		return getContext(GRAPH_CLIENT_KEY)
	}
</script>

{#if children}
	{@render children()}
{/if}