import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the Minecraft Tiers frontend from the same Railway service as the API.
// This keeps the public site and API on one origin, so the frontend can call /api directly.
const frontendDist = path.resolve(process.cwd(), "artifacts/minecraft-queue/dist/public");
app.use(express.static(frontendDist));
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    res.sendFile(path.join(frontendDist, "index.html"), (error) => {
      if (error) next();
    });
    return;
  }
  next();
});

export default app;
