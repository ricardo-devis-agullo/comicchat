// client/ui.ts
class UI {
  content;
  input;
  inputForm;
  status;
  notifyEnabled;
  ttsEnabled;
  roomSwitcher;
  roomSwitcherForm;
  maxActorsPerBox;
  synth;
  connection;
  notification;
  backgrounds;
  currentBoxActors;
  currentBoxes;
  currentBox;
  previousAuthor;
  characters;
  constructor(elements) {
    this.content = elements.content;
    this.input = elements.input;
    this.inputForm = elements.inputForm;
    this.status = elements.status;
    this.notifyEnabled = elements.notifyEnabled;
    this.ttsEnabled = elements.ttsEnabled;
    this.roomSwitcher = elements.roomSwitcher;
    this.roomSwitcherForm = elements.roomSwitcherForm;
    this.connection = null;
    this.notification = null;
    this.backgrounds = [];
    this.maxActorsPerBox = 2;
    this.currentBoxActors = 0;
    this.currentBoxes = 0;
    this.currentBox = null;
    this.previousAuthor = null;
    this.input.value = "";
    this.synth = window.speechSynthesis;
    if (typeof this.synth === "undefined") {
      this.ttsEnabled.disabled = true;
    } else {
      this.synth.speak(new SpeechSynthesisUtterance(""));
    }
    this.setupShortcuts();
    this.setupNotifications();
  }
  setConnection(connection) {
    this.connection = connection;
  }
  connected() {
    this.roomSwitcher.placeholder = window.location.hash;
    this.roomSwitcher.value = window.location.hash;
    this.input.placeholder = "Your nickname...";
    this.input.disabled = false;
    this.roomSwitcher.disabled = false;
    this.setStatus("Connected.");
  }
  disconnected() {
    this.input.disabled = true;
    this.input.placeholder = "No connection";
    this.roomSwitcher.disabled = true;
    this.setStatus("Disconnected.");
  }
  reconnecting() {
    this.setStatus("Reconnecting...");
  }
  notify(data) {
    if (typeof this.notification !== "undefined" && this.notification.permission === "granted" && this.notifyEnabled.checked === true) {
      new Notification(`comicchat ${data.room}`, {
        lang: "en-US",
        icon: "./res/icon.gif",
        body: `${data.author}: ${data.text}`
      });
    }
  }
  tts(data) {
    if (this.ttsEnabled.checked === true && typeof this.synth !== "undefined") {
      const utterable = new SpeechSynthesisUtterance(data.text);
      const voices = this.synth.getVoices();
      const hashCode = this.getHashCode(data.author);
      const languageVoices = {
        "ja-JP": this.getVoicesFor(voices, "ja-JP"),
        "ko-KR": this.getVoicesFor(voices, "ko-KR"),
        "zh-CN": this.getVoicesFor(voices, "zh-CN")
      };
      if (data.text.match(/[\u3040-\u309F\u30A0-\u30FF]/g)) {
        utterable.lang = "ja-JP";
      } else if (data.text.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g)) {
        utterable.lang = "ko-KR";
      } else if (data.text.match(/[\u4E00-\u9FFF]/g)) {
        utterable.lang = "zh-CN";
      }
      if (utterable.lang !== "") {
        const langVoices = languageVoices[utterable.lang];
        utterable.voice = langVoices[Math.floor(hashCode) % langVoices.length] || null;
      }
      if (!utterable.voice) {
        utterable.voice = voices[Math.floor(hashCode) % voices.length];
      }
      this.synth.speak(utterable);
    }
  }
  addHistory(history) {
    for (let i = 0;i < history.length; i++) {
      this.addLine(JSON.parse(history[i]), false);
    }
    window.scrollTo(0, document.body.scrollHeight);
  }
  addLine(message, stickBottom) {
    const newBox = this.currentBoxActors >= this.maxActorsPerBox || this.currentBoxes === 0 || this.previousAuthor === message.author;
    if (newBox === true) {
      this.currentBox = this.makeBox(message);
      this.content.appendChild(this.currentBox);
      if (typeof stickBottom === "undefined" || stickBottom === true) {
        window.scrollTo(0, document.body.scrollHeight);
      }
      this.currentBoxActors = 0;
      this.currentBoxes++;
    }
    const flip = this.currentBoxActors >= this.maxActorsPerBox / 2;
    this.currentBox.appendChild(this.makeActor(message, flip));
    this.currentBoxActors++;
    this.previousAuthor = message.author;
  }
  setStatus(status) {
    this.status.innerHTML = status;
  }
  requestNotificationsPermission() {
    if (typeof this.notification !== "undefined" && this.notification.permission === "default") {
      this.notification.requestPermission();
    }
  }
  setupNotifications() {
    this.notifyEnabled.onclick = this.requestNotificationsPermission.bind(this);
    this.notification = this.notification || window.Notification || window.webkitNotifications;
    if (typeof this.notification === "undefined")
      this.notifyEnabled.disabled = true;
  }
  getVoicesFor(voices, lang) {
    const result = [];
    for (let i = 0;i < voices.length; i++) {
      if (voices[i].lang === lang) {
        result.push(voices[i]);
      }
    }
    return result;
  }
  clearContent() {
    this.content.innerHTML = "";
    this.currentBoxActors = 0;
    this.currentBoxes = 0;
  }
  setupShortcuts() {
    this.inputForm.onsubmit = (e) => {
      e.preventDefault();
      this.connection?.send(JSON.stringify({
        type: "message",
        room: document.location.hash,
        text: this.input.value
      }));
      this.input.placeholder = "Chat...";
      this.inputForm.reset();
    };
    this.roomSwitcherForm.onsubmit = (e) => {
      e.preventDefault();
      this.connection.send(JSON.stringify({
        type: "part",
        room: window.location.hash
      }));
      window.location.hash = this.roomSwitcher.value;
      this.connection.send(JSON.stringify({
        type: "join",
        room: window.location.hash
      }));
      this.roomSwitcher.value = window.location.hash;
      this.roomSwitcher.placeholder = window.location.hash;
      this.clearContent();
      this.connection.send(JSON.stringify({
        type: "history",
        room: window.location.hash
      }));
    };
  }
  makeBox(message) {
    const boxTemplate = document.getElementById("box-template").innerHTML;
    const box = document.createElement("div");
    const name = this.makeBackground(message);
    const url = `url('${name}')`;
    box.innerHTML = boxTemplate;
    box.getElementsByTagName("div")[0].style.backgroundImage = url;
    return box.getElementsByTagName("div")[0];
  }
  makeBackground(message) {
    if (this.backgrounds?.length) {
      const bgix = this.getHashCode(`${message.text} ${message.author} ${message.time}`) % this.backgrounds.length;
      return `./res/backgrounds/${this.backgrounds[bgix]}.gif`;
    }
  }
  makeActor(message, flip) {
    const actorTemplate = document.getElementById("actor-template").innerHTML;
    const characters = this.characters;
    const character = characters[this.getHashCode(message.author) % characters.length];
    const avatar = document.createElement("img");
    const avatarImageIndex = this.getHashCode(`${message.text} ${message.author} ${message.time}`) % character.images.length;
    avatar.src = `./res/avatars/${character.name}/${character.images[avatarImageIndex]}.png`;
    if (flip === true) {
      if (avatar.classList) {
        avatar.classList.add("flip-horizontal");
      } else {
        avatar.className += " flip-horizontal";
      }
    }
    const actor = document.createElement("div");
    actor.innerHTML = actorTemplate;
    actor.querySelector(".text").appendChild(document.createTextNode(message.text));
    actor.querySelector(".name").appendChild(document.createTextNode(message.author));
    actor.querySelector(".name").title = new Date(message.time).toLocaleString(undefined, { timeZoneName: "short" });
    actor.querySelector(".avatar").appendChild(avatar);
    return actor.getElementsByTagName("div")[0];
  }
  async loadBackgroundManifest() {
    const data = await fetch("./res/backgrounds/manifest.json").then((x) => x.json());
    this.backgrounds = data;
  }
  async loadCharacterManifest() {
    const data = await fetch("./res/avatars/manifest.json").then((x) => x.json());
    this.characters = data;
  }
  getHashCode(str) {
    let hash = 31;
    if (str.length === 0) {
      return hash;
    }
    for (let i = 0;i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// client/client.ts
async function run() {
  let retryHandlerID = null;
  const params = new URL(window.location.href).searchParams;
  const serverAddress = params.get("server") || "ws://localhost:8084";
  const ui2 = new UI({
    content: document.getElementById("content"),
    input: document.getElementById("input"),
    inputForm: document.getElementById("input-form"),
    status: document.getElementById("status"),
    notifyEnabled: document.getElementById("notify"),
    ttsEnabled: document.getElementById("tts"),
    roomSwitcher: document.getElementById("room-switcher"),
    roomSwitcherForm: document.getElementById("room-switcher-form")
  });
  if (typeof (window.WebSocket || window.MozWebSocket) === "undefined") {
    document.querySelector("body").innerHTML = "Websocket support required.";
    return;
  }
  function makeConnection(ws) {
    ws.onopen = () => {
      console.log(`Connection to ${serverAddress} established`);
      ui2.connected();
      if (retryHandlerID !== null) {
        clearInterval(retryHandlerID);
        retryHandlerID = null;
      }
      if (window.location.hash === "") {
        window.location.hash = "#!";
      }
      ws.send(JSON.stringify({
        type: "join",
        room: window.location.hash
      }));
      ws.send(JSON.stringify({
        type: "history",
        room: window.location.hash
      }));
    };
    ws.onerror = (e) => {
      console.log("Connection error", e);
      ui2.disconnected();
    };
    ws.onclose = (e) => {
      console.log("Connection closed", e);
      ui2.disconnected();
      if (retryHandlerID === null) {
        retryHandlerID = setInterval(() => {
          console.log("Attempting reconnect...");
          ui2.reconnecting();
          const connection2 = makeConnection(new WebSocket(serverAddress));
          ui2.setConnection(connection2);
        }, 1e4);
      }
    };
    ws.onmessage = (message) => {
      let obj;
      try {
        obj = JSON.parse(message.data);
      } catch (e) {
        console.log("Invalid message", e);
        return;
      }
      switch (obj.type) {
        case "history":
          ui2.addHistory(obj.history);
          break;
        case "message":
          ui2.addLine(obj);
          ui2.tts(obj);
          ui2.notify(obj);
          break;
        default:
          console.log("Unknown message", obj);
          break;
      }
    };
    return ws;
  }
  await ui2.loadCharacterManifest();
  const connection = makeConnection(new WebSocket(serverAddress));
  ui2.setConnection(connection);
  await ui2.loadBackgroundManifest();
}
export {
  run
};
