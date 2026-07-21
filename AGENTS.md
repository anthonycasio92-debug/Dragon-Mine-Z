# Dragon-Mine-Z

## Cursor Cloud specific instructions

### What this repo is
This is **not** a buildable application. It is a flat pack of ~37 ES5 JavaScript
files that run as **CustomNPCs** scripts inside a modded **Minecraft Java 1.20.1**
server (DragonMineZ mod + CustomNPCs + Fabled plugin). There is no `package.json`,
no build step, no `npm run dev`, and no automated test suite committed upstream.
The two `*.jar` files at the repo root are the CustomNPCs and Fabled binaries, not
a runnable server.

### Runtime engine: Nashorn ES5 (important gotcha)
The scripts execute on **Nashorn** using `Java.type(...)` interop to Minecraft /
Bukkit / DragonMineZ classes. They MUST stay ES5-compatible: no `let`/`const`,
arrow functions, template literals, `class`, or `Proxy`, or they will fail to load
on the live server. Note JDK 15+ (this VM has JDK 21) removed the built-in Nashorn,
so a standalone Nashorn engine is downloaded to `tools/nashorn/lib/` (git-ignored).

### Why there is no full end-to-end server run here
Standing up the real product requires a licensed Minecraft client (Mojang/Microsoft
auth), a Forge/Bukkit hybrid server, and the proprietary DragonMineZ mod, none of
which are present or runnable headless in this VM. Instead, validate scripts against
their actual engine with the dev harness below.

### Dev harness (lint / test / run)
Run from the repo root:
- `bash tools/validate/run.sh` — compile every `.js` on the real Nashorn engine
  (ES5 syntax/lint check) and run the demo.
- `bash tools/validate/run.sh --lint` — syntax-validate all scripts only.
- `bash tools/validate/run.sh --demo` — execute the real `Jump.js` `tick()` on
  Nashorn with mocked game APIs, asserting skill progression works.

The harness self-heals: it downloads the Nashorn/ASM jars if missing and lazily
compiles `tools/validate/NashornValidate.java`. The validator uses `compile()`
(not `eval()`), so it checks syntax without needing the absent mod classes.

### Known pre-existing issue
`RivalBattle Combat Core V3.js` fails Nashorn compilation: it has an unterminated
`/*` block comment (opened near line 469, file ends with no closing `*/`). The lint
step reports this as `FAIL` and exits non-zero. This is a genuine upstream bug in
the script, not an environment problem.
