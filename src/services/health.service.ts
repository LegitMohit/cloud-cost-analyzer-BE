export class HealthService {
    public async getHealthStatus() {
        return {
            status: "OK",
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    }
}
