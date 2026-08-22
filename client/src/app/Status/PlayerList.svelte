<script>
  import context from '../../game/context.js';

  const { socket, store } = context();

  const CHARACTER = {
    Pei: '北',
    Nan: '南',
    Shaa: '西',
    Ton: '东',
  };

  export let order;
  export let mySeat = null;

  $: canPick = !mySeat && !$store.started;

  async function takeSeat(position) {
    try {
      await socket.send('takeSeat', { position });
    } catch (error) {
      console.error(error);
    }
  }
</script>

<div class="container">
  {#each order as position}
    <div
      class="player {canPick && !$store[position] ? 'open' : ''}"
      on:click={() => canPick && !$store[position] && takeSeat(position)}
    >
      {#if $store[position]}
        <span class="name">{$store[position].name}</span>
        {#if $store[position].ready && !$store.started}
          <div class="ready" />
        {/if}
      {/if}
      <span class="icon">{CHARACTER[position]}</span>
    </div>
  {/each}
</div>

<style>
  .container {
    position: absolute;
    left: 50vw;
    top: 50vh;
    display: grid;
    grid-template-rows: 1fr 1fr;
    grid-template-columns: 1fr 1fr;
    width: min(50vw, 50vh);
    height: min(50vw, 50vh);
    transform: translate(-50%, -50%) rotateZ(45deg);
    transform-origin: center;
  }

  .player {
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.12);
  }

  .player.open {
    cursor: pointer;
    background: rgba(255, 255, 255, 0.2);
  }

  .player.open .icon {
    color: rgba(255, 255, 255, 0.35);
  }

  .player.open:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .name, .icon, .ready {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotateZ(-45deg);
    transform-origin: center;
  }

  .name {
    font-family: var(--font-english);
    font-size: clamp(10pt, 3vw, 16pt);
    font-weight: bold;
    color: white;
  }

  .icon {
    font-family: var(--font-chinese);
    font-size: min(12vw, 12vh);
    color: rgba(255, 255, 255, 0.07);
  }

  .ready {
    width: min(15vw, 15vh);
    height: min(15vw, 15vh);
    border: 3px solid white;
    border-radius: 100%;
  }
</style>
