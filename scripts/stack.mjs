import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const runtimeDir = join(rootDir, ".runtime");
const logsDir = join(runtimeDir, "logs");
const stateFile = join(runtimeDir, "stack-state.json");

const backendPort = Number(process.env.CHATBI_API_PORT ?? "18080");
const frontendDevPort = Number(process.env.CHATBI_FRONTEND_PORT ?? "5173");
const frontendPreviewPort = Number(process.env.CHATBI_SHOWCASE_PORT ?? "4173");
const startupTimeoutMs = Number(process.env.CHATBI_STACK_START_TIMEOUT_MS ?? "120000");
const startupPollMs = Number(process.env.CHATBI_STACK_START_POLL_MS ?? "1000");
const startupVerboseEvery = Number(process.env.CHATBI_STACK_VERBOSE_EVERY ?? "5");

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const mvnCommand = isWindows ? "mvn.cmd" : "mvn";

const command = process.argv[2] ?? "help";

ensureDir(runtimeDir);
ensureDir(logsDir);

main().catch((error) => {
  console.error(`[stack] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  switch (command) {
    case "init":
      await initStack();
      return;
    case "dev":
      await startStack("dev");
      return;
    case "showcase":
      await startStack("showcase");
      return;
    case "test":
      await runFullStackTests();
      return;
    case "stop":
      await stopStack();
      return;
    default:
      printHelp();
  }
}

async function initStack() {
  console.log("[stack] install npm dependencies");
  await runForeground(npmCommand, ["install", "--no-audit", "--no-fund"], { cwd: rootDir });
  console.log("[stack] compile backend modules");
  await runForeground(mvnCommand, ["-f", "tools/pom.xml", "-pl", "chatbi-app-server", "-am", "test-compile"], { cwd: rootDir });
  console.log("[stack] install playwright chromium");
  await runForeground(npmCommand, ["exec", "playwright", "install", "chromium"], { cwd: rootDir });
  console.log("[stack] init complete");
}

async function startStack(mode) {
  await stopStack({ silent: true });
  const profile = mode === "showcase" ? "showcase" : "dev";
  const storageDir = join(runtimeDir, "storage", profile);
  const runStamp = formatRunStamp();
  if (mode === "showcase") {
    resetDir(storageDir);
    console.log("[stack] build frontend for showcase");
    await runForeground(npmCommand, ["run", "build"], { cwd: rootDir });
  } else {
    ensureDir(storageDir);
  }

  const backendLog = join(logsDir, `backend-${profile}-${runStamp}.log`);
  const frontendLog = join(logsDir, `frontend-${profile}-${runStamp}.log`);
  console.log(`[stack] profile      ${profile}`);
  console.log(`[stack] storage      ${storageDir}`);
  console.log(`[stack] backend log  ${backendLog}`);
  console.log(`[stack] frontend log ${frontendLog}`);

  const result = await startStackAttempt({ mode, profile, storageDir, backendLog, frontendLog });

  writeState({
    mode,
    backend: { pid: result.backendPid, log: backendLog },
    frontend: { pid: result.frontendPid, log: frontendLog },
    backendUrl: result.backendUrl,
    frontendUrl: result.frontendUrl
  });

  console.log(`[stack] ${mode} ready`);
  console.log(`[stack] backend  ${result.backendUrl}`);
  console.log(`[stack] frontend ${result.frontendUrl}/#/docs`);
  console.log(`[stack] stop with: npm run stack:stop`);
}

async function runFullStackTests() {
  await initStack();
  console.log("[stack] run backend tests");
  await runForeground(mvnCommand, ["-f", "tools/pom.xml", "-pl", "chatbi-app-server", "-am", "test"], { cwd: rootDir });
  console.log("[stack] run frontend typecheck");
  await runForeground(npmCommand, ["run", "typecheck"], { cwd: rootDir });
  console.log("[stack] run frontend unit tests");
  await runForeground(npmCommand, ["run", "test"], { cwd: rootDir });
  await startStack("showcase");
  const state = readState();
  try {
    console.log("[stack] run playwright smoke tests");
    await runForeground(
      npmCommand,
      ["exec", "playwright", "test"],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          CHATBI_E2E_BASE_URL: state?.frontendUrl ?? `http://127.0.0.1:${frontendPreviewPort}`
        }
      }
    );
  } finally {
    await stopStack({ silent: true });
  }
  console.log("[stack] full stack test complete");
}

async function stopStack(options = {}) {
  const state = readState();
  if (!state) {
    await freeKnownPorts(options);
    if (!options.silent) {
      console.log("[stack] nothing to stop");
    }
    return;
  }
  if (state.frontend?.pid) {
    await killPid(state.frontend.pid);
  }
  if (state.backend?.pid) {
    await killPid(state.backend.pid);
  }
  await freeKnownPorts(options);
  rmSync(stateFile, { force: true });
  if (!options.silent) {
    console.log("[stack] stopped");
  }
}

async function spawnDetached(name, commandName, args, logFile) {
  ensureDir(dirname(logFile));
  writeFileSync(logFile, `[stack] starting ${name} at ${new Date().toISOString()}\n`);
  if (isWindows) {
    const pid = await startBackgroundProcessWindows(commandName, args, logFile);
    return { pid };
  }
  const outFd = openSync(logFile, "a");
  const proc = spawnProcess(commandName, args, {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    env: process.env
  });
  proc.unref();
  if (!proc.pid) {
    throw new Error(`failed to start ${name}`);
  }
  return { pid: proc.pid };
}

async function waitForUrl(url, label, options = {}) {
  const startedAt = Date.now();
  let lastError = "not started";
  let attempts = 0;
  while (Date.now() - startedAt < startupTimeoutMs) {
    attempts += 1;
    if (options.logFile && hasStartupFailure(options.logFile)) {
      throw new Error(`${label} failed during startup, see ${options.logFile}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempts === 1 || attempts % startupVerboseEvery === 0) {
      console.log(`[stack] waiting for ${label} (${Math.round((Date.now() - startedAt) / 1000)}s): ${lastError}`);
    }
    await sleep(startupPollMs);
  }
  throw new Error(`${label} failed to start: ${lastError}`);
}

function runForeground(commandName, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawnProcess(commandName, args, {
      cwd: options.cwd ?? rootDir,
      stdio: "inherit",
      env: options.env ?? process.env
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

function spawnProcess(commandName, args, options) {
  if (isWindows) {
    return spawn("cmd.exe", ["/d", "/s", "/c", toShellCommand(commandName, args)], {
      ...options,
      shell: false
    });
  }
  return spawn(commandName, args, {
    ...options,
    shell: false
  });
}

async function killPid(pid) {
  if (!pid) {
    return;
  }
  if (isWindows) {
    await runForeground("taskkill", ["/pid", String(pid), "/t", "/f"], { cwd: rootDir }).catch(() => undefined);
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // ignore missing process
  }
}

function printHelp() {
  console.log(`chatbi stack commands:
  node scripts/stack.mjs init
  node scripts/stack.mjs dev
  node scripts/stack.mjs showcase
  node scripts/stack.mjs test
  node scripts/stack.mjs stop`);
}

function readState() {
  if (!existsSync(stateFile)) {
    return null;
  }
  return JSON.parse(readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function resetDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function normalizePath(value) {
  return resolve(value).replace(/\\/g, "/");
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function toShellCommand(commandName, args) {
  return [quoteShellArg(commandName), ...args.map((arg) => quoteShellArg(arg))].join(" ");
}

function quoteShellArg(value) {
  if (!value.includes(" ") && !value.includes('"')) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function startBackgroundProcessWindows(commandName, args, logFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    const cmdLine = `${toShellCommand(commandName, args)} >> "${normalizePath(logFile)}" 2>&1`;
    const psArgs = ["/d", "/s", "/c", cmdLine].map((arg) => `'${arg.replace(/'/g, "''")}'`).join(", ");
    const script = [
      `$wd='${normalizePath(rootDir)}'`,
      `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList @(${psArgs}) -WorkingDirectory $wd -PassThru`,
      "Write-Output $p.Id"
    ].join("; ");

    const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      cwd: rootDir,
      shell: false,
      stdio: ["ignore", "pipe", "inherit"],
      env: process.env
    });
    let output = "";
    proc.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    proc.on("error", rejectPromise);
    proc.on("exit", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`failed to start background process (${commandName})`));
        return;
      }
      const pid = Number(output.trim());
      if (!pid) {
        rejectPromise(new Error(`background process (${commandName}) did not return a pid`));
        return;
      }
      resolvePromise(pid);
    });
  });
}

async function startStackAttempt({ mode, profile, storageDir, backendLog, frontendLog }) {
  const frontendArgs =
    mode === "showcase"
      ? ["exec", "vite", "preview", "--", "--host", "127.0.0.1", "--port", String(frontendPreviewPort), "--strictPort"]
      : ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(frontendDevPort), "--strictPort"];
  const frontendUrl = mode === "showcase" ? `http://127.0.0.1:${frontendPreviewPort}` : `http://127.0.0.1:${frontendDevPort}`;
  const backendUrl = `http://127.0.0.1:${backendPort}`;

  try {
    return await launchAndWait({
      storageDir,
      backendLog,
      frontendLog,
      frontendArgs,
      frontendUrl,
      backendUrl
    });
  } catch (error) {
    const flywayMismatch = hasFlywayChecksumMismatch(backendLog);
    if (flywayMismatch) {
      console.warn(`[stack] detected incompatible local runtime database for ${profile}, resetting ${storageDir} and retrying once`);
      await freeKnownPorts();
      resetDir(storageDir);
      return await launchAndWait({
        storageDir,
        backendLog,
        frontendLog,
        frontendArgs,
        frontendUrl,
        backendUrl
      });
    }
    throw error;
  }
}

async function launchAndWait({ storageDir, backendLog, frontendLog, frontendArgs, frontendUrl, backendUrl }) {
  const backendJvmArg = `-Dapp.storage.base-dir=${normalizePath(storageDir)}`;
  let backendProc = null;
  let frontendProc = null;
  try {
    console.log("[stack] starting backend process");
    backendProc = await spawnDetached(
      "backend",
      mvnCommand,
      [
        "-f",
        "tools/pom.xml",
        "-pl",
        "chatbi-app-server",
        "-am",
        "org.springframework.boot:spring-boot-maven-plugin:run",
        `-Dspring-boot.run.jvmArguments=${backendJvmArg}`
      ],
      backendLog
    );
    console.log(`[stack] backend pid ${backendProc.pid}`);

    console.log("[stack] starting frontend process");
    frontendProc = await spawnDetached("frontend", npmCommand, frontendArgs, frontendLog);
    console.log(`[stack] frontend pid ${frontendProc.pid}`);

    await waitForUrl(`${backendUrl}/api/v1/health`, "backend", { logFile: backendLog });
    await waitForUrl(`${frontendUrl}/#/docs`, "frontend", { logFile: frontendLog });
    const resolvedBackendPid = (await findPidsByPort(backendPort))[0] ?? backendProc.pid;
    const resolvedFrontendPid =
      (await findPidsByPort(frontendUrl.includes(String(frontendPreviewPort)) ? frontendPreviewPort : frontendDevPort))[0] ??
      frontendProc.pid;

    return {
      backendPid: resolvedBackendPid,
      frontendPid: resolvedFrontendPid,
      backendUrl,
      frontendUrl
    };
  } catch (error) {
    console.error(`[stack] startup failed: ${error instanceof Error ? error.message : String(error)}`);
    printLogTail("backend", backendLog);
    printLogTail("frontend", frontendLog);
    if (frontendProc?.pid) {
      await killPid(frontendProc.pid);
    }
    if (backendProc?.pid) {
      await killPid(backendProc.pid);
    }
    await freeKnownPorts({ silent: true });
    throw error;
  }
}

function hasFlywayChecksumMismatch(logFile) {
  if (!existsSync(logFile)) {
    return false;
  }
  const content = readFileSync(logFile, "utf8");
  return content.includes("FlywayValidateException") || content.includes("Migration checksum mismatch");
}

function hasStartupFailure(logFile) {
  if (!existsSync(logFile)) {
    return false;
  }
  const content = readFileSync(logFile, "utf8");
  return (
    content.includes("BUILD FAILURE") ||
    content.includes("APPLICATION FAILED TO START") ||
    content.includes("Failed to execute goal") ||
    content.includes("Process terminated with exit code: 1") ||
    /Port \d+ is already in use/.test(content)
  );
}

function printLogTail(name, logFile, lineCount = 40) {
  if (!existsSync(logFile)) {
    console.error(`[stack] ${name} log missing: ${logFile}`);
    return;
  }
  const content = readFileSync(logFile, "utf8");
  const tail = content
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-lineCount)
    .join("\n");
  console.error(`[stack] ${name} log tail (${logFile})`);
  if (tail) {
    console.error(tail);
  } else {
    console.error("[stack] <empty log>");
  }
}

async function freeKnownPorts(options = {}) {
  const ports = [backendPort, frontendDevPort, frontendPreviewPort];
  const killed = new Set();
  for (const port of ports) {
    const pids = await findPidsByPort(port);
    for (const pid of pids) {
      if (killed.has(pid)) {
        continue;
      }
      killed.add(pid);
      if (!options.silent) {
        console.log(`[stack] reclaim port ${port} from pid ${pid}`);
      }
      await killPid(pid).catch(() => undefined);
    }
  }
}

async function findPidsByPort(port) {
  try {
    if (isWindows) {
      const output = await runCapture("netstat", ["-ano", "-p", "tcp"], { cwd: rootDir });
      return Array.from(
        new Set(
          output
            .split(/\r?\n/)
            .map((line) => {
              const match = line.match(new RegExp(`^\\s*TCP\\s+[^\\s]+:${port}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)\\s*$`, "i"));
              return match ? Number(match[1]) : Number.NaN;
            })
            .filter((pid) => Number.isInteger(pid) && pid > 0)
        )
      );
    }
    const output = await runCapture("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { cwd: rootDir });
    return Array.from(
      new Set(
        output
          .split(/\r?\n/)
          .map((item) => Number(item.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0)
      )
    );
  } catch {
    return [];
  }
}

function runCapture(commandName, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawnProcess(commandName, args, {
      cwd: options.cwd ?? rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }
      rejectPromise(new Error(`${commandName} ${args.join(" ")} failed with exit code ${code}: ${stderr.trim()}`));
    });
    proc.on("error", rejectPromise);
  });
}

function formatRunStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
