import { env } from "@cloud_cost_analyzer/env/server";

class LoginCronService {
    private intervalId: NodeJS.Timeout | null = null;

    start() {
        if (!env.LOGIN_EMAIL || !env.LOGIN_PASSWORD) {
            console.log("[login-cron] Skipped: LOGIN_EMAIL and LOGIN_PASSWORD are not set.");
            return;
        }

        const email = env.LOGIN_EMAIL;
        const password = env.LOGIN_PASSWORD;
        const apiUrl = env.LOGIN_API_URL ;
        const intervalMs = 345600000;

        const hit = async () => {
            try {
                const res = await fetch(apiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                const text = await res.text();
                console.log(`[login-cron] ${res.status} ${text}`);
            } catch (err) {
                console.error(`[login-cron] Error:`, err instanceof Error ? err.message : err);
            }
        };

        hit();
        this.intervalId = setInterval(hit, intervalMs);
        console.log(`[login-cron] Started: hitting ${apiUrl} every ${intervalMs}ms`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("[login-cron] Stopped");
        }
    }
}

export const loginCronService = new LoginCronService();
