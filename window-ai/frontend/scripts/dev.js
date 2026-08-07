/* Start the Next frontend and FastAPI backend together for local development. */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(frontendRoot, "..");
const localPython = process.platform === "win32"
  ? path.join(backendRoot, ".venv", "Scripts", "python.exe")
  : path.join(backendRoot, ".venv", "bin", "python");
const pythonCommand = process.env.BETTERVIEW_PYTHON
  || (fs.existsSync(localPython) ? localPython : "python");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const apiPort = process.env.API_PORT || "8000";
const apiHealthUrl = `http://127.0.0.1:${apiPort}/health`;

const environment = {
  ...process.env,
  PYTHONPATH: process.env.PYTHONPATH
    ? `${backendRoot}${path.delimiter}${process.env.PYTHONPATH}`
    : backendRoot,
  DATABASE_URL: process.env.DATABASE_URL || "sqlite:///data/local.db",
};

// Keep the documented one-command local workflow usable for the saved
// estimate tables (including a fresh SQLite database).
const dbInit = spawnSync(pythonCommand, ["-m", "db.init_db"], {
  cwd: backendRoot,
  env: environment,
  stdio: "inherit",
});
if (dbInit.status !== 0) {
  process.exit(dbInit.status || 1);
}

const api = spawn(
  pythonCommand,
  ["-m", "uvicorn", "api.main:app", "--reload", "--host", "0.0.0.0", "--port", apiPort],
  { cwd: backendRoot, env: environment, stdio: "inherit" }
);

let shuttingDown = false;
let frontend = null;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForApi(attempts = 60) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(apiHealthUrl);
      if (response.ok) return;
    } catch {
      // FastAPI may still be importing modules or opening the database.
    }
    await sleep(250);
  }
  throw new Error(`FastAPI did not become ready at ${apiHealthUrl}`);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  api.kill();
  if (frontend) frontend.kill();
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

api.on("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    console.error(`FastAPI stopped with exit code ${code}.`);
    shutdown(code || 1);
  }
});

api.on("error", (error) => {
  console.error(`Could not start FastAPI with '${pythonCommand}': ${error.message}`);
  shutdown(1);
});

async function startFrontend() {
  try {
    console.log(`Waiting for FastAPI at ${apiHealthUrl}...`);
    await waitForApi();
    if (shuttingDown) return;

    frontend = spawn(npmCommand, ["run", "dev:next"], {
      cwd: frontendRoot,
      env: environment,
      stdio: "inherit",
      // Windows launches npm.cmd through the command shell.
      shell: process.platform === "win32",
    });

    frontend.on("error", (error) => {
      console.error(`Could not start Next.js: ${error.message}`);
      shutdown(1);
    });

    frontend.on("exit", (code) => {
      if (!shuttingDown && code !== 0) {
        console.error(`Next.js stopped with exit code ${code}.`);
        shutdown(code || 1);
      }
    });
  } catch (error) {
    console.error(error.message);
    shutdown(1);
  }
}

startFrontend();
