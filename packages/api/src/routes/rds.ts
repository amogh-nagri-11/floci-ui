import { Hono } from "hono";
import { rdsService } from "../services/rds";

const app = new Hono();

app.get("/instances", async (c) => {
  return c.json(await rdsService.listInstances());
});

app.get("/instances/:identifier", async (c) => {
  return c.json(await rdsService.describeInstance(c.req.param("identifier")));
});

app.get("/snapshots", async (c) => {
  return c.json(await rdsService.listSnapshots(c.req.query("instanceIdentifier")));
});

app.post("/snapshots", async (c) => {
  const body = await c.req.json<{
    instanceIdentifier: string;
    snapshotIdentifier?: string;
  }>();
  if (!body.instanceIdentifier) {
    return c.json({ error: "instanceIdentifier is required" }, 400);
  }
  const snapshotIdentifier =
    body.snapshotIdentifier?.trim() ||
    `${body.instanceIdentifier}-snapshot-${Date.now()}`;
  return c.json(
    await rdsService.createSnapshot(body.instanceIdentifier, snapshotIdentifier),
    201,
  );
});

export default app;
