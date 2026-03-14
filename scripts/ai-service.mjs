import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const runtimeDir = join(rootDir, ".runtime");
const aiServiceDir = join(rootDir, "tools", "chatbi-ai-service");
const aiVenvDir = join(runtimeDir, "venv", "chatbi-ai-service");
const isWindows = process.platform === "win32";
const pythonPath = isWindows ? join(aiVenvDir, "Scripts", "python.exe") : join(aiVenvDir, "bin", "python");
const command = process.argv[2] ?? "help";

main().catch((error) => {
  console.error(`[ai-service] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  if (!existsSync(pythonPath)) {
    throw new Error(`python venv not found: ${pythonPath}. run npm run stack:init first`);
  }
  switch (command) {
    case "dev":
      await runForeground(pythonPath, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "18180", "--app-dir", "tools/chatbi-ai-service"], rootDir);
      return;
    case "test":
      await runForeground(pythonPath, ["-m", "pytest", "tools/chatbi-ai-service/tests"], rootDir);
      return;
    case "cli":
      await runForeground(pythonPath, ["-m", "app.cli", ...process.argv.slice(3)], rootDir);
      return;
    default:
      console.log("node scripts/ai-service.mjs <dev|test|cli>");
  }
}

function runForeground(commandName, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(commandName, args, {
      cwd,
      stdio: "inherit",
      shell: false,
      env: process.env
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${commandName} ${args.join(" ")} failed with exit code ${code}`));
    });
    proc.on("error", rejectPromise);
  });
}
