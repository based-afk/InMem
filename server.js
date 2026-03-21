import net from "net";
const PORT = 6380;

const server = net.createServer((socket) => {
  console.log("client connected!");
  const parseInstance = new Parser((commands) => {
    console.log(commands);
  });
  socket.on("data", (data) => {
    let chunk = data.toString();
    parseInstance.feed(chunk);
    console.log(`Greeting from ${chunk}`);
    socket.write("+OK\r\n");
  });
});
const resp = {
  arrays,
  bulkString,
  errorMessage,
  integer,
  simpleString,
};

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
  if (string === null) return `$-1\r\n`;
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
