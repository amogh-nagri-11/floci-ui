import "dotenv/config";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import s3 from "./routes/s3";
import sqs from "./routes/sqs";
import sns from "./routes/sns";
import lambda from "./routes/lambda";
import dynamodb from "./routes/dynamodb";
import cloudwatch from "./routes/cloudwatch";
import eks from "./routes/eks";
import rds from "./routes/rds";
import ec2 from "./routes/ec2";
import clouds from "./routes/clouds";
const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api/s3", s3);
app.route("/api/sqs", sqs);
app.route("/api/sns", sns);
app.route("/api/lambda", lambda);
app.route("/api/dynamodb", dynamodb);
app.route("/api/cloudwatch", cloudwatch);
app.route("/api/eks", eks);
app.route("/api/rds", rds);
app.route("/api/ec2", ec2);
app.route("/api/clouds", clouds);

// Serve static frontend files when public/ directory is present (production)
app.use("*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT ?? 3001);
export default { port, fetch: app.fetch };
