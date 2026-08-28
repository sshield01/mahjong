<script>
  import context from '../../game/context.js';

  const { store, currentVotes } = context();

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

  // Whose answer the round is still waiting for. A round resolves only once every
  // seat has answered, and 想想 stops that seat's clock for as long as it likes --
  // so from every other chair the table simply stops, with nothing on screen
  // saying why. That is indistinguishable from the client having hung, and it is
  // the shape of most of the "the game froze" reports this table has produced.
  //
  // Voters are every seated player except the one who discarded; a seat reserved
  // mid-hand is not in the hand and never votes.
  $: waitingOn = ($store && $store.discarded !== undefined && !$store.completed)
    ? ['Ton', 'Nan', 'Shaa', 'Pei'].filter(position =>
        $store[position]
        && !$store[position].waiting
        && position !== $store.previousTurn
        && !$currentVotes[position])
      .map(position => $store[position].name)
    : [];

  // Shown for the whole round, not just while this player holds a clock. The
  // strip used to render only on `$timer`, which is armed for a seat with a claim
  // to weigh -- so the bystander with nothing to decide, who is exactly the person
  // wondering why nothing is happening, was the one person shown nothing.
  $: roundOpen = !!($store && $store.discarded !== undefined && !$store.completed);
</script>

{#if roundOpen && (shown.length || waitingOn.length)}
  <div class='votes'>
    {#each shown as { name, label, passed }}
      <div class='vote' class:passed>
        {name}: {label}
      </div>
    {/each}
    {#each waitingOn as name}
      <div class='vote waiting'>{name}: 想想中</div>
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

  /* Still to answer. Dimmer than a pass and set apart in italic, because this is
     not news either -- it is the answer to "why has nothing happened", which only
     matters while it is true and should never compete with a real claim. */
  .vote.waiting {
    opacity: 0.4;
    font-style: italic;
    font-size: clamp(10pt, 3vw, 15pt);
  }
</style>
