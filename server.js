const express = require("express");
const { createServer: createViteServer } = require("vite");
const proxy = require("http2-proxy");

async function createServer() {
  const app = express();

  app.use("/_matrix*", (req, res, next) => {
    proxy.web(
      req,
      res,
      {
        hostname: "localhost",
        port: 8008,
      },
      (err) => {
        if (err) {
          console.error(
            `Error http://localhost:3000${req.originalUrl} -> http://localhost:8008${req.originalUrl}`,
            err
          );
          next(err);
        } else {
          console.log(
            `http://localhost:3000${req.originalUrl} -> http://localhost:8008${req.originalUrl}`
          );
        }
      }
    );
  });

  // Create vite server in middleware mode.
  const vite = await createViteServer({
    server: { middlewareMode: "html" },
  });
  // Use vite's connect instance as middleware
  app.use(vite.middlewares);

  app.listen(3000);
}

createServer()
  .then(() => {
    console.log("Listening on http://localhost:3000");
  })
  .catch((err) => console.error(err));
