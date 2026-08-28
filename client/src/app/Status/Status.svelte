<script>
  import ActionButtons from './ActionButtons.svelte';
  import GameEnd from './GameEnd.svelte';
  import PlayerList from './PlayerList.svelte';
  import ReadyButton from './ReadyButton.svelte';
  import DiscardInfo from './DiscardInfo.svelte';
  import CurrentWind from './CurrentWind.svelte';
  import CurrentVotes from './CurrentVotes.svelte';
  import Timer from './Timer.svelte';
  import WildcardInfo from './WildcardInfo.svelte';
  import ScoreBoard from './ScoreBoard.svelte';
  import ReclaimSeat from './ReclaimSeat.svelte';
  import OpenSeats from './OpenSeats.svelte';
  import LeaveButton from './LeaveButton.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import context from '../../game/context.js';

  const { store, myName } = context();

  // Where each seat sits on screen for a given viewer, as [across, right, left,
  // near] -- the viewer themselves always `near`. Every entry is the same ring
  // read from a different chair: 东 南 西 北 anticlockwise, which is the order
  // play travels in.
  const ORDER = {
    Ton: ['Shaa', 'Nan', 'Pei', 'Ton'],
    Shaa: ['Ton', 'Pei', 'Nan', 'Shaa'],
    Nan: ['Pei', 'Shaa', 'Ton', 'Nan'],
    Pei: ['Nan', 'Ton', 'Shaa', 'Pei'],
  };

  // Nobody seated yet, so show the table as 东 sees it. This used to be
  // ['Ton', 'Nan', 'Shaa', 'Pei'] -- turn order pressed into service as a
  // layout, which they are not: read round the diamond it put 东 南 北 西, with
  // 西 and 北 swapped, so the seats in the lobby sat in an arrangement no table
  // has.
  const DEFAULT_ORDER = ORDER.Ton;

  $: mySeat = $store.seatOf($myName);
</script>

<!-- Shared styled confirmation, available for the whole session (e.g. the
     two-wildcard claim warning), so it is never blocked by native dialogs. -->
<ConfirmDialog />

{#if $store.started}
  <Timer />
  {#if !$store.completed}
    {#if mySeat}
      <ActionButtons />
      <LeaveButton />
    {:else}
      <!-- Someone watching a game their own name is still seated in: offer the
           seat back. Only renders when a seated player is actually missing. -->
      <ReclaimSeat />
      <!-- And someone watching a table with a chair going spare: offer to take
           it. The seat diamond that normally does this is only mounted before a
           hand starts, so without it a spectator arriving at a short-handed game
           had to wait out the whole hand to join. -->
      <OpenSeats />
    {/if}
  {:else}
    <GameEnd />
  {/if}
  {#if $store.discarded !== undefined}
    <DiscardInfo tile={$store.tiles[$store.discarded]} />
  {/if}
  {#if $store.wind}
    <CurrentWind wind={$store.wind} />
  {/if}
  <WildcardInfo />
  <ScoreBoard />
  <CurrentVotes />
{:else}
  <PlayerList order={mySeat ? ORDER[mySeat] : DEFAULT_ORDER} {mySeat} />
  {#if $myName && $store.host === $myName}
    <ReadyButton />
  {/if}
{/if}

