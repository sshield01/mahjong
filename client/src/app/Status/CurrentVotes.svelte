<script>
  import context from '../../game/context.js';

  const { store, currentVotes, timer } = context();

  // Votes arrive by their English method name; the rest of the UI is Chinese, so
  // show them in kind. `Discard` is not a decision anyone made -- it is just the
  // tile that opened the round -- so it is never listed.
  const LABEL = {
    Pong: '碰',
    Chow: '吃',
    Kong: '杠',
    Eyes: '胡',
    Draw: '摸',
    Ignore: '过',
  };

  // A claim (碰/吃/杠/胡) is news; a pass (过/摸) is only reassurance that the seat
  // has answered and the round is not stuck waiting on it -- so it shows, but
  // muted, rather than shouting alongside the real claims.
  $: shown = Object.entries($currentVotes)
    .filter(([, vote]) => vote && vote.method !== 'Discard' && LABEL[vote.method])
    .map(([position, vote]) => ({
      name: $store[position] ? $store[position].name : position,
      // A win claimed by pong or chow travels as `Pong`/`Chow` with `win` set --
      // the method names the meld it is built from, not what is being declared.
      // Reading the method alone showed 胡 as 碰 at the loudest moment of a hand.
      label: vote.win ? '胡' : LABEL[vote.method],
      // 过 and 摸 are both "not claiming this one" -- reassurance that the seat
      // has answered and the round is not stuck on it, rather than news.
      passed: !vote.win && (vote.method === 'Ignore' || vote.method === 'Draw'),
    }));
</script>

{#if $timer}
  <div class='votes'>
    {#each shown as { name, label, passed }}
      <div class='vote' class:passed>
        {name}: {label}
      </div>
    {/each}
  </div>
{/if}

<style>
  .votes {
    pointer-events: none;
    position: fixed;
    bottom: clamp(8px, 2vh, 32px);
    right: clamp(8px, 3vw, 32px);

    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .vote {
    white-space: nowrap;
    font-size: clamp(12pt, 3.5vw, 18pt);
    color: white;
    font-family: var(--font-chinese);
  }

  /* A pass is background information -- dim it so the eye lands on real claims. */
  .vote.passed {
    opacity: 0.5;
    font-size: clamp(10pt, 3vw, 15pt);
  }
</style>
