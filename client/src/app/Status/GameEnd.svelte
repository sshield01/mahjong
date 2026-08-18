<script>
  import context from '../../game/context';
  import Schema, { eq } from '../../lib/schema';

  const { store, socket } = context();

  $: winner = $store[$store.turn];
  $: allTiles = [...winner.up, ...winner.down.flat()]
    .filter(tile => typeof tile === 'number')
    .map(tile => $store.tiles[tile]);

  $: isDealer = $store.turn === 'Ton';
  $: isSelfDraw = $store.source === 'front' || $store.source === 'back';

  $: isPongpong = (() => {
    const downValid = winner.down.every(meld => {
      const meldTiles = meld.filter(t => typeof t === 'number').map(t => $store.tiles[t]);
      return meldTiles.length >= 3 && meldTiles.every(t => eq(t, meldTiles[0]));
    });
    if (!downValid) return false;
    const handTiles = winner.up.map(t => $store.tiles[t]);
    const nonWild = handTiles.filter(t => !($store.wildcard && eq(t, $store.wildcard)));
    const wilds = handTiles.length - nonWild.length;
    let remaining = [...nonWild];
    let usedWilds = 0;
    // remove one pair
    for (let i = 0; i < remaining.length; i++) {
      const match = remaining.slice(i + 1).findIndex(t => eq(t, remaining[i]));
      if (match !== -1) {
        const rest = [...remaining];
        rest.splice(i + 1 + match, 1);
        rest.splice(i, 1);
        // check all triplets in rest
        let check = [...rest];
        let ok = true;
        let w = wilds;
        while (check.length > 0) {
          const first = check[0];
          const matches = check.filter(t => eq(t, first)).length;
          if (matches >= 3) {
            check = check.filter((t, idx) => { let c = 0; return !(eq(t, first) && ++c <= 3); });
            // remove 3 of first
            let removed = 0;
            check = [...check]; // reset
            check = rest.filter(() => true); // redo
            // simpler approach
            break;
          }
          ok = false;
          break;
        }
        // simplified: just check if rest length is divisible by 3 and all triplets
        if (rest.length % 3 === 0) {
          let triplets = [...rest];
          let valid = true;
          let ww = wilds;
          while (triplets.length > 0) {
            const f = triplets[0];
            const cnt = triplets.filter(t => eq(t, f)).length;
            if (cnt >= 3) {
              let r = 0;
              triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
            } else if (cnt + ww >= 3) {
              ww -= (3 - cnt);
              triplets = triplets.filter(t => !eq(t, f));
            } else {
              valid = false;
              break;
            }
          }
          if (valid) return true;
        }
      }
    }
    // try with wildcard as pair partner
    if (wilds >= 1 && nonWild.length % 3 === 0) {
      let triplets = [...nonWild];
      let valid = true;
      let ww = wilds - 1;
      while (triplets.length > 0) {
        const f = triplets[0];
        const cnt = triplets.filter(t => eq(t, f)).length;
        if (cnt >= 3) {
          let r = 0;
          triplets = triplets.filter(t => !(eq(t, f) && ++r <= 3));
        } else if (cnt + ww >= 3) {
          ww -= (3 - cnt);
          triplets = triplets.filter(t => !eq(t, f));
        } else {
          valid = false;
          break;
        }
      }
      if (valid) return true;
    }
    return false;
  })();

  $: isAllClear = winner.down.length === 0 && isSelfDraw;
  $: isAllFromOthers = !isSelfDraw && winner.down.length >= 3;

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

  $: hasNoWildcard = !$store.wildcard || !allTiles.some(t => eq(t, $store.wildcard));

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

  $: scoreBreakdown = (() => {
    const WINDS = ['Ton', 'Shaa', 'Pei', 'Nan'];

    function calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount) {
      let base = 1;
      if (isLoserDealer || isDealer) base *= 2;
      if (isLoserDiscarder) base *= 2;
      let score = base;
      if (isPongpong) score += 5;
      if (isAllClear) score += 5;
      if (isAllFromOthers) score += 5;
      if (isAllPairs) score += 10;
      if (isAllJiang) score += 10;
      if (isAllWinds) score += 10;
      if (isAllSameKind) score += 10;
      if (hasNoWildcard) score *= 2;
      for (let i = 0; i < kongCount + loserKongCount; i++) score *= 2;
      for (let i = 0; i < pairsFourOfAKind; i++) score *= 2;
      return score;
    }

    const lines = [];
    lines.push({ label: '胡', value: '1' });
    if (isPongpong) lines.push({ label: '碰碰胡', value: '+5' });
    if (isAllClear) lines.push({ label: '门清', value: '+5' });
    if (isAllFromOthers) lines.push({ label: '全求人', value: '+5' });
    if (isAllPairs) lines.push({ label: '七对', value: '+10' });
    if (isAllJiang) lines.push({ label: '全将', value: '+10' });
    if (isAllWinds) lines.push({ label: '全风', value: '+10' });
    if (isAllSameKind) lines.push({ label: '清一色', value: '+10' });
    for (let i = 0; i < kongCount; i++) lines.push({ label: '杠', value: 'x2' });
    for (let i = 0; i < pairsFourOfAKind; i++) lines.push({ label: '豪华对子', value: 'x2' });

    const losers = [];
    let winnerTotal = 0;
    for (const wind of WINDS) {
      if ($store[wind] && wind !== $store.turn) {
        const isLoserDealer = wind === 'Ton';
        const isLoserDiscarder = isSelfDraw || wind === $store.previousTurn;
        const loserKongCount = $store[wind].down.filter(meld => meld.length >= 5).length;
        const payment = Math.min(30, calcLoserScore(isLoserDealer, isLoserDiscarder, loserKongCount));
        const reasons = [];
        if (isLoserDealer) reasons.push('庄家');
        if (isLoserDiscarder) reasons.push(isSelfDraw ? '自摸' : '放炮');
        if (loserKongCount > 0) reasons.push(`杠x${loserKongCount}`);
        losers.push({ name: $store[wind].name, payment, reasons });
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
</script>

<div class="container">
  <h1 class="title">{$store[$store.turn].name} 胡了</h1>

  <div class="scores">
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
          <span class="negative">-{loser.payment}</span>
        </div>
      {/each}
    </div>
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

  <button
    class="play-again"
    on:click={playAgain}>
    再来一局
  </button>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: absolute;
    left: 50vw;
    top: 15vh;
    width: 800px;
    height: 70vh;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: white;
  }

  .title {
    font-family: var(--font-chinese);
    text-align: center;
    margin: 0;
    padding: 10px;
    width: 80%;
    font-size: 24pt;
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  }

  .scores {
    margin: 20px;
    font-size: 20pt;
    font-family: var(--font-chinese);
  }

  .rule {
    margin: 8px 0;
  }

  .round-results {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    font-size: 18pt;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    margin: 6px 0;
    min-width: 250px;
  }

  .positive {
    color: #4caf50;
  }

  .negative {
    color: #f44336;
  }

  .cumulative {
    margin: 20px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    font-family: var(--font-chinese);
    font-size: 16pt;
  }

  .cumulative-title {
    font-weight: bold;
    margin-bottom: 8px;
    font-size: 18pt;
  }

  .cumulative-row {
    display: flex;
    justify-content: space-between;
    margin: 4px 0;
    min-width: 200px;
  }

  .player-score.positive {
    color: #4caf50;
  }

  .player-score.negative {
    color: #f44336;
  }

  .play-again {
    margin-top: auto;
    font-family: var(--font-chinese);
    font-size: 16pt;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.75);
    padding: 12px;
    cursor: pointer;
    width: 100%;
  }
</style>
