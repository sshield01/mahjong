<script>
  import context from '../../game/context.js';

  const { socket, store } = context();

  async function toggleReady() {
    try {
      await socket.send('ready', {
        ready: !$store[$store.playerWind(socket.name)].ready,
      });
    } catch (error) {
      console.error(error);
    }
  }
</script>

<button class='button' on:click={toggleReady}>
  {#if $store[$store.playerWind(socket.name)].ready}
    取消
  {:else}
    准备
  {/if}
</button>

<style>
  .button {
    position: fixed;
    left: 50%;
    bottom: clamp(20px, 5vh, 50px);
    width: min(300px, 70vw);
    height: 50px;
    transform: translateX(-50%);

    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 28px;
    background: rgba(0, 0, 0, 0.7);
    font-family: var(--font-chinese);
    font-size: clamp(14pt, 4vw, 16pt);
    color: white;
    cursor: pointer;
  }
</style>
