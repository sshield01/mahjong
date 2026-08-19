export default async function exposeWildcard(socket, schema, {}) {
  const message = schema.exposeWildcard(socket.name);
  socket.emit(message);
}
