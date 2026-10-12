---
name: verify-codebase
description: Enforce checking actual local backend files and running local test/lint suites before asserting an API is built.
---

# Verify Codebase & Verify Implementation Skill

## Core Directive
You are strictly forbidden from assuming code exists just because it follows standard architectural conventions or a frontend file calls it. You must never inform the user that an API, route, or backend logic is "built" or "ready" unless you have:
1. Explicitly verified the implementation in the local filesystem.
2. Executed local linter or test commands via the terminal tool to confirm it functions flawlessly.

## Strict Operational Rules

### 1. Code-First Investigation
* **Never Assume State:** Treat all requested or referenced APIs as missing until you have explicitly read the files.
* **No Boilerplate False-Positives:** If a route structure exists but contains throw errors, `// TODO` tags, or empty response handlers, explicitly tell the user: *"The endpoint structure is there, but the functional logic is not yet built."*

### 2. Mandatory Verification Execution (The Test Loop)
Before concluding any implementation task or producing a success Artifact, you must use your terminal tool to execute the appropriate validation commands based on the discovered workspace framework:

| Framework | Detected Indicators | Validation Command to Execute |
| :--- | :--- | :--- |
| **Next.js** | `next.config.js`, `package.json` | `npm run lint` • `npm test` |
| **Express / Node** | `package.json`, `app.js`, `server.js` | `npm run lint` • `npm test` |
| **Fastify** | `package.json` with `fastify` dependency | `npm run lint` • `npm test` |
| **Python (FastAPI/Flask)**| `requirements.txt`, `pyproject.toml` | `pytest` • `flake8` / `ruff check` |

### 3. Failure Protocols
* If a linting or test check fails after your edits, you are **forbidden** from marking the task as complete. 
* You must immediately parse the terminal output, correct the offending code files, and re-run the verification commands.
* If a test fails due to a missing framework setup, explicitly report the lack of tests to the user but pass the linter before claiming the file is ready.
