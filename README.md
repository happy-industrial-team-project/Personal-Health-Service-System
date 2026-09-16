# Personal Health Service System — Local Demo

This package runs the interactive UI demo entirely on your own computer. The browser address will be `http://localhost:3000`.

## Before the presentation

1. Install Node.js 22 or later from <https://nodejs.org/>.
2. Extract this ZIP file to a normal folder. Do not run it from inside the ZIP preview.
3. Double-click `START_DEMO.bat`.
4. On the first run, keep an internet connection available while dependencies are installed.
5. Wait for the browser to open at `http://localhost:3000`.

Run the demo once before presentation day. After the first successful setup, the dependencies remain in the extracted folder and the demo can normally start without reinstalling them.

## During the presentation

- Keep the command window open.
- Present the browser tab at `http://localhost:3000`.
- Use the left navigation to demonstrate records, trends, permissions, access logs, and account security.
- Buttons and forms provide simulated interactions using fictional data.

## Stop the demo

Return to the command window, press `Ctrl+C`, and confirm if prompted.

## Manual start

If the one-click launcher cannot be used, open PowerShell in this folder and run:

```powershell
node tools/pnpm/bin/pnpm.mjs install --frozen-lockfile
node tools/pnpm/bin/pnpm.mjs run dev
```

Then open <http://localhost:3000>.

## Notes

- This is a front-end course project demo. It does not connect to a real hospital system or production database.
- All patient names and health records are fictional.
- A portable copy of pnpm is included in `tools/pnpm`, so pnpm does not need to be installed globally.
- If port 3000 is already in use, close the other local development server before starting this demo.
