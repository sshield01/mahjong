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

  const WALL_INSET_PCT = 100 - STACKS_WIDTH / 8.0 * 3;
  const WALL_INSET = pct(WALL_INSET_PCT);

  // The four walls are one row rotated into place, so the ring only closes into a
  // square if each row runs from the inner face of one neighbour to the inner
  // face of the other. Starting it at `50 - STACKS_WIDTH / 2` made the row 52%
  // wide where 61.75% was needed, leaving every corner open by 5.4%.
  const WALL_START = 100 - WALL_INSET_PCT;
  // Run each row one tile-height past the far face, so it covers the corner on
  // its right. Every corner then belongs to exactly one wall -- the usual
  // pinwheel -- rather than each row stopping short and the neighbour's wall
  // jutting past your left end.
  const WALL_SPAN = WALL_INSET_PCT + TILE_HEIGHT - WALL_START;
  const WALL_STACK_SPACING = (WALL_SPAN - TILE_WIDTH) / (STACKS_PER_WALL - 1);

  // Stacks used to carry a few pixels of extra offset each, which spread the row
  // roughly 24px past its span at both ends -- so the wall in front of you poked
  // out over *both* neighbours. Being pixels among percentages, no span could fix
  // it at every table size, so the row is now purely proportional.
  const wallRow = () => [`translate(${pct(WALL_START)}, ${WALL_INSET})`];
  const WALL_POSITION = [
    [...wallRow()],
    [`translateX(${pct(100)})`, 'rotateZ(90deg)', ...wallRow()],
    [`translate(${pct(100)}, ${pct(100)})`, 'rotateZ(180deg)', ...wallRow()],
    [`translateY(${pct(100)})`, 'rotateZ(270deg)', ...wallRow()],
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
  const DISCARD_INSET_PCT = 100 - STACKS_WIDTH / 8.0 * 3 - 2 * TILE_HEIGHT;
  const DISCARD_INSET = pct(DISCARD_INSET_PCT);

  // How much room the rows have between where the pile starts and the inner face
  // of the wall behind it -- two tiles deep, which is what the inset above is
  // built from. Rows grow into this band and must not leave it.
  const DISCARD_DEPTH = WALL_INSET_PCT - DISCARD_INSET_PCT;

  // Spacing between rows. One tile height while the rows fit, and tighter after
  // that so a long hand closes the pile up instead of marching it into the wall.
  const discardRowPitch = (rows) =>
    rows > 1
      ? Math.min(TILE_HEIGHT, (DISCARD_DEPTH - TILE_HEIGHT) / (rows - 1))
      : TILE_HEIGHT;

  // The discard row used to be positioned from the *wall's* width minus two
  // tiles, which is unrelated to how wide the row actually is, leaving it sitting
  // noticeably left of the wall behind it.
  //
  // Centre it on the square the four walls enclose. Not on the wall *row*: that
  // row deliberately runs long at one end to cover its corner, so its own centre
  // is off to one side.
  const SQUARE_CENTRE_PCT = (WALL_START - TILE_HEIGHT + WALL_INSET_PCT + TILE_HEIGHT) / 2;
  const DISCARD_STAGGER_PX = 3;
  const DISCARD_CENTRE_PX = ((DISCARD_SIZE - 1) * DISCARD_STAGGER_PX) / 2;

  // Air between one discard and the next. They used to be pitched at exactly a
  // tile width, so every tile touched its neighbour and the row read as one
  // continuous strip rather than a line of separate tiles -- worst where it
  // matters most, since the live discard is scaled up to be picked out and grew
  // straight into the tiles either side of it.
  //
  // The row is centred in the square the walls enclose, roughly 61.75 wide
  // against the 47.2 this pitch gives a full row of ten, so the gap is paid for
  // out of margin the pile was not using.
  const DISCARD_GAP = 0.8;
  const DISCARD_PITCH = TILE_WIDTH + DISCARD_GAP;

  // Where the row's first tile goes, and the pixel nudge that cancels the row's
  // own stagger so it stays centred at any table size.
  const DISCARD_START =
    SQUARE_CENTRE_PCT - ((DISCARD_SIZE - 1) * DISCARD_PITCH) / 2 - TILE_WIDTH / 2;
  const DISCARD_NUDGE_PX = -DISCARD_CENTRE_PX;
  function discardPosition(wind) {
    switch (wind) {
      case 'Ton':
        return [
          `translate(${pct(DISCARD_START)}, ${DISCARD_INSET})`,
          `translateX(${DISCARD_NUDGE_PX}px)`,
        ];
      case 'Nan':
        return [
          `translateY(${pct(100)})`,
          'rotateZ(270deg)',
          `translate(${pct(DISCARD_START)}, ${DISCARD_INSET})`,
          `translateX(${DISCARD_NUDGE_PX}px)`,
        ];
      case 'Shaa':
        return [
          `translate(${pct(100)}, ${pct(100)})`,
          'rotateZ(180deg)',
          `translate(${pct(DISCARD_START)}, ${DISCARD_INSET})`,
          `translateX(${DISCARD_NUDGE_PX}px)`,
        ];
      case 'Pei':
        return [
          `translateX(${pct(100)})`,
          'rotateZ(90deg)',
          `translate(${pct(DISCARD_START)}, ${DISCARD_INSET})`,
          `translateX(${DISCARD_NUDGE_PX}px)`,
        ];
    }
  }
</script>

<script>
  import { createEventDispatcher } from 'svelte';
  import context from '../game/context.js';
  import { WINDS, eq } from '../lib/schema.js';
  import images from './images.js';

  export let tile, index, clickable = false, selected = false, final = false;
  export let tableAngle;

  const dispatch = createEventDispatcher();
  const { store, myName } = context();

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

  $: myWind = $store && $store.seatOf($myName);
  $: isWildcard = tile && $store && $store.wildcard && eq(tile, $store.wildcard);

  function calcPosition(store) {
    if (index === store.indicator) {
      // Pinned to the slot it was drawn from at the deal. This used to be
      // recomputed against the *current* wall, skipping stacks as they emptied,
      // so the indicator wandered along the wall (and sank) while kongs ate into
      // the dead wall. The dice decide the spot once; nothing after moves it.
      const rollSum = store.roll[0] + store.roll[1] + store.roll[2];
      let w = 3 - ((rollSum + 2) % 4);
      let s = rollSum;
      if (s >= store.walls[w].length) {
        s %= store.walls[w].length;
        w = (w + 1) % 4;
      }
      const position = [...WALL_POSITION[w]];
      // Every stack is dealt two tiles high and the indicator is taken off the
      // top, so its slot is the upper one -- flush in the wall, just face up.
      // Purely visual: the dead-wall draw that kong uses walks `walls`, which no
      // longer contains this tile at all, so nothing about play changes.
      const depth = TILE_DEPTH;
      const horizontal = (STACKS_PER_WALL - s - 1) * WALL_STACK_SPACING;
      position.push(`translateZ(${pct(depth)})`);
      position.push(`translateX(${pct(horizontal)})`);
      return `transform: ${position.join(' ')}`;
    }

    for (const [wall, i] of store.walls.map((wall, i) => [wall, i])) {
      for (const [stack, j] of wall.map((stack, j) => [stack, j])) {
        const k = stack.indexOf(index);
        if (k === -1) continue;
        const position = [...WALL_POSITION[i]];
        const depth = k * TILE_DEPTH;
        const horizontal = (STACKS_PER_WALL - j - 1) * WALL_STACK_SPACING;
        position.push(`translateZ(${pct(depth)})`);
        position.push(`translateX(${pct(horizontal)})`);
        position.push('rotateY(180deg)');
        if (drawable) {
          // Grown about the tile's own centre, not the board's -- scaling the
          // full-board `.selection` wrapper instead pushed an off-centre tile
          // outward. The straight-up lift stays on the wrapper (translation does
          // not drift); only the size belongs here.
          position.push('scale(1.4)');
        }
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
        const horizontal = j * DISCARD_PITCH;
        // Extra rows grow back toward this player's own hand, not toward the
        // table's center -- otherwise, in a long hand, four independently-growing
        // discard piles converge and overlap in the middle of the table. They
        // only have DISCARD_DEPTH to grow into before the wall, so the pitch
        // closes up once there are more rows than fit.
        //
        // The step used to be `pct(vertical, true)` -- max(vw, vh) -- while the
        // tile height, the inset here and the wall inset are all min(vw, vh). On
        // any window that is not perfectly square a row therefore stepped back
        // further than a tile is tall, and the second row sat on the wall.
        const rows = Math.ceil(store[wind].discarded.length / DISCARD_SIZE);
        const vertical = k * discardRowPitch(rows);
        position.push(`translateX(${j * 3}px)`);
        position.push(`translate(${pct(horizontal)}, ${pct(vertical)})`);
        if (actionable) {
          // Lifted off the table and grown while it can be claimed, so the one
          // tile that matters is obvious in a pile of look-alikes -- and a much
          // bigger target to hit.
          position.push(`translateZ(${pct(TILE_DEPTH * 2)})`);
          position.push('scale(1.4)');
        }
        return `transform: ${position.join(' ')}`;
      }
    }

    return '';
  }

  // The live discard, while this player can actually claim it (chow/pong/kong/win).
  // `clickable` is only set for tiles this player has an action on, so it already
  // encodes "actionable" -- this just narrows it to the tile on the table.
  $: actionable = clickable && $store && index === $store.discarded;

  // The one tile in the wall this player may take. Colouring it was not enough on
  // its own: seen along the wall it is nearly edge-on, so only a sliver shows and
  // a hue change on a sliver is easy to miss. The scan is over the walls only, and
  // only for a tile that is already clickable, so it costs nothing in practice.
  $: drawable =
    clickable &&
    !!$store &&
    $store.walls.some((wall) => wall.some((stack) => stack.includes(index)));

  let position;
  $: position = (tableAngle, actionable, drawable, calcPosition($store));
</script>

<div class="selection {selected ? 'selected' : ''} {drawable ? 'drawable' : ''}">
  <div class="tile {isWildcard ? 'wildcard' : ''} {actionable ? 'actionable' : ''} {drawable ? 'drawable' : ''} {final ? 'final' : ''}" style={position}>
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

  /* The tiles the 海底 round will be drawn from. They show up in the wall a few
     draws before the round starts, so the end of the hand can be seen coming.
     `.clickable` sets its own colours on the faces themselves, so the tile you
     can actually draw still reads blue once the round arrives. */
  .tile.final {
    --color-back: #c0392b;
    --color-side: #96281b;
    --color-front: #e8a49c;
    --color-front-front: #e8a49c;
  }

  .tile.wildcard {
    --color-back: #ffd700;
    --color-side: #daa520;
    --color-front: #fffacd;
    --color-front-front: #fffacd;
  }

  /* Growing needs to feel immediate; the 1s default is tuned for tiles sliding
     across the table, which reads as sluggish for a highlight. */
  .tile.actionable {
    transition: transform 0.2s ease-out;
  }

  /* The next tile to draw, held clear of the wall. The lift goes on the wrapper,
     whose transform sits outside the tile's own placement, so it is always
     straight up off the table whichever wall the tile belongs to. Breaking the
     wall's silhouette reads from any angle, which a colour on a near-edge-on face
     does not.

     It sits above a two-high wall stack (2 x TILE_DEPTH, 4.6 of these units)
     rather than within it. Height is also size here -- the table is drawn in
     perspective, so raising it moves it toward the camera and the target grows
     with the clearance; the tile's own `scale(1.4)` does the rest.

     It used to rock between two heights. A tile that simply stays up is easier to
     hit -- the bob meant full clearance for only an instant of each cycle, and a
     target that kept changing size under the cursor. */
  .selection.drawable {
    transform: translateZ(min(5.5vw, 5.5vh));
  }

  /* Colour every face, not just the back. The generic clickable palette leaves the
     four sides near-white -- the same near-white as an ordinary tile -- so from a
     low angle, where the sides are most of what you see, it looked unchanged. */
  .tile.drawable .clickable {
    --color-back: #2b7fd4;
    --color-side: #17538f;
    --color-front: #63b3ea;
    --color-front-front: #63b3ea;
  }

</style>
