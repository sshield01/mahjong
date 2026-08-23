import { mount } from "svelte";
import App from "./app/App.svelte";
import IO from "socket.io-client";
import AsyncSocket from "./socket/socket.js";

const socket = new AsyncSocket(IO());
const app = mount(App, {
  target: document.querySelector("#root"),
  props: { socket },
});

// Support hook. When a table stops moving, `mahjong.why()` in the browser
// console prints what the server believes about it -- crucially, whether a vote
// round is open and whose answer it is waiting on, which cannot be worked out
// from a seat. Read-only; it changes nothing about the game.
window.mahjong = {
  socket,
  async why() {
    try {
      const state = await socket.send("diagnose", {});
      console.log(JSON.stringify(state, null, 2));
      return state;
    } catch (error) {
      console.error("Could not ask:", error);
    }
  },
};
