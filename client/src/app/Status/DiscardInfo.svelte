<script>
  import images from '../images.js';

  export let tile;

  let style;
  $: {
    if (typeof tile.value === 'number') {
      style = `background-image: url(${images[tile.suit+tile.value]})`;
    } else {
      style = `background-image: url(${images[tile.value]})`;
    }
  };
</script>

<div class="tile" {style} />

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
  }
</style>
