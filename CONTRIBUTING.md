# Contributing

Use Node.js 24.14+ (24.x). Install LibreOffice and Noto Sans CJK SC fonts (Ubuntu: `sudo apt-get install libreoffice-writer fonts-noto-cjk`). Run `npm ci`, `npm run dev`, and `npm run check`. Use `CVOS_SOFFICE` for a custom executable.

Keep the application local first, dependencies purposeful, and facts separate from AI suggestions. Every AI profile change must remain reviewable and explicitly confirmed. Test with invented examples only. Data directories, personal exports, screenshots with user facts, provider keys, `.env`, and SQLite files must never enter Git history.

Open an issue describing a reproducible problem or proposed change; submit a focused pull request with validation results. Do not add telemetry or cloud storage defaults. MIT contributions; dependencies retain their own licenses.
