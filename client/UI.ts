import type { connection } from "websocket";

export interface Message {
  room: string;
  text: string;
  author: string;
  time: string;
}

type Notification = (typeof window)["Notification"];

interface Elements {
  content: HTMLInputElement;
  input: HTMLInputElement;
  inputForm: HTMLFormElement;
  status: HTMLInputElement;
  notifyEnabled: HTMLInputElement;
  ttsEnabled: HTMLInputElement;
  roomSwitcher: HTMLInputElement;
  roomSwitcherForm: HTMLFormElement;
}

export class UI {
  private readonly content: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly inputForm: HTMLFormElement;
  private readonly status: HTMLElement;
  private readonly notifyEnabled: HTMLInputElement;
  private readonly ttsEnabled: HTMLInputElement;
  private readonly roomSwitcher: HTMLInputElement;
  private readonly roomSwitcherForm: HTMLFormElement;
  private readonly maxActorsPerBox: number;
  private readonly synth: SpeechSynthesis;
  private connection: connection | null;
  private notification: Notification | null;
  private backgrounds: string[];
  private currentBoxActors: number;
  private currentBoxes: number;
  private currentBox: HTMLDivElement | null;
  private previousAuthor: string | null;
  private characters: any;

  constructor(elements: Elements) {
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
    this.input.value = ""; // Clear on init
    this.synth = window.speechSynthesis;
    if (typeof this.synth === "undefined") {
      this.ttsEnabled.disabled = true;
    } else {
      this.synth.speak(new SpeechSynthesisUtterance("")); // Initialize voices
    }
    this.setupShortcuts();
    this.setupNotifications();
    // this.loadCharacterManifest(); // Character manifest loaded by client first
  }

  setConnection(connection: connection) {
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

  notify(data: Message) {
    if (
      typeof this.notification !== "undefined" &&
      this.notification!.permission === "granted" &&
      this.notifyEnabled.checked === true
    ) {
      new Notification(`comicchat ${data.room}`, {
        lang: "en-US",
        icon: "./res/icon.gif",
        body: `${data.author}: ${data.text}`,
      });
    }
  }

  tts(data: Message) {
    if (this.ttsEnabled.checked === true && typeof this.synth !== "undefined") {
      const utterable = new SpeechSynthesisUtterance(data.text);
      const voices = this.synth.getVoices();
      const hashCode = this.getHashCode(data.author);
      const languageVoices = {
        "ja-JP": this.getVoicesFor(voices, "ja-JP"),
        "ko-KR": this.getVoicesFor(voices, "ko-KR"),
        "zh-CN": this.getVoicesFor(voices, "zh-CN"),
      };
      if (data.text.match(/[\u3040-\u309F\u30A0-\u30FF]/g)) {
        utterable.lang = "ja-JP";
      } else if (
        data.text.match(/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g)
      ) {
        utterable.lang = "ko-KR";
      } else if (data.text.match(/[\u4E00-\u9FFF]/g)) {
        utterable.lang = "zh-CN";
      }
      if (utterable.lang !== "") {
        // @ts-ignore
        const langVoices = languageVoices[utterable.lang];
        utterable.voice =
          langVoices[Math.floor(hashCode) % langVoices.length] || null;
      }
      // Assign random (hashed) voice if not a special language or no voice available for that language
      if (!utterable.voice) {
        utterable.voice = voices[Math.floor(hashCode) % voices.length];
      }
      this.synth.speak(utterable);
    }
  }

  addHistory(history: any) {
    for (let i = 0; i < history.length; i++) {
      this.addLine(JSON.parse(history[i]), false);
    }
    window.scrollTo(0, document.body.scrollHeight);
  }

  addLine(message: Message, stickBottom?: boolean) {
    // Make a new box if
    // * We hit maximum number of actors in a box
    // * No boxes
    // * It's a monologue
    const newBox =
      this.currentBoxActors >= this.maxActorsPerBox ||
      this.currentBoxes === 0 ||
      this.previousAuthor === message.author;
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
    this.currentBox!.appendChild(this.makeActor(message, flip));
    this.currentBoxActors++;
    this.previousAuthor = message.author;
  }

  private setStatus(status: string) {
    this.status.innerHTML = status;
  }

  private requestNotificationsPermission() {
    if (
      typeof this.notification !== "undefined" &&
      this.notification!.permission === "default"
    ) {
      this.notification!.requestPermission();
    }
  }

  private setupNotifications() {
    this.notifyEnabled.onclick = this.requestNotificationsPermission.bind(this);
    this.notification =
      this.notification ||
      window.Notification ||
      (window as any).webkitNotifications;
    if (typeof this.notification === "undefined")
      this.notifyEnabled.disabled = true;
  }

  private getVoicesFor(voices: SpeechSynthesisVoice[], lang: string) {
    const result: SpeechSynthesisVoice[] = [];
    for (let i = 0; i < voices.length; i++) {
      if (voices[i].lang === lang) {
        result.push(voices[i]);
      }
    }
    return result;
  }

  private clearContent() {
    this.content.innerHTML = "";
    this.currentBoxActors = 0;
    this.currentBoxes = 0;
  }

  private setupShortcuts() {
    this.inputForm.onsubmit = (e) => {
      e.preventDefault();
      this.connection?.send(
        JSON.stringify({
          type: "message",
          room: document.location.hash,
          text: this.input.value,
        })
      );
      this.input.placeholder = "Chat...";
      this.inputForm.reset();
    };
    this.roomSwitcherForm.onsubmit = (e) => {
      e.preventDefault();
      // Change room -- part and join (no multiroom support in front end)
      this.connection!.send(
        JSON.stringify({
          type: "part",
          room: window.location.hash,
        })
      );
      window.location.hash = this.roomSwitcher.value;
      this.connection!.send(
        JSON.stringify({
          type: "join",
          room: window.location.hash,
        })
      );
      this.roomSwitcher.value = window.location.hash;
      this.roomSwitcher.placeholder = window.location.hash;
      // Grab history of new room
      this.clearContent();
      this.connection!.send(
        JSON.stringify({
          type: "history",
          room: window.location.hash,
        })
      );
    };
  }

  private makeBox(message: Message) {
    const boxTemplate = document.getElementById("box-template")!.innerHTML;
    const box = document.createElement("div");
    const name = this.makeBackground(message);
    const url = `url('${name}')`;
    box.innerHTML = boxTemplate;
    box.getElementsByTagName("div")[0].style.backgroundImage = url;
    return box.getElementsByTagName("div")[0];
  }

  private makeBackground(message: Message) {
    if (this.backgrounds?.length) {
      const bgix =
        this.getHashCode(`${message.text} ${message.author} ${message.time}`) %
        this.backgrounds.length;
      return `./res/backgrounds/${this.backgrounds[bgix]}.gif`;
    }
  }

  private makeActor(message: Message, flip: boolean) {
    const actorTemplate = document.getElementById("actor-template")!.innerHTML;
    const characters = this.characters;
    const character =
      characters[this.getHashCode(message.author) % characters.length];
    const avatar = document.createElement("img");
    const avatarImageIndex =
      this.getHashCode(`${message.text} ${message.author} ${message.time}`) %
      character.images.length;
    avatar.src = `./res/avatars/${character.name}/${character.images[avatarImageIndex]}.png`;
    // Make characters face each other
    if (flip === true) {
      if (avatar.classList) {
        avatar.classList.add("flip-horizontal");
      } else {
        avatar.className += " flip-horizontal";
      }
    }
    const actor = document.createElement("div");
    actor.innerHTML = actorTemplate;
    actor
      .querySelector(".text")!
      .appendChild(document.createTextNode(message.text));
    actor
      .querySelector(".name")!
      .appendChild(document.createTextNode(message.author));
    (actor.querySelector(".name") as HTMLDivElement)!.title = new Date(
      message.time
    ).toLocaleString(undefined, { timeZoneName: "short" });
    actor.querySelector(".avatar")!.appendChild(avatar);
    return actor.getElementsByTagName("div")[0];
  }
  async loadBackgroundManifest() {
    const data = await fetch("./res/backgrounds/manifest.json").then((x) =>
      x.json()
    );
    this.backgrounds = data;
  }
  async loadCharacterManifest() {
    const data = await fetch("./res/avatars/manifest.json").then((x) =>
      x.json()
    );
    this.characters = data;
  }

  private getHashCode(str: string) {
    let hash = 31;
    if (str.length === 0) {
      return hash;
    }
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
