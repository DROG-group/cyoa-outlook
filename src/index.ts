import express from "express";
import { config } from "./config.js";
import { actionRouter } from "./routes/action.js";
import { startRouter } from "./routes/start.js";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", actionRouter);
app.use("/api", startRouter);

app.listen(config.port, () => {
  console.log(`cyoa-outlook listening on port ${config.port}`);
});

export { app };
