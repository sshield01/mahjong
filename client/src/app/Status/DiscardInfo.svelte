<script>
  import images from '../images.js';
  import context from '../../game/context.js';

  export let tile;

  const { discardAction, timer } = context();

  let style;
  $: {
    if (typeof tile.value === 'number') {
      style = `background-image: url(${images[tile.suit+tile.value]})`;
    } else {
      style = `background-image: url(${images[tile.value]})`;
    }
  };

  // Gated on 想想: only once the player has paused the countdown does this become
  // a claim target. Before that it stays the plain indicator, so nothing new can
  // be misclicked during the few seconds when play is still moving normally.
  $: claimable = !!$discardAction && !!$timer && !!$timer.paused;

  function claim() {
    if (claimable) $discardAction();
  }
</script>

<div
  class="tile {claimable ? 'claimable' : ''}"
  {style}
  on:click={claim}
/>

<style>
  .tile {
    position: fixed;
    top: clamp(4px, 1vh, 8px);
    left: 50%;
    transform: translateX(-50%);
    width: clamp(14px, 2.5vh, 3vh);
    height: clamp(21px, 3.75vh, 4.5vh);
    border-radius: 0.3vh;
    padding: 3%;
    background-position: center;
    background-size: contain;
    background-repeat: no-repeat;
    background-color: white;
    opacity: 0.85;
    pointer-events: none;
    transition: width 0.15s, height 0.15s, box-shadow 0.15s;
  }

  /* Interactive only while this player holds a claim AND has pressed 想想 --
     otherwise it stays the plain read-only indicator it has always been. */
  .tile.claimable {
    pointer-events: auto;
    cursor: pointer;
    opacity: 1;
    width: clamp(22px, 4vh, 4.8vh);
    height: clamp(33px, 6vh, 7.2vh);
    box-shadow: 0 0 0 2px rgba(140, 200, 232, 0.9), 0 0 12px rgba(140, 200, 232, 0.7);
  }

  .tile.claimable:hover {
    box-shadow: 0 0 0 2px rgba(173, 220, 145, 0.95), 0 0 16px rgba(173, 220, 145, 0.85);
  }
</style>
