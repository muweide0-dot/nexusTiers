import { Router, type Request, type Response } from "express";
import {
  closeQueue,
  getLeaderboard,
  getQueue,
  getState,
  joinQueue,
  nextTicket,
  openQueue,
  playerProfile,
  queueOverview,
  setupServer,
  skipTicket,
  submitResult,
  verifyAccount,
} from "../lib/nexus";

const router = Router();

function kitParam(req: Request) {
  return String(req.params.kit);
}

function sendError(res: Response, error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed";
  res.status(status).json({ error: message });
}

router.get("/leaderboard", async (_req, res) => {
  res.json(await getLeaderboard());
});

router.get("/queues", async (_req, res) => {
  const state = await getState();
  res.json(Object.values(state.queues).map(queueOverview));
});

router.get("/queues/:kit", async (req, res) => {
  const state = await getState();
  const queue = getQueue(state, kitParam(req));
  if (!queue) {
    res.status(404).json({ error: "Queue not found" });
    return;
  }
  res.json({
    ...queue,
    count: queue.entries.length,
    max: 20,
  });
});

router.post("/queues/:kit", async (req, res) => {
  try {
    const entry = await joinQueue(req.body, kitParam(req));
    res.status(201).json(entry);
  } catch (error) {
    sendError(res, error, 409);
  }
});

router.post("/queues/:kit/open", async (req, res) => {
  try {
    const queue = await openQueue(req.body, kitParam(req));
    res.json({
      message: `${queue.label} queue opened`,
      queue: { ...queue, count: queue.entries.length, max: 20 },
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/queues/:kit/close", async (req, res) => {
  try {
    const queue = await closeQueue(req.body, kitParam(req));
    res.json({
      message: `${queue.label} queue closed`,
      queue: { ...queue, count: queue.entries.length, max: 20 },
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/queues/:kit/next", async (req, res) => {
  try {
    res.json(await nextTicket(req.body, kitParam(req)));
  } catch (error) {
    sendError(res, error, 409);
  }
});

router.post("/queues/:kit/skip", async (req, res) => {
  try {
    const queue = await skipTicket(req.body, kitParam(req));
    res.json({ ...queue, count: queue.entries.length, max: 20 });
  } catch (error) {
    sendError(res, error, 409);
  }
});

router.post("/verification", async (req, res) => {
  try {
    res.status(201).json(await verifyAccount(req.body));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/waitlist", async (req, res) => {
  try {
    const entry = await joinQueue(req.body, String(req.body.kit));
    res.status(201).json(entry);
  } catch (error) {
    sendError(res, error, 409);
  }
});

router.post("/results", async (req, res) => {
  try {
    res.status(201).json(await submitResult(req.body));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/players/:ign/tiers", async (req, res) => {
  try {
    res.json(await playerProfile(String(req.params.ign)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/setup", async (req, res) => {
  try {
    res.json(await setupServer(req.body));
  } catch (error) {
    sendError(res, error, 502);
  }
});

router.get("/activity", async (_req, res) => {
  const state = await getState();
  res.json(state.activity);
});

export default router;