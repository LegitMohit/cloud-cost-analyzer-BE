import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "@cloud_cost_analyzer/env/server";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { loginCronService } from "./services/login-cron.service.js";

const app = express();
const PORT = env.PORT;

loginCronService.start();

// Middleware
app.use(helmet());
app.use(cookieParser());
app.use(
    cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
    })
);
app.use(express.json());

// Routes
app.use("/", routes);

// Error Handling
app.use(errorHandler);

// Root path
app.get("/", (_req, res) => {
    res.json({ message: "Cloud Cost Analyzer API is running!" });
});

const server = app.listen(PORT, () => {
    console.log(`[server]: API Server is running at http://localhost:${PORT}`);
});

const gracefulShutdown = () => {
    loginCronService.stop();
    server.close(() => {
        process.exit(0);
    });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default app;
