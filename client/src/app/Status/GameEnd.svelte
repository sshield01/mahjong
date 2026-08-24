<script>
  import context from '../../game/context';
  import Schema, { eq } from '../../lib/schema';

  const { store, socket, myName } = context();

  $: winner = $store[$store.turn];
  $: allTiles = [...winner.up, ...winner.down.flat()]
    .filter(tile => typeof tile === 'number')
    .map(tile => $store.tiles[tile]);

  $: isDealer = $store.turn === 'Ton';
  $: isSelfDraw = $store.source === 'front' || $store.source === 'back';
  // Taken on a tile from the wall's last lap.
  $: isFinalDraw = !!$store.finalDraw;
  // 黄庄: the wall ran down with nobody out, so there is no hand to lay out --
  // the dealer just collects a flat two from each of the others.
  $: washedOut = !!$store.washedOut;
  $: washOutLosers = ['Ton', 'Nan', 'Shaa', 'Pei']
    .filter(wind => $store[wind] && wind !== $store.turn)
    .map(wind => $store[wind].name);

  $: isPongpong = (() => {
    const isW = t => $store.wildcard && eq(t, $store.wildcard);
    const hasPairInDown = winner.down.some(meld => {
      const meldTiles = meld.filter(t => typeof t === 'number');
      return meldTiles.length === 2;
    });
    const downValid = winner.down.every(meld => {
      const meldTiles = meld.filter(t => typeof t === 'number').map(t => $store.tiles[t]);
      return (meldTiles.length >= 3 && meldTiles.every(t => eq(t, meldTiles[0]))) ||
        meldTiles.length === 2;
    });
    if (!downValid) return false;
    const handTiles = winner.up.map(t => $store.tiles[t]);
    const nonWild = handTiles.filter(t => !isW(t));
    const wilds = handTiles.length - nonWild.length;

    if (hasPairInDown) {
      let triplets = [...nonWild];
      let w = wilds;
      let valid = true;
      while (triplets.length > 0) {
        const f = triplets[0];
        const c = triplets.filter(t => eq(t, f)).length;
        if (c >= 3) {
          let r = 0;
          triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
        } else if (c + w >= 3) {
          w -= (3 - c);
          triplets = triplets.filter(t => !eq(t, f));
        } else { valid = false; break; }
      }
      if (valid && w % 3 === 0) return true;
      return false;
    }

    for (let i = 0; i < nonWild.length; i++) {
      if (nonWild.slice(0, i).some(t => eq(t, nonWild[i]))) continue;
      const cnt = nonWild.filter(t => eq(t, nonWild[i])).length;
      if (cnt >= 2) {
        const rest = [];
        let pairRemoved = 0;
        for (const t of nonWild) {
          if (eq(t, nonWild[i]) && pairRemoved < 2) { pairRemoved++; continue; }
          rest.push(t);
        }
        let triplets = [...rest];
        let w = wilds;
        let valid = true;
        while (triplets.length > 0) {
          const f = triplets[0];
          const c = triplets.filter(t => eq(t, f)).length;
          if (c >= 3) {
            let r = 0;
            triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
          } else if (c + w >= 3) {
            w -= (3 - c);
            triplets = triplets.filter(t => !eq(t, f));
          } else { valid = false; break; }
        }
        if (valid && w % 3 === 0) return true;
      }
    }
    // pair with wildcard
    if (wilds >= 1 && nonWild.length % 3 === 0) {
      let triplets = [...nonWild];
      let w = wilds - 1;
      let valid = true;
      while (triplets.length > 0) {
        const f = triplets[0];
        const c = triplets.filter(t => eq(t, f)).length;
        if (c >= 3) {
          let r = 0;
          triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
        } else if (c + w >= 3) {
          w -= (3 - c);
          triplets = triplets.filter(t => !eq(t, f));
        } else { valid = false; break; }
      }
      if (valid && w % 3 === 0) return true;
    }
    return false;
  })();

  $: isAllClear = winner.down.length === 0 && isSelfDraw;
  $: isAllFromOthers = !isSelfDraw && winner.down.length >= 4;

  $: isAllPairs = (() => {
    const allIndices = [...winner.up, ...winner.down.flat().filter(t => typeof t === 'number')];
    if (allIndices.length !== 14) return false;
    if (winner.down.length > 1) return false;
    const tiles = allIndices.map(t => $store.tiles[t]);
    const wild = $store.wildcard;
    const isW = (t) => wild && eq(t, wild);
    let wilds = tiles.filter(isW).length;
    const normals = tiles.filter(t => !isW(t));
    const remaining = [...normals];
    while (remaining.length) {
      const tile = remaining.pop();
      const idx = remaining.findIndex(other => eq(tile, other));
      if (idx === -1) {
        if (wilds > 0) { wilds--; } else { return false; }
      } else {
        remaining.splice(idx, 1);
      }
    }
    return wilds % 2 === 0;
  })();

  $: nonWildTiles = allTiles.filter(t => !($store.wildcard && eq(t, $store.wildcard)));
  $: isAllJiang = nonWildTiles.every(t => typeof t.value === 'number' && [2, 5, 8].includes(t.value));
  $: isAllWinds = nonWildTiles.every(t => t.suit === 'wind');
  $: isAllSameKind = (() => {
    const nonWild = allTiles.filter(t => !($store.wildcard && eq(t, $store.wildcard)));
    if (nonWild.length === 0) return true;
    const suit = nonWild[0].suit;
    return nonWild.every(t => t.suit === suit);
  })();

  $: hasNoWildcard = (() => {
     if (!$store.wildcard) return true;
	 if (!allTiles.some(t => eq(t, $store.wildcard))) return true;
	 // The same fold the server does. A win claimed by pairing the discard
	 // records that pair as a two-tile group in `down`, which leaves `up` one
	 // short of the 3n+2 shape `winningHand` will even look at -- so this
	 // answered "no" for every such win however the wildcards were being used,
	 // and 无癞子 went missing from the breakdown while the server was doubling
	 // the score for it. The scoreboard has to reach the same verdict as the
	 // scoring does.
	 const pair = winner.down.find(meld => meld.length === 2);
	 const restored = pair
	   ? { ...winner, up: [...winner.up, ...pair], down: winner.down.filter(meld => meld !== pair) }
	   : winner;
	 const noWildStore = { ...$store, wildcard: null };
	 return Schema.winningHand(noWildStore, restored);
  })();

  $: kongCount = winner.down.filter(meld => meld.length >= 5).length;

  $: pairsFourOfAKind = (() => {
    if (!isAllPairs) return 0;
    const nonWild = allTiles.filter(t => !($store.wildcard && eq(t, $store.wildcard)));
    const counts = {};
    for (const t of nonWild) {
      const key = t.suit + '|' + t.value;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.values(counts).filter(c => c === 4).length;
  })();

  // 黄庄 has no winning hand to score, so none of this applies.
  $: scoreBreakdown = washedOut ? { lines: [], losers: [], winnerTotal: 0 } : (() => {
    const WINDS = ['Ton', 'Shaa', 'Pei', 'Nan'];

    function calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount) {
      let base = 1;
      if (isLoserDealer || isDealer) base *= 2;
      if (isLoserDiscarder) base *= 2;
      let score = base;
      if (isPongpong && !isAllPairs) score += 5;
      if (isAllClear) score += 5;
      if (isAllFromOthers) score += 5;
      if (isAllPairs) score += 10;
      if (isAllJiang) score += 10;
      if (isAllWinds) score += 10;
      if (isAllSameKind) score += 10;
      if (isFinalDraw) score += 10;
      if (hasNoWildcard) score *= 2;
      for (let i = 0; i < kongCount + loserKongCount; i++) score *= 2;
      for (let i = 0; i < pairsFourOfAKind; i++) score *= 2;
      return score;
    }

    const lines = [];
    lines.push({ label: '胡', value: '1' });
    if (isPongpong && !isAllPairs) lines.push({ label: '碰碰胡', value: '+5' });
    if (isAllClear) lines.push({ label: '门清', value: '+5' });
    if (isAllFromOthers) lines.push({ label: '全求人', value: '+5' });
    if (isAllPairs) lines.push({ label: '七对', value: '+10' });
    if (isAllJiang) lines.push({ label: '全将', value: '+10' });
    if (isAllWinds) lines.push({ label: '全风', value: '+10' });
    if (isAllSameKind) lines.push({ label: '清一色', value: '+10' });
    if (isFinalDraw) lines.push({ label: '海底捞', value: '+10' });
    for (let i = 0; i < kongCount; i++) lines.push({ label: '杠', value: 'x2' });
    for (let i = 0; i < pairsFourOfAKind; i++) lines.push({ label: '豪华', value: 'x2' });

    const losers = [];
    let winnerTotal = 0;
    for (const wind of WINDS) {
      if ($store[wind] && wind !== $store.turn) {
        const isLoserDealer = wind === 'Ton';
        const isLoserDiscarder = isSelfDraw || wind === $store.previousTurn;
        const loserKongCount = $store[wind].down.filter(meld => meld.length >= 5).length;
		const rawScore = calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount);
        const payment = Math.min(30, rawScore);
        const reasons = [];
        if (isLoserDealer) reasons.push('庄家');
        if (isLoserDiscarder) reasons.push(isSelfDraw ? '自摸' : '放炮');
        if (loserKongCount > 0) reasons.push(`杠x${loserKongCount}`);
        losers.push({ name: $store[wind].name, payment, rawScore, reasons });
        winnerTotal += payment;
      }
    }
    if (hasNoWildcard) lines.push({ label: '无癞子', value: 'x2' });

    return { lines, losers, winnerTotal };
  })();

  async function playAgain() {
    const { schema } = await socket.send('playAgain');
    $store = new Schema(schema);
  }

  $: mySeat = $store.seatOf($myName);
</script>

<div class="container">
  <h1 class="title">{washedOut ? '黄庄' : `${$store[$store.turn].name} 胡了`}</h1>

  <div class="scores">
    {#if washedOut}
      <div class="rule">牌墙摸完，无人和牌</div>
      <div class="round-results">
        <div class="result-row">
          <span>{winner.name} (庄家)</span>
          <span class="positive">+{washOutLosers.length * 2}</span>
        </div>
        {#each washOutLosers as name}
          <div class="result-row">
            <span>{name}</span>
            <span class="negative">-2</span>
          </div>
        {/each}
      </div>
    {:else}
      {#each scoreBreakdown.lines as { label, value }}
        <div class="rule">{label}: {value}</div>
      {/each}
      <div class="round-results">
        <div class="result-row">
          <span>{winner.name}</span>
          <span class="positive">+{scoreBreakdown.winnerTotal}</span>
        </div>
        {#each scoreBreakdown.losers as loser}
          <div class="result-row">
            <span>{loser.name}{loser.reasons.length ? ' (' + loser.reasons.join(', ') + ')' : ''}</span>
            <span class="negative">-{loser.payment}{loser.rawScore > 30 ? ` (${loser.rawScore})` : ''}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if $store.scores && Object.keys($store.scores).length > 0}
    <div class="cumulative">
      <div class="cumulative-title">累计积分</div>
      {#each Object.entries($store.scores).sort((a, b) => b[1] - a[1]) as [name, score]}
        <div class="cumulative-row">
          <span class="player-name">{name}</span>
          <span class="player-score" class:positive={score > 0} class:negative={score < 0}>{score > 0 ? '+' : ''}{score}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if mySeat}
    <button
      class="play-again"
      on:click={playAgain}>
      再来一局
    </button>
  {/if}
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: fixed;
    left: 50%;
    top: 50%;
	transform: translate(-50%, -50%);
    width: min(90vw, 800px);
    max-height: 80vh;  
    background: rgba(0, 0, 0, 0.65);
    color: white;
    border-radius: 8px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .title {
    font-family: var(--font-chinese);
    text-align: center;
    margin: 0;
    padding: 10px;
    width: 80%;
    font-size: clamp(18pt, 5vw, 24pt);
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  }

  .scores {
    margin: clamp(10px, 2vh, 20px);
    font-size: clamp(14pt, 4vw, 20pt);
    font-family: var(--font-chinese);
  }

  .rule {
    margin: 6px 0;
  }

  .round-results {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    font-size: clamp(12pt, 3.5vw, 18pt);
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    margin: 6px 0;
    min-width: min(250px, 60vw);
    gap: 16px;
  }

  .positive {
    color: #4caf50;
  }

  .negative {
    color: #f44336;
  }

  .cumulative {
    margin: clamp(10px, 2vh, 20px);
    /* Room for the sticky button: on a short screen it pins to the bottom, and
       without this the last score rows can never be scrolled out from under it. */
    margin-bottom: clamp(16px, 3vh, 28px);
    padding-top: clamp(12px, 2vh, 20px);
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    font-family: var(--font-chinese);
    font-size: clamp(16pt, 5vw, 24pt);
  }

  .cumulative-title {
    font-weight: bold;
    margin-bottom: clamp(8px, 1.5vh, 14px);
    font-size: clamp(19pt, 5.5vw, 28pt);
    letter-spacing: 2px;
  }

  .cumulative-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: clamp(4px, 1vh, 10px) 0;
    min-width: min(300px, 70vw);
    gap: clamp(12px, 4vw, 32px);
  }

  /* Long Cang is a brush face -- beautiful for the headings, but it mangles
     digits. The totals switch to the sans face with tabular figures, so every
     score takes the same width and the column stays aligned whatever the sign. */
  .cumulative .player-name {
    font-family: var(--font-english);
    font-weight: 600;
  }

  .cumulative .player-score {
    font-family: var(--font-english);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 1.15em;
  }

  .player-score.positive {
    color: #4caf50;
  }

  .player-score.negative {
    color: #f44336;
  }

  .play-again {
    margin-top: auto;
    /* Sticks to the bottom of the scrolling panel, so on a short screen the
       main action stays reachable instead of hiding below the scoreboard. */
    position: sticky;
    bottom: 0;
    z-index: 1;

    font-family: var(--font-chinese);
    font-size: clamp(16pt, 4.5vw, 20pt);
    font-weight: bold;
    letter-spacing: 3px;

    /* Was translucent white, which the bright tiles showing through the panel
       washed out until the primary action was hard to see at all. Solid, with
       dark text, so it reads against whatever is behind the table. */
    background: rgba(173, 220, 145, 0.96);
    color: #14301c;
    border: none;
    padding: clamp(12px, 2.4vh, 18px);
    cursor: pointer;
    width: 100%;
    border-radius: 0 0 8px 8px;
    transition: background 0.15s;
  }

  .play-again:hover {
    background: rgb(198, 235, 175);
  }

  .play-again:active {
    background: rgb(146, 196, 116);
  }
</style>
