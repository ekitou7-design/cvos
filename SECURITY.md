# Security

CVOS is a single-user desktop-local web service, not an internet-facing SaaS.

- Bind only to 127.0.0.1. Validate Host and Origin. Mutations require a per-process session token. Do not enable CORS or reverse-proxy this service publicly.
- Data lives outside the source checkout; both nested and symlinked paths into the checkout are refused. Git ignores database, environment, key and runtime files as defense in depth.
- Provider credentials are encrypted with a local AES-256-GCM key and never returned by settings API or included in JSON backups. Local disk access can expose both key and database: use OS account protection and disk encryption.
- Imported documents are treated as text, never rendered as executable HTML. Model output is schema-validated before entering state. AI cannot apply profile edits: proposals require a separate user confirmation action. Prompt instructions reduce fabrication but cannot guarantee factual accuracy or resist every prompt injection; review suggestions and resumes.
- Cloud requests occur only for explicit AI actions. No analytics. User-selected cloud service privacy terms apply to transmitted content. API endpoints require HTTPS and redirects are refused.
- SQLite revision checks prevent silent overwrites between tabs. Restore validates the format and creates a local pre-restore snapshot. Exported JSON is unencrypted and contains personal data.
- Resume text is assembled from confirmed source fragments rather than model-authored facts. JD extraction requires source-supported fields. These controls do not determine whether user-provided source facts are true. Manual edits still require user review.
- Photos are normalized to local PNG; raw attachments and photos are not sent to model providers. Original attachments are downloaded as files, not executed or rendered as active HTML. Ordinary backups include these files and must be kept private.
- Office conversion operates on CVOS-generated DOCX, in an isolated temporary profile outside Git; commands use argument arrays without a shell. Actual PDF pages, A4 size and Chinese text completeness are checked before export. Keep LibreOffice and fonts updated.
- This does not defend against malware, other trusted local processes, physical disk access or hostile extensions in your browser. It is not a multi-user permission boundary.

For vulnerabilities, use GitHub private vulnerability reporting if enabled. Otherwise create a minimal issue asking for a private contact route without publishing secrets or exploit details. Never attach real user data or keys.
