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
  import context from '../../game/context.js';

  const { store, myName } = context();

  const ORDER = {
    Ton: ['Shaa', 'Nan', 'Pei', 'Ton'],
    Shaa: ['Ton', 'Pei', 'Nan', 'Shaa'],
    Nan: ['Pei', 'Shaa', 'Ton', 'Nan'],
    Pei: ['Nan', 'Ton', 'Shaa', 'Pei'],
  };
  const DEFAULT_ORDER = ['Ton', 'Nan', 'Shaa', 'Pei'];

  $: mySeat = $store.seatOf($myName);
</script>

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

