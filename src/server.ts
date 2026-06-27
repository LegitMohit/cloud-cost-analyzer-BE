import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "@cloud_cost_analyzer/env/server";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();
const PORT = env.PORT;

// Middleware
app.use(helmet());
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

app.listen(PORT, () => {
    console.log(`[server]: API Server is running at http://localhost:${PORT}`);
});

export default app;
