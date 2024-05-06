function log(...text: string[]) {
  console.log(`\n${new Date()}\n${text.join(" ")}`);
}

import net from "node:net";
import tls from "node:tls";
import { client as WebSocketClient, type connection } from "websocket";

const config = {
  cchat: {
    nick: "ircrelay",
    room: "#relay",
    host: "hidoi.moebros.org",
    port: 8084,
    roomLink: "http://hidoi.moebros.org:8081/files/comicchat/client/#relay",
  },
  irc: {
    nick: "comicrelay",
    user: "comic",
    real: "relay",
    channels: ["#"],
    host: "",
    port: 6697,
    ssl: true,
  },
};

// COMIC CHAT CONNECTION

let wsConnection: connection;
let wsRetryHandlerID: Timer | null = null;

function makeComicChat() {
  const reconnectFunction = () => {
    if (wsRetryHandlerID === null) {
      wsRetryHandlerID = setInterval(() => {
        log("CC: Reconnecting...");
        makeComicChat();
      }, 10000);
    }
  };

  function addHandlers(ws: WebSocketClient) {
    ws.on("connect", (connection) => {
      log("CC: Websocket client connected to comic chat.");
      wsConnection = connection;
      if (wsRetryHandlerID !== null) {
        clearInterval(wsRetryHandlerID);
        wsRetryHandlerID = null;
      }

      // Join room, register nick, announce to room that relay has joined.
      const messages = [
        { type: "join", room: config.cchat.room },
        { type: "message", room: config.cchat.room, text: config.cchat.nick },
        {
          type: "message",
          room: config.cchat.room,
          text: `Hello everyone! ${config.irc.host} ${config.irc.channels[0]} messenger here.`,
        },
      ];

      for (const message of messages) {
        connection.sendUTF(JSON.stringify(message));
      }

      connection.on("error", (e: Error) => {
        log("CC: Connection error", e);
        reconnectFunction();
      });

      connection.on("close", (e: Error) => {
        log("CC: Connection closed", String(e));
        reconnectFunction();
      });
    });

    return ws;
  }

  const ws = addHandlers(new WebSocketClient());
  ws.on("connectFailed", (e) => {
    log("CC: Conenction failed", e);
    reconnectFunction();
  });
  ws.connect(`ws://${config.cchat.host}:${config.cchat.port}`);
}

makeComicChat();

// IRC CONNECTION

const irc: any = {};
irc.listeners = [];
irc.pingTimerID = null;

function makeIRC() {
  const connectHandler = () => {
    log("IRC: established connection, registering...");

    irc.on(/^PING :(.+)$/i, (info: string[]) => {
      irc.raw(`PONG : ${info[1]}`);
    });

    irc.on(/^.+ 001 .+$/i, () => {
      for (const channel of config.irc.channels) {
        irc.raw(`JOIN ${channel}`);
        irc.raw(`PRIVMSG ${channel} Relaying to: ${config.cchat.roomLink}`);
      }
    });

    irc.on(/^:(.+)!.+@.+ PRIVMSG .+? :(.+)$/i, (info) => {
      if (wsConnection?.send) {
        log(`CC -> RELAY ${info[1]}: ${info[2]}`);
        wsConnection.send(
          JSON.stringify({
            type: "message",
            room: config.cchat.room,
            text: info[2],
            author: info[1],
            spoof: true,
          })
        );
      } else {
        log("IRC->CC Problem with CC connection, not relaying");
      }
    });

    irc.raw(`NICK ${config.irc.nick}`);
    irc.raw(`USER ${config.irc.user} 8 * :${config.irc.real}`);

    if (irc.pingTimerID !== null) {
      clearInterval(irc.pingTimerID);
    }

    irc.pingTimerID = setInterval(() => {
      irc.raw("PING BONG");
    }, 60000);
  };

  if (config.irc.ssl === true) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Self-signed certificates
    irc.socket = tls.connect(config.irc.port, config.irc.host);
    irc.socket.on("secureConnect", connectHandler);
  } else {
    irc.socket = new net.Socket();
    irc.socket.on("connect", connectHandler);
    irc.socket.connect(config.irc.port, config.irc.host);
  }

  irc.socket.setEncoding("utf-8");
  irc.socket.setNoDelay();

  irc.handle = (data) => {
    let info;

    for (let i = 0; i < irc.listeners.length; i++) {
      info = irc.listeners[i][0].exec(data);

      if (info) {
        irc.listeners[i][1](info, data);

        if (irc.listeners[i][2]) {
          irc.listeners.splice(i, 1);
        }
      }
    }
  };

  irc.on = (data: any, callback: any) => {
    irc.listeners.push([data, callback, false]);
  };

  irc.on_once = (data: any, callback: any) => {
    irc.listeners.push([data, callback, true]);
  };

  irc.raw = (data: string) => {
    if (data !== "") {
      irc.socket.write(data + "\n", "utf-8");
      log(`IRC -> ${data}`);
    }
  };

  irc.socket.on("data", (sdata: string) => {
    const data = sdata.split("\n");

    for (let i = 0; i < data.length; i++) {
      if (data[i] !== "") {
        log(`IRC <- ${data[i]}`);
        irc.handle(data[i].slice(0, -1));
      }
    }
  });

  irc.socket.on("close", () => {
    makeIRC();
  });

  irc.socket.on("error", () => {
    makeIRC();
  });
}

makeIRC();
