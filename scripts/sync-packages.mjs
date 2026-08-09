import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";

const packages = ["config", "db", "env"];

for (const pkg of packages) {
    const src = join(process.cwd(), "packages", pkg, "dist");
    const dest = join(process.cwd(), "node_modules", "@cloud_cost_analyzer", pkg, "dist");

    mkdirSync(dest, { recursive: true });

    const files = [
        "server.js",
        "server.d.ts",
        "web.js",
        "web.d.ts",
    ];

    for (const file of files) {
        const srcFile = join(src, file);
        const destFile = join(dest, file);
        try {
            copyFileSync(srcFile, destFile);
        } catch {
            // ignore missing files
        }
    }

    console.log(`Synced @cloud_cost_analyzer/${pkg}`);
}
