import net from "net";
const PORT = 6380;
const store = new Map();
const sets = {};
const ttlms = 300000;

const server = net.createServer((socket) => {
  console.log("client connected!");
  const parseInstance = new Parser((commands) => {
    // console.log(commands);
    let reply = dispatcher(commands);
    socket.write(reply);
  });
  socket.on("data", (data) => {
    let chunk = data.toString();
    parseInstance.feed(chunk);
    // console.log(`Greeting from ${chunk}`);
    // socket.write("+OK\r\n");
  });
});

const listHandlers = {
  LPUSH: (args) => {
    let key = args[0];
    let input = args.slice(1, args.length);
    let expiresAt = null;
    const type = "list";
    // let count = 0;
    if (!store.has(key)) {
      let entry = [];
      input.forEach((object) => {
        entry.unshift(object);
      });
      store.set(key, { type, entry, expiresAt });
    } else {
      let value = store.get(key);
      if (value.type !== "list")
        return resp.errorMessage(
          "WRONGTYPE operation against a key holding the wrong kind of value",
        );
      for (let index = 0; index < input.length; index++) {
        value.entry.unshift(input[index]);
      }
    }
    return resp.integer(store.get(key).entry.length);
  },
  LPOP: (args) => {
    let key = args[0];
    if (!store.has(key)) {
      return resp.errorMessage("undefined key");
    }
    let value = store.get(key);
    if (value.type !== "list")
      return resp.errorMessage(
        "WRONGTYPE operation against a key holding the wrong kind of value",
      );

    if (args.length > 1) {
      let output = [];
      let toPop = parseInt(args[1]);
      for (let index = 0; index < toPop; index++) {
        output.push(value.entry.shift());
      }
      return resp.arrays(output);
    } else {
      return resp.bulkString(`${value.entry.shift()}`);
    }
  },
};

const hashHandlers = {
  HSET: (args) => {
    let key = args[0];
    let count = 0;
    const type = "hash";
    let expiresAt = null;
    let data = {};
    if (!store.has(key)) {
      store.set(key, { type, data, expiresAt });
    }
    const entry = store.get(key);
    if (entry && entry.type !== "hash")
      return resp.errorMessage(
        "WRONGTYPE operation against a key holding the wrong kind of value",
      );
    let hash = store.get(key).data;
    for (let i = 1; i < args.length; i += 2) {
      let field = args[i];
      let value = args[i + 1];
      if (!hash[field]) count++;
      hash[field] = value;
    }
    return resp.integer(count);
  },
  HGET: (args) => {
    let key = args[0];
    if (!store.has(key)) return resp.errorMessage("Key doesn't exist");
    let value = store.get(key).data;
    if (store.get(key).type !== "hash")
      return resp.errorMessage(
        "WRONGTYPE operation against a key holding the wrong kind of value",
      );
    let field = args[1];
    if (!field) return resp.bulkString(null);
    let bucket = value[field];
    return resp.bulkString(bucket);
  },
};

const setHandlers = {
  SADD: (args) => {
    let count = 0;
    let key = args[0];
    let input = args.slice(1, args.length);

    if (!store.has(key)) {
      store.set(key, {
        value: new Set(),
        expiresAt: null,
        type: "set",
      });
    } else {
      let typeCheck = store.get(key).type;
      if (typeCheck !== "set") return resp.errorMessage("WrongType operation");
    }
    let mySet = store.get(key).value;
    input.forEach((object) => {
      if (!mySet.has(object)) {
        count++;
      }
      mySet.add(object);
    });
    return resp.integer(count);
  },
  SMEMBERS: (args) => {
    let key = args[0];
    if (!store.has(key)) return resp.errorMessage("Key doesn't exist");
    let typeCheck = store.get(key).type;
    if (typeCheck !== "set") return resp.errorMessage("WrongType operation");
    let mySet = store.get(key).value;
    if (mySet.size === 0) return resp.arrays([]);
    let arr = [...mySet];
    return resp.arrays(arr);
  },
};

const sortedSetHandlers = {
  ZADD: (args) => {
    let key = args[0];
    let input = args.slice(1);
    if (!store.has(key)) {
      store.set(key, { type: "zset", members: new Map(), sorted: [] });
    }
    let entry = store.get(key);
    if (entry.type !== "zset")
      return resp.errorMessage("Wrong Operation on WrongType");
    let count = 0;
    let { members, sorted } = entry;
    for (let i = 0; i < input.length; i += 2) {
      let score = parseInt(input[i]);
      let memberName = input[i + 1];

      if (!members.has(memberName)) {
        count++;
        sorted.push(memberName);
      }
      members.set(memberName, score);
    }
    sorted.sort((a, b) => members.get(a) - members.get(b));
    return resp.integer(count);
  },
  ZREMRANGEBYSCORE: (args) => {
    let key = args[0];
    if (!store.has(key)) return resp.errorMessage("Key doesn't exist");
    if (!args[1]) return resp.errorMessage("Need a minmimum value");
    let minScore = parseInt(args[1]);
    if (!args[2]) return resp.errorMessage("Need a maximum value");
    let maxScore = parseInt(args[2]);
    let entry = store.get(key);
    if (entry.type !== "zset") return resp.errorMessage("WrongType Operation");
    let { members, sorted } = entry;
    let removed = 0;
    let toRemove = [];
    sorted.forEach((object) => {
      if (members.get(object) >= minScore && members.get(object) <= maxScore) {
        members.delete(object);
        toRemove.push(object);
        removed++;
      }
    });
    entry.sorted = sorted.filter((obj) => !toRemove.includes(obj));

    return resp.integer(removed);
  },
  ZRANGE: (args) => {
    let key = args[0];

    if (!store.has(key)) {
      return resp.array([]);
    }

    let start = Number(args[1]);
    let stop = Number(args[2]);

    let entry = store.get(key);

    if (entry.type !== "zset") {
      return resp.errorMessage("WrongType Operation");
    }

    let { sorted } = entry;

    if (start < 0) start = sorted.length + start;
    if (stop < 0) stop = sorted.length + stop;

    let result = sorted.slice(start, stop + 1);

    return resp.arrays(result);
  },
};
const handlers = {
  ...listHandlers,
  ...setHandlers,
  ...hashHandlers,
  ...sortedSetHandlers,
  PING: (args) => {
    return resp.simpleString("PONG");
  },
  SET: (args) => {
    if (args[2] && args[2].toUpperCase() === "EX") {
      store.set(args[0], {
        data: args[1],
        expiresAt: Date.now() + parseInt(args[3]) * 1000,
      });
    } else store.set(args[0], { data: args[1], expiresAt: null });

    return resp.simpleString("OK");
  },
  GET: (args) => {
    const lookup = store.get(args[0]);
    if (!lookup) return resp.bulkString(null);
    let data = lookup.data;
    const expiresAt = lookup.expiresAt;
    if (expiresAt == null) {
      return resp.bulkString(data);
    }
    if (lookup) {
      let currentTime = Date.now();
      if (currentTime >= expiresAt) {
        store.delete(args[0]);
        return resp.bulkString(null);
      } else {
        return resp.bulkString(data);
      }
    }
  },
  DEL: (args) => {
    let count = 0;
    for (let i = 0; i < args.length; i++) {
      const lookup = store.has(args[i]);
      if (lookup) {
        store.delete(args[i]);
        count++;
      }
    }
    return resp.integer(count);
  },
  EXISTS: (args) => {
    let count = 0;
    args.forEach((key) => {
      if (store.has(key)) count++;
    });
    return resp.integer(count);
  },
  EXPIRE: (args) => {
    let lookup = store.has(args[0]);
    if (!lookup) return resp.integer(0);
    let value = store.get(args[0]);
    let expiresAt = Date.now() + parseInt(args[1]) * 1000;
    value.expiresAt = expiresAt;
    return resp.integer(1);
  },
  TTL: (args) => {
    let lookup = store.get(args[0]);
    if (!lookup) return resp.integer(-2);
    let expiryTime = store.get(args[0]).expiresAt;
    if (!expiryTime) return resp.integer(-1);
    let TimeToLive = (expiryTime - Date.now()) / 1000;
    return resp.integer(Math.ceil(TimeToLive));
  },
};

const resp = {
  arrays,
  bulkString,
  errorMessage,
  integer,
  simpleString,
};
function dispatcher(commands) {
  let handleFunc = commands[0].toUpperCase();
  if (!handlers[handleFunc]) return resp.errorMessage("unknown command");
  let args = commands.slice(1);
  return handlers[handleFunc](args);
}

function simpleString(string) {
  return `+${string}\r\n`;
}
function errorMessage(string) {
  return `-${string}\r\n`;
}
function integer(int) {
  return `:${int}\r\n`;
}
function bulkString(string) {
  if (string === null || string === undefined) return `$-1\r\n`;
  let length = string.length;
  return `$${length}\r\n${string}\r\n`;
}
function arrays(arr) {
  let length = arr.length;
  let output = "";
  arr.forEach((element) => {
    output = output + bulkString(element);
  });
  return `*${length}\r\n${output}`;
}

class Parser {
  constructor(onCommand) {
    this.onCommand = onCommand;
    this.buffer = "";
  }
  onCommand(commands) {
    dispatcher(commands);
    console.log(commands);
  }

  feed(chunk) {
    this.buffer += chunk.toString();
    while (this.buffer.length > 0) {
      if (this.buffer.indexOf("\r\n") === -1) {
        break;
      }
      let arrayCount = parseInt(
        this.buffer.slice(1, this.buffer.indexOf("\r\n")),
      );
      let pos = this.buffer.indexOf("\r\n") + 2;
      let commands = [];
      let incomplete = false;
      for (let i = 0; i < arrayCount; i++) {
        let lineEnd = this.buffer.indexOf("\r\n", pos);
        if (lineEnd === -1) {
          incomplete = true;
          break;
        }
        let stringLength = parseInt(this.buffer.slice(pos + 1, lineEnd));
        pos = lineEnd + 2;
        let command = this.buffer.slice(pos, pos + stringLength);
        pos = pos + stringLength + 2;
        commands.push(command);
      }
      if (incomplete) break;
      this.buffer = this.buffer.slice(pos);
      this.onCommand(commands);
    }
  }
}

server.listen(PORT, () => {
  console.log("server bound");
});
