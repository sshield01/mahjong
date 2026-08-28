<script>
  export let angle = 0, rotation = 0, scale = 1;
  export let topLabel = '', leftLabel = '', rightLabel = '', bottomLabel = '';
  export let highlightSide = null;
  // Which seat is dealing. Nothing on the table said so, and it is not a detail:
  // 庄家 doubles the base for every payment in the hand, whether the dealer wins
  // or loses, so it changes what the hand is worth to everyone at the table. The
  // only way to know had been to notice who was handed the fourteenth tile.
  export let dealerSide = null;
</script>

<div class="world">
  <!-- scale3d, not scale: a 2D scale would leave Z alone and leave the tiles
       looking thicker than the board they sit on. -->
  <div class="table" style="transform: rotateX({angle}deg) rotateZ({rotation}deg) scale3d({scale}, {scale}, {scale})">
    {#if topLabel}
      <div class="top-label {highlightSide === 'top' ? 'highlight' : ''}">
        {topLabel}{#if dealerSide === 'top'}<span class="dealer">庄</span>{/if}
      </div>
    {/if}
    {#if leftLabel}
      <div class="left-label {highlightSide === 'left' ? 'highlight' : ''}">
        {leftLabel}{#if dealerSide === 'left'}<span class="dealer">庄</span>{/if}
      </div>
    {/if}
    {#if rightLabel}
      <div class="right-label {highlightSide === 'right' ? 'highlight' : ''}">
        {rightLabel}{#if dealerSide === 'right'}<span class="dealer">庄</span>{/if}
      </div>
    {/if}
    {#if bottomLabel}
      <div class="bottom-label {highlightSide === 'bottom' ? 'highlight' : ''}">
        {bottomLabel}{#if dealerSide === 'bottom'}<span class="dealer">庄</span>{/if}
      </div>
    {/if}
    <div class="top-edge" />
    <div class="left-edge" />
    <div class="right-edge" />
    <div class="bottom-edge" />
    <slot />
  </div>
</div>

<style>
.world {
  position: relative;
  perspective: 120vh;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.table {
  position: relative;
  width: min(100vw, 100vh);
  height: min(100vw, 100vh);
  margin: 0 auto;
  background-image: var(--image-table);
  transform-style: preserve-3d;
  transition: transform 2s;
  will-change: transform;
}

.top-edge, .bottom-edge {
  position: absolute;
  left: 0;
  width: 100%;
  height: 0.5cm;
  background-color: #2c4730;
}

.top-edge {
  bottom: 100%;
  transform-origin: bottom;
  transform: rotateX(-90deg);
}

.bottom-edge {
  top: 100%;
  transform-origin: top;
  transform: rotateX(90deg);
}

.left-edge, .right-edge {
  position: absolute;
  top: 0;
  width: 0.5cm;
  height: 100%;
  background-color: #264231;
}

.left-edge {
  right: 100%;
  transform-origin: right;
  transform: rotateY(90deg);
}

.top-label, .bottom-label, .right-label, .left-label {
  padding: clamp(6px, 1.5vh, 16px) 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: clamp(12pt, 3vmin, 20pt);
  font-family: var(--font-english);
  font-weight: 600;
  text-align: center;
  letter-spacing: 1px;
}

/* Gold, the same note the wildcard tile is painted in, so it reads as a standing
   property of the seat rather than another turn indicator -- the highlight on the
   label already means "acting now" and the two must not be confused. */
.dealer {
  font-family: var(--font-chinese);
  font-size: 0.75em;
  font-weight: 600;
  letter-spacing: 0;
  margin-left: 8px;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.28);
  color: #ffe9a8;
  white-space: nowrap;
  /* `text-shadow` inherits, so the in-turn glow would spill onto this and blur
     the gold into the white. The two say different things and should not blend:
     one is "acting now", the other "dealing this hand". */
  text-shadow: none;
}

.top-label::before, .bottom-label::before, .right-label::before, .left-label::before {
  font-family: var(--font-chinese);
  margin-right: 8px;
  opacity: 0.6;
  font-size: 0.8em;
}

.bottom-label::before {
  content: '东';
}

.top-label::before {
  content: '西';
}

.right-label::before {
  content: '南';
}

.left-label::before {
  content: '北';
}

.right-edge {
  left: 100%;
  transform-origin: left;
  transform: rotateY(-90deg);
}

.left-label {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  transform-origin: bottom left;
  transform: rotateZ(-90deg);
}

.right-label {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 100%;
  transform-origin: bottom right;
  transform: rotateZ(90deg);
}

.top-label {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 100%;
}

.bottom-label {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
}

/* Whose turn it is -- and the only thing on the table that says so. It was a
   plain underline, which on white text tilted away from you reads as a character
   in the name rather than a state, and once a 庄 badge sat beside the name the
   line ran under that too, as though it were part of it. Brightness and a glow
   survive the perspective, and stop at the text they belong to. */
.highlight {
  color: #ffffff;
  text-shadow: 0 0 clamp(4px, 1vmin, 10px) rgba(255, 255, 255, 0.75);
}
</style>
