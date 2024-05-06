process.title = "comicchat-server";

import minimist from "minimist";
import http from "node:http";
import { type connection, server as websocketServer } from "websocket";

interface Data {
  type: string;
  room: string;
  time: number;
  text: string;
  author: string;
  spoof?: boolean;
}

// Basic global logger -- replace with library
function log(text: string) {
  console.log(`${new Date()} ${text}`);
}

const args = minimist(process.argv.slice(2));
const wsServerPort = args.port || 8084;
const historySize = args.historySize || 500;
const clients: connection[] = [];
const rooms: Record<string, { history: Data[]; clients: connection[] }> = {};

console.log("Config:", {
  wsServerPort: wsServerPort,
  historySize: historySize,
});

// Dummy HTML server for websocket server to hook into
const httpServer = http.createServer(() => {});
httpServer.listen(wsServerPort, () => {
  log(`Server listening on port ${wsServerPort}`);
});

const wsServer = new websocketServer({
  httpServer: httpServer,
});

function initRoom(name: string) {
  // Init room if doesn't exist
  rooms[name] = rooms[name] || {};
  rooms[name].history = rooms[name].history || [];
  rooms[name].clients = rooms[name].clients || [];
}

wsServer.on("request", (request) => {
  log(`Connection from origin ${request.origin}`);
  const connection = request.accept(null, request.origin);
  const index = clients.push(connection) - 1;
  const joinedRooms: string[] = [];
  let username = false;

  function sendHistory(room: string) {
    initRoom(room);

    // Send room scrollback
    connection.sendUTF(
      JSON.stringify({
        type: "history",
        history: rooms[room].history,
      })
    );
  }

  function joinRoom(newRoom: string) {
    initRoom(newRoom);
    rooms[newRoom].clients.push(connection);
    joinedRooms.push(newRoom);
  }

  function leaveRoom(room: string) {
    let i: number;
    if (typeof rooms[room] !== "undefined") {
      i = rooms[room].clients.indexOf(connection);
      rooms[room].clients.splice(i, 1);
    }

    i = joinedRooms.indexOf(room);
    joinedRooms.splice(i, 1);
  }

  function broadcastTo(room: string, data: Data) {
    for (const client of rooms[room].clients) {
      client.sendUTF(JSON.stringify(data));
    }
  }

  connection.on("message", (message) => {
    try {
      if (message.type === "utf8") {
        log(` <- ${username}: ${message.utf8Data}`);

        let obj: Data;
        try {
          obj = JSON.parse(message.utf8Data);
        } catch (e) {
          log(` Bad message ${username}: ${message.utf8Data}`);
          log(String(e));
          return;
        }

        switch (obj.type) {
          case "history":
            sendHistory(obj.room);
            break;
          case "join":
            joinRoom(obj.room);
            break;
          case "part":
            leaveRoom(obj.room);
            break;
          case "message":
            if (username === false) {
              // Register -- split out into message type?
              username = obj.text as any;
            } else {
              // Broadcast
              const json: Data = {
                type: "message",
                room: obj.room,
                time: new Date().getTime(),
                text: obj.text,
                author: obj.spoof ? obj.author : (username as any),
              };

              rooms[obj.room].history.push(json);
              rooms[obj.room].history = rooms[obj.room].history.slice(
                -historySize
              );

              broadcastTo(obj.room, json);
            }
            break;
        }
      }
    } catch (e) {
      log(" Error in connection.on");
      log(String(e));
    }
  });

  connection.on("close", (connection) => {
    log(`Peer ${username} ${(connection as any).remoteAddress} disconnected`);
    for (const room of joinedRooms) {
      leaveRoom(room);
    }
    clients.splice(index, 1);
  });
});
