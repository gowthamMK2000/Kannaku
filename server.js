// Custom Next.js server (Claude Engineering Specification.md, Requirement B).
//
// Railway runs `node server.js` as a single, persistent process. That one
// process serves the Next.js app AND owns the long-lived Baileys WhatsApp
// socket — a normal serverless `next start` deploy can't keep the socket
// alive between requests, so we wrap Next in a plain http server instead.
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }).listen(port, hostname, () => {
      console.log(`> Kanakku ready on http://${hostname}:${port}`);
    });

    // Always initialize the shared state object, even when the bot itself is
    // disabled, so API routes reading global.__kanakku never see `undefined`.
    require("./lib/server/state");

    if (process.env.DISABLE_WHATSAPP_BOT === "1") {
      console.log("> WhatsApp bot disabled via DISABLE_WHATSAPP_BOT=1");
      return;
    }

    const { startBot } = require("./lib/server/bot");
    startBot();
  })
  .catch((err) => {
    console.error("> Failed to start Kanakku", err);
    process.exit(1);
  });
