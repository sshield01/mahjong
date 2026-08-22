export default async function takeSeat(socket, schema, { position }) {
  socket.emit(schema.addPlayer(socket.name, position));
}
