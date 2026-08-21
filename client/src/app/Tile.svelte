<script context="module">
  const SUITS = ['Pin', 'Sou', 'Man', 'wind', 'dragon'];
  const VALUES = ['Ton', 'Nan', 'Shaa', 'Pei', 'Chun', 'Haku', 'Hatsu'];

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const playerSuitOrders = {};
  const playerWildSide = {};

  function getSuitOrder(wind) {
    if (!playerSuitOrders[wind]) {
      const numbered = shuffleArray(['Pin', 'Sou', 'Man']);
      const wildSide = Math.random() < 0.5 ? 'left' : 'right';
      playerWildSide[wind] = wildSide;
      if (wildSide === 'left') {
        playerSuitOrders[wind] = ['_wild', ...numbered, 'wind', 'dragon'];
      } else {
        playerSuitOrders[wind] = [...numbered, '_wild', 'wind', 'dragon'];
      }
    }
    return playerSuitOrders[wind];
  }

  const valueOrder = (a, b) => typeof a === 'number'
    ? a - b
    : VALUES.indexOf(a) - VALUES.indexOf(b);
  const order = (tiles, wildcard, wind) => (a, b) => {
    if (!tiles[a] || !tiles[b]) return 0;
    const suits = getSuitOrder(wind);
    const aWild = wildcard && tiles[a].suit === wildcard.suit && tiles[a].value === wildcard.value;
    const bWild = wildcard && tiles[b].suit === wildcard.suit && tiles[b].value === wildcard.value;
    const aSuit = aWild ? '_wild' : tiles[a].suit;
    const bSuit = bWild ? '_wild' : tiles[b].suit;
    const suitDiff = suits.indexOf(aSuit) - suits.indexOf(bSuit);
    return suitDiff || valueOrder(tiles[a].value, tiles[b].value);
  };
  
  const pct = (amt, rev) => `${rev ? 'max' : 'min'}(${amt}vw, ${amt}vh)`;
  const TILE_DEPTH = 2.3;
  const TILE_WIDTH = 4;
  const TILE_HEIGHT = 5.3;
  const WALL_TILE_WIDTH = 3;

  const STACKS_PER_WALL = 17;
  const STACKS_WIDTH = STACKS_PER_WALL * WALL_TILE_WIDTH;

  const WALL_INSET = pct(100 - STACKS_WIDTH / 8.0 * 3);
  const WALL_POSITION = [
    [
      `translate(${pct(50 - STACKS_WIDTH / 2.0)}, ${WALL_INSET})`,
      `translateX(-${(STACKS_PER_WALL - 1) * 0.75}px)`,
      // 'rotateZ(-15deg)',
    ],
    [
      `translateX(${pct(100)})`,
      'rotateZ(90deg)',
      `translate(${pct(50 - STACKS_WIDTH / 2.0)}, ${WALL_INSET})`,
      `translateX(-${(STACKS_PER_WALL - 1) * 0.75}px)`,
      // 'rotateZ(-15deg)',
    ],
    [
      `translate(${pct(100)}, ${pct(100)})`,
      'rotateZ(180deg)',
      `translate(${pct(50 - STACKS_WIDTH / 2.0)}, ${WALL_INSET})`,
      `translateX(-${(STACKS_PER_WALL - 1) * 0.75}px)`,
      // 'rotateZ(-15deg)',
    ],
    [
      `translateY(${pct(100)})`,
      'rotateZ(270deg)',
      `translate(${pct(50 - STACKS_WIDTH / 2.0)}, ${WALL_INSET})`,
      `translateX(-${(STACKS_PER_WALL - 1) * 0.75}px)`,
      // 'rotateZ(-15deg)',
    ],
  ];

  const HAND_SIZE = 13;
  const HAND_WIDTH = HAND_SIZE * TILE_WIDTH;
  const HAND_INSET = pct(100 - STACKS_WIDTH / 4 + TILE_HEIGHT);

  function handPosition(wind) {
    switch (wind) {
      case 'Ton':
        return [
          `translate(${pct(50 - HAND_WIDTH / 2.0)}, ${HAND_INSET})`,
        ];
      case 'Nan':
        return [
          `translateY(${pct(100)})`,
          'rotateZ(270deg)',
          `translate(${pct(50 - HAND_WIDTH / 2.0)}, ${HAND_INSET})`,
        ];
      case 'Shaa':
        return [
          `translate(${pct(100)}, ${pct(100)})`,
          'rotateZ(180deg)',
          `translate(${pct(50 - HAND_WIDTH / 2.0)}, ${HAND_INSET})`,
        ];
      case 'Pei':
        return [
          `translateX(${pct(100)})`,
          'rotateZ(90deg)',
          `translate(${pct(50 - HAND_WIDTH / 2.0)}, ${HAND_INSET})`,
        ];
    }
  }

  const DISCARD_SIZE = 10;
  const DISCARD_INSET = pct(100 - STACKS_WIDTH / 8.0 * 3 - 2 * TILE_HEIGHT);
  function discardPosition(wind) {
    switch (wind) {
      case 'Ton':
        return [
          `translate(${pct(50 - (STACKS_WIDTH - 2 * TILE_WIDTH) / 2.0)}, ${DISCARD_INSET})`,
        ];
      case 'Nan':
        return [
          `translateY(${pct(100)})`,
          'rotateZ(270deg)',
          `translate(${pct(50 - (STACKS_WIDTH - 2 * TILE_WIDTH) / 2.0)}, ${DISCARD_INSET})`,
        ];
      case 'Shaa':
        return [
          `translate(${pct(100)}, ${pct(100)})`,
          'rotateZ(180deg)',
          `translate(${pct(50 - (STACKS_WIDTH - 2 * TILE_WIDTH) / 2.0)}, ${DISCARD_INSET})`,
        ];
      case 'Pei':
        return [
          `translateX(${pct(100)})`,
          'rotateZ(90deg)',
          `translate(${pct(50 - (STACKS_WIDTH - 2 * TILE_WIDTH) / 2.0)}, ${DISCARD_INSET})`,
        ];
    }
  }
</script>

<script>
  import { createEventDispatcher } from 'svelte';
  import context from '../game/context.js';
  import { WINDS, eq } from '../lib/schema.js';
  import images from './images.js';

  export let tile, index, clickable = false, selected = false;
  export let tableAngle;

  const dispatch = createEventDispatcher();
  const { socket, store } = context();

  let frontStyle;
  $: {
    if (tile) {
      if (typeof tile.value === 'number') {
        frontStyle = `background-image: url(${images[tile.suit+tile.value]})`;
      } else {
        frontStyle = `background-image: url(${images[tile.value]})`;
      }
    } else {
      frontStyle = '';
    }
  };

  $: myWind = $store && $store.playerWind(socket.name);
  $: isWildcard = tile && $store && $store.wildcard && eq(tile, $store.wildcard);

  function calcPosition(store) {
    if (index === store.indicator) {
      const rollSum = store.roll[0] + store.roll[1] + store.roll[2];
      let w = 3 - ((rollSum + 2) % 4);
      let s = rollSum;
      for (;;) {
        if (s >= store.walls[w].length) {
          s %= store.walls[w].length;
          w = (w + 1) % 4;
        }
        if (s < 0) {
          w = (w + 3) % 4;
          s = store.walls[w].length - 1;
        }
        if (store.walls[w][s].length !== 0) {
          break;
        }
        s -= 1;
      }
      const position = [...WALL_POSITION[w]];
      const depth = (store.walls[w][s].length + 0.5) * TILE_DEPTH;
      const horizontal = (STACKS_PER_WALL - s - 1) * WALL_TILE_WIDTH;
      position.push(`translateZ(${pct(depth)})`);
      position.push(`translateX(${(STACKS_PER_WALL - s) * 3}px)`);
      position.push(`translateX(${pct(horizontal)})`);
      return `transform: ${position.join(' ')}`;
    }

    for (const [wall, i] of store.walls.map((wall, i) => [wall, i])) {
      for (const [stack, j] of wall.map((stack, j) => [stack, j])) {
        const k = stack.indexOf(index);
        if (k === -1) continue;
        const position = [...WALL_POSITION[i]];
        const depth = k * TILE_DEPTH;
        const horizontal = (STACKS_PER_WALL - j - 1) * WALL_TILE_WIDTH;
        position.push(`translateZ(${pct(depth)})`);
        position.push(`translateX(${(STACKS_PER_WALL - j) * 3}px)`)
        position.push(`translateX(${pct(horizontal)})`);
        position.push('rotateY(180deg)');
        return `transform: ${position.join(' ')}`;
      }
    }

    for (const wind of WINDS.filter(wind => store[wind])) {
      if (store[wind].up.includes(index)) {
        const position = handPosition(wind);
        let i = HAND_SIZE + 1;
        if (index !== store.drawn) {
          i = [...store[wind].up.filter(x => x !== store.drawn)].sort(order(store.tiles, store.wildcard, wind)).indexOf(index);
        }
        const horizontal = i * TILE_WIDTH;
        position.push(`translateX(${i * 3}px)`);
        position.push(`translateX(${pct(horizontal)})`);
        const isExposedWild = (store[wind].exposedWildcards || []).includes(index);
        if (!store.completed && (tableAngle || wind !== myWind) && !isExposedWild) {
          // skip this if the game is over, so we can see all hands
          position.push(`translateZ(${pct((TILE_HEIGHT - TILE_DEPTH) / 2)})`);
          position.push(`rotateX(-90deg)`);
        }
        return `transform: ${position.join(' ')}`;
      } else if ([].concat(...store[wind].down).includes(index)) {
        const position = handPosition(wind);
        let i = store[wind].down.findIndex(meld => meld.includes(index));
        let j = [...store[wind].down[i]].sort(order(store.tiles, store.wildcard, wind)).indexOf(index);
        let k = 0;
        if (j === 3) {
          j = 1;
          k = 1;
        }
        let flip = false;
        if (store[wind].down[i][4] === 'concealed' && j !== 1) {
          flip = true;
        }
        j += i * 3 + store[wind].up.filter(x => x !== store.drawn).length + 0.5;
        let horizontal = j * TILE_WIDTH;
        let depth = k * TILE_DEPTH;
        position.push(`translateX(${j * 3}px)`);
        position.push(`translateX(${pct(horizontal)})`);
        position.push(`translateZ(${pct(depth)})`);
        if (flip) {
          position.push('rotateY(180deg)');
        }
        return `transform: ${position.join(' ')}`;
      } else if (store[wind].discarded.includes(index)) {
        const position = discardPosition(wind);
        const i = store[wind].discarded.indexOf(index);
        const j = i % DISCARD_SIZE;
        const k = Math.floor(i / DISCARD_SIZE);
        const horizontal = j * TILE_WIDTH;
        // Extra rows grow back toward this player's own hand, not toward the
        // table's center -- otherwise, in a long hand, four independently-growing
        // discard piles converge and overlap in the middle of the table.
        const vertical = k * TILE_HEIGHT;
        position.push(`translate(${j * 3}px, ${k * 3}px)`);
        position.push(`translate(${pct(horizontal)}, ${pct(vertical, true)})`);
        return `transform: ${position.join(' ')}`;
      }
    }

    return '';
  }

  let position;
  $: position = (tableAngle, calcPosition($store));
</script>

<div class="selection {selected ? 'selected' : ''}">
  <div class="tile {isWildcard ? 'wildcard' : ''}" style={position}>
    <div class="top {clickable ? 'clickable' : ''}" on:click={() => clickable && dispatch('click', { tile, index })} />
    <div class="bottom {clickable ? 'clickable' : ''}" on:click={() => clickable && dispatch('click', { tile, index })} />
    <div class="left {clickable ? 'clickable' : ''}" on:click={() => clickable && dispatch('click', { tile, index })} />
    <div class="right {clickable ? 'clickable' : ''}" on:click={() => clickable && dispatch('click', { tile, index })} />
    <div class="front {clickable ? 'clickable' : ''}" on:click={() => clickable && dispatch('click', { tile, index })}>
      <div class="image" style={frontStyle} />
    </div>
    <div class="back {clickable ? 'clickable' : ''}" on:click={() => clickable && dispatch('click', { tile, index })} />
  </div>
</div>

<style>
  .tile {
    position: absolute;
    left: max(-2vw, -2vh);
    top: max(-2.65vw, -2.65vh);
    width: min(4vw, 4vh);
    height: min(5.3vw, 5.3vh);

    transform-style: preserve-3d;
    transform-origin: 50% 50% min(1.15vw, 1.15vh);
    transition: transform 1s;
    will-change: transform;
    pointer-events: none;

    --color-back: #ffad00;
    --color-side: #e89f05;
    --color-front: #fcfcfc;
    --color-front-front: #fefefe;
  }

  .selection {
    position: absolute;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 1s;
    pointer-events: none;
  }

  .selection {
    transform: none;
  }

  .selection.selected {
    transform: translateZ(max(1.3vw, 1.3vh));
  }

  .front, .back, .left, .right, .top, .bottom {
    position: absolute;
    transform-style: preserve-3d;
  }

  .clickable {
    cursor: pointer;
    pointer-events: auto;
    --color-back: #8dc8e8;
    --color-side: #5c9eed;
    --color-front: #f5f1c4;
    --color-front-front: #f5f1c4;
  }

  .selection.selected .clickable {
    --color-back: #addc91;
    --color-side: #a1d884;
    --color-front: #f5f1c4;
    --color-front-front: #f5f1c4;
  }

  .image {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .front, .back {
    top: 0;
    left: 0;
    width: min(4vw, 4vh);
    height: min(5.3vw, 5.3vh);
  }

  .left, .right {
    width: min(1.65vw, 1.65vh);
    height: min(5.3vw, 5.3vh);
  }

  .top, .bottom {
    width: min(4vw, 4vh);
    height: min(1.65vw, 1.65vh);
  }

  .front {
    box-sizing: border-box;
    padding: 5%;
    transform: translateZ(min(2.3vw, 2.3vh)) translateZ(-1px);
    background-color: var(--color-front-front);
  }

  .back {
    background-color: var(--color-back);
  }

  .top {
    top: 0;
    left: 0;
    transform-origin: top;
    transform: rotateX(90deg);

    border-top: min(0.5vw, 0.5vh) solid var(--color-side);
    background-color: var(--color-front);
  }

  .left {
    top: 0;
    left: 0;
    transform-origin: left;
    transform: rotateY(-90deg);

    border-left: min(0.5vw, 0.5vh) solid var(--color-side);
    background-color: var(--color-front);
  }

  .right {
    top: 0;
    right: 0;
    transform-origin: right;
    transform: rotateY(90deg);

    border-right: min(0.5vw, 0.5vh) solid var(--color-side);
    background-color: var(--color-front);
  }

  .bottom {
    bottom: 0;
    left: 0;
    transform-origin: bottom;
    transform: rotateX(-90deg);

    border-bottom: min(0.5vw, 0.5vh) solid var(--color-side);
    background-color: var(--color-front);
  }

  .tile.wildcard {
    --color-back: #ffd700;
    --color-side: #daa520;
    --color-front: #fffacd;
    --color-front-front: #fffacd;
  }
</style>
