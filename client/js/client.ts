import { UI } from "./ui";

export async function run() {
  let retryHandlerID: Timer | null = null;
  const params = new URL(window.location.href).searchParams;
  const serverAddress = params.get("server") || "ws://localhost:8084";

  const ui = new UI({
    content: document.getElementById("content")! as HTMLInputElement,
    input: document.getElementById("input")! as HTMLInputElement,
    inputForm: document.getElementById("input-form")! as HTMLFormElement,
    status: document.getElementById("status")! as HTMLInputElement,
    notifyEnabled: document.getElementById("notify")! as HTMLInputElement,
    ttsEnabled: document.getElementById("tts")! as HTMLInputElement,
    roomSwitcher: document.getElementById("room-switcher")! as HTMLInputElement,
    roomSwitcherForm: document.getElementById(
      "room-switcher-form"
    )! as HTMLFormElement,
  });

  if (
    typeof (window.WebSocket || (window as any).MozWebSocket) === "undefined"
  ) {
    document.querySelector("body")!.innerHTML = "Websocket support required.";
    return;
  }

  function makeConnection(ws: WebSocket) {
    ws.onopen = () => {
      console.log(`Connection to ${serverAddress} established`);
      ui.connected();

      if (retryHandlerID !== null) {
        clearInterval(retryHandlerID);
        retryHandlerID = null;
      }

      // Join default room
      if (window.location.hash === "") {
        window.location.hash = "#!";
      }

      ws.send(
        JSON.stringify({
          type: "join",
          room: window.location.hash,
        })
      );

      ws.send(
        JSON.stringify({
          type: "history",
          room: window.location.hash,
        })
      );
    };

    ws.onerror = (e) => {
      console.log("Connection error", e);
      ui.disconnected();
    };

    ws.onclose = (e) => {
      console.log("Connection closed", e);
      ui.disconnected();

      // Reconnect
      if (retryHandlerID === null) {
        retryHandlerID = setInterval(() => {
          console.log("Attempting reconnect...");
          ui.reconnecting();
          const connection = makeConnection(new WebSocket(serverAddress));
          ui.setConnection(connection as any);
        }, 10000);
      }
    };

    ws.onmessage = (message) => {
      let obj: any;

      try {
        obj = JSON.parse(message.data);
      } catch (e) {
        console.log("Invalid message", e);
        return;
      }

      switch (obj.type) {
        case "history":
          ui.addHistory(obj.history);
          break;
        case "message":
          ui.addLine(obj);
          ui.tts(obj);
          ui.notify(obj);
          break;
        default:
          console.log("Unknown message", obj);
          break;
      }
    };

    return ws;
  }

  await ui.loadCharacterManifest();
  // HACK: ideally it shouldn't matter if characters aren't loaded yet
  //       The UI should rerender when it loads characters.
  const connection = makeConnection(new WebSocket(serverAddress));
  ui.setConnection(connection as any);
  await ui.loadBackgroundManifest();
}
