# Workly

Next.js App Router + React + Tailwind CSS v4 + react-icons. Cloudflare D1 stores tasks, custom columns, and attachment metadata. Cloudflare R2 stores image bytes. No task records are stored in localStorage.

## Run against Cloudflare

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `.env` now selects the real `workly-db` D1 database and `work-space` R2 bucket with `CLOUDFLARE_STORAGE_MODE=remote`. Existing local workspace records were copied to D1; the original local data remains in `.wrangler/`.

The required environment keys are documented in `.env.example`. Secrets remain server-side. In remote mode outside Workers, D1 uses Cloudflare's REST API and R2 uses signed S3 requests. R2 credentials are derived in memory from the account token using Cloudflare's documented token-ID/SHA-256 method, or explicit `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` can be supplied. Workers deployments use native D1/R2 bindings. Remote-mode development does not require Workers preview permission; D1 REST calls are subject to Cloudflare's API rate limits.

For an offline sandbox, set `CLOUDFLARE_STORAGE_MODE=local`, run `npm run db:migrate`, optionally `npm run db:seed`, then start the dev server. `wrangler.local.jsonc` preserves the original local bindings. Existing demo assignees are retained; registered accounts become actual members of the same workspace.

## Accounts

- `/signup`, `/login`, and `/reset-password` use D1-backed accounts. Signed-up accounts immediately access the shared workspace, as requested. Only the normalized email **admin@gmail.com** receives admin privileges at signup. The real admin account is not pre-created; sign up with that email and your own password.
- Passwords require at least 8 characters, uppercase, lowercase, a digit, and a special character. This policy applies on both client and server. Satisfied conditions turn green; confirmation has a red border until the passwords match.
- Passwords and recovery codes use salted scrypt hashes (`N=32768,r=8,p=3`). Random 256-bit session tokens are hashed in D1 and carried by HttpOnly, SameSite=Lax cookies, Secure in production.
- Server sessions have **no expiry**. Browser cookies use the supported 400-day maximum, renewed on authenticated API activity. Clearing site data or browser retention rules can require login again. Logout revokes the current session; password reset revokes all sessions for that account.
- `/admin` lets the designated admin set or generate per-account recovery codes. No email delivery is used. Give the code directly to the account owner. Codes are hashed, consumed once, and replaced when the admin issues a new code.
- Click the top-right profile icon to open `/settings`. Profile settings update the display name and optional R2 avatar (JPG/PNG/WebP/GIF up to 2 MB). General settings store the home page, initial task tab, and comfortable/compact table density per account. Email and role are not editable through this endpoint.
- Pages and data APIs both validate the session. Mutations check Origin; signup/login/reset are rate limited in D1. Optional `APP_URL` supplies the canonical HTTPS origin.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
node --env-file=.env scripts/check-auth.mjs
node --env-file=.env scripts/check-auth.mjs --prepare-ui
node scripts/check-column-summary.mjs
node scripts/check-timeline.mjs
node scripts/check-advanced-filters.mjs
node scripts/check-column-reorder.mjs
node scripts/check-task-features.mjs <python-executable>
node scripts/check-file-uploads.mjs
node scripts/check-bulk-tasks.mjs
node --env-file=.env scripts/smoke.mjs
npm run cf:check
node --env-file=.env scripts/check-auth.mjs --cleanup-ui
```

The task-features check uses an in-memory SQLite database and mocked storage; it creates no remote accounts or records. The smoke and auth checks require explicit authorization before use against a real workspace because they create temporary records. Development and production builds use Next.js's supported Webpack compiler because Turbopack's subprocesses and manifest writes fail intermittently on this Windows host.

## Cloudflare setup and deployment

OpenNext prints a Windows compatibility warning on native Windows. Run the Cloudflare packaging/deployment commands in Linux, WSL, or Linux CI for the supported production build environment. `npm run build` and `npm run lint` complete without warnings on the current Windows host.

```sh
npm run db:setup:remote
node scripts/activate-remote-storage.mjs
npm run db:migrate:remote
node --env-file=.env scripts/backfill-r2-links.mjs
```

Setup reuses the database by name and matches the R2 bucket against `R2_PUBLIC_URL`. The real database identity and bucket are already configured in `wrangler.jsonc`; rerunning setup does not create duplicates. The local-only placeholder remains isolated in `wrangler.local.jsonc`.

To deploy the application after obtaining Workers deployment permission:

```sh
npm run cf:deploy
```

The cloud database contains the migrated workspace. `db/seed.sql` is optional local demo data, separate from schema migrations. Accounts authenticate against this single shared workspace.

Files: JPG/PNG/WebP/GIF, PDF, TXT, and modern Office documents up to **2 MB per file**, validated server-side. File bytes are stored in R2, while D1 stores metadata, column identity, and the actual URL built from `R2_PUBLIC_URL`. Image thumbnails and the large zoomable viewer load that R2 URL directly. `/api/files/[id]` provides a compatible download route; legacy `/api/images` routes still work. Task and column writes use server-side validation and bound parameters. Signed R2 uploads include an explicit Content-Length so larger images do not fail with HTTP 411.

## Boards and reports

- `/my-work` shows the signed-in member's tasks; `/tasks` shows the team board; `/reports` contains team charts with Quick and Advanced Filters. The calendar month and selected Timeline determine the report's date scope.
- Tasks support multiple assignees. Each assigned member receives one completed-work count for a shared completed task; total task counts count each task once.
- Tasks can have one level of subtasks. Click the arrow beside a parent task's name to expand an inset table with its own column headers and an Add subtask row; type a name and press Enter. Tables are collapsed by default and can be collapsed again with the arrow. There is no separate + button on the parent row, and the task details/editor does not show the subtask panel. Each subtask has its own columns, assignees, status, files and updates; parent status does not change automatically. Filters retain the parent as context when a child matches, while report totals count each matching task or subtask once. The editor, calendar details and archive identify the parent.
- Moving a parent moves its children to the same group; children can be reordered within their parent. Archiving, restoring or duplicating a parent includes its children. A child archived separately before its parent remains archived when the parent is restored. Restoring a child whose parent is archived restores the parent and the children archived with it. Deleting a parent permanently deletes every child, including separately archived children, and their files/updates. Apply migration `0021_subtasks.sql` before running this version.
- Custom columns support Text, Number, Status, Date, Timeline, Checkbox, URL, Email, single Select, Multi-select, and Files. Type an option and press Enter to add it as a removable tag.
- Timeline uses an inclusive start/end range. Open a Timeline cell, select a start day and end day (including across months), then save. Single-day ranges and clearing the range are supported. Both the client and task API validate real dates and reject reversed/incomplete ranges; values are saved as `[YYYY-MM-DD, YYYY-MM-DD]` in D1 task custom data.
- Reports append a monthly Timeline calendar below the charts, with Monday–Sunday weeks and previous/next/current-month navigation. The selected month and Timeline column drive report totals, charts, and calendar together; tasks whose ranges overlap the month are counted once, with no separate due-date range filter. Multi-day events continue across week/month boundaries, with separate lanes for overlaps. Clicking an event opens a right-side drawer showing task details in table-column order, respecting hidden columns. Images open in the zoomable viewer; other attachments open their stored R2 links.
- Hovering or focusing a Timeline cell fades the dates into the inclusive day count: October 6–7 shows `2D`, while October 6 alone shows `1D`. Calendar Display options follow the month controls: select column headers and reorder them to choose primary/secondary event data, then Apply. Events use one line, such as `งานออกแบบ | Design`. This selection is saved in D1 board settings.
- Reports use stable vivid colors per member (solid for completed tasks, translucent for totals), with numbers above both completed and total bars. Export PDF, on the title row, captures the filtered report and selected calendar month into exactly one aspect-preserving A4 page, without the sidebar or export controls.
- The split Thai “ตัวกรอง” button opens Quick Filters from its text side and Advanced Filters from its arrow. Quick values apply immediately, with live counts, OR within a column and AND across columns, including relative date/Timeline presets. Advanced filters stage typed column/condition/value rules and AND/OR groups until Apply. Both modes work together on tasks and reports, including the selected calendar month, and Clear all restores the unfiltered scope.
- The sidebar collapses to an icon rail and remembers its state in browser storage. Icon links retain accessible names and titles; on small screens the expanded menu overlays the content. Task details use a two-column card grid, field icons, colored status/priority tags, owner chips, and inclusive Timeline durations. The editor follows actual visible column names, types, and order. Table statuses use compact colored labels instead of filling the entire cell.
- Large desktop layouts expand report content up to 2400 px. Text scales by 15% at viewport widths of 1920 px and by 30% from 2400 px, including QHD/2K (2560×1440), with wider navigation, task editors and detail drawers. Calendar event lanes scale with their text to avoid clipping. Smaller viewports retain their existing sizes.
- Task details and the editor show the actual group name and Details/Updates tabs. Updates support basic formatting, author/time, pagination, and editing/deleting by the author or an admin. New updates can include up to six PNG/JPG/WebP/GIF images, each up to 2 MB, including image-only posts. Images use R2 URLs and the zoomable viewer. Archiving preserves updates and images; deleting a task removes them. Apply migrations through `0021` before using the current version.
- Admin accounts are excluded from workspace member names, assignee choices, person filters, charts, member counts, and calendar assignee details. Admin profile/recovery screens use a generic administrator label; the account's permissions and existing task data remain intact.
- The column menu changes names/types, reorders columns, or permanently deletes a column after confirmation. Deletion clears its values from active and archived tasks and removes its attachments; there is no restore-column button. The task-name column is protected. Changing a column's presentation type remains separate from deleting it.
- Drag the column edge to resize between 80 and 800 pixels; focus the resize separator and press arrow keys for keyboard resizing. While dragging a header, an insertion line spans the table and the destination header shows Before/After according to the pointer position. Dropping uses that exact edge and retains hidden column positions. Order, visibility, type overrides, and widths are saved in D1.
- Assignee/select menus and column menus float above the table without increasing row/header height.
- Group membership and status are independent: changing status never moves a task automatically, and moving a task preserves its status. Groups can be created, renamed inline, colored, collapsed, and manually reordered. While editing a group name, Archive/Delete icons appear between its name and task count. Confirmation counts all active tasks in the group, including filtered-out tasks. Archived groups, including empty groups, can be restored from `/archive` with their tasks, updates, and files.
- Drag a row's number/grip to reorder tasks or move them between groups. Task ranks and group order persist in D1. Keyboard users can use Up/Down on a task grip, Ctrl+Up/Down to move across groups, and Up/Down on a group grip.
- Status columns have a proportional color summary in the final row. Number columns support units on either side and None/Sum/Average/Median/Min/Max/Count, saved in D1. Blank values are excluded from numeric calculations.
- The calendar, selects, project suggestions, and color picker use the application's dark popovers. Select task checkboxes before the # column to show the bottom toolbar in My Work and the team board. It supports Duplicate, Archive, Move, and Delete. Group headers select their displayed tasks, with a mixed state when partially selected. Deletion opens the app's confirmation dialog; CSV export has been removed. The overview page/menu has been removed; `/` redirects to `/my-work`.
- Duplication copies all task fields and creates independent R2 objects and links for attachments. Archiving retains the task and its files in D1/R2 while excluding it from boards and reports. `/archive`, linked above Help in the sidebar, supports searching archived tasks and restoring them to their original group, status, position, and files.
- Assignee, Select, and Multi-select popups support typed search, suggested options, removable selected tags, and keyboard selection. Project and custom select options have pencil buttons for editing names and colors. Renaming updates existing task values, including archived tasks.
- Add groups from the toolbar; use the + icon at the end of each table header to add columns. New tasks are created by typing in the bottom row and pressing Enter. Owner, status, date, priority, project, and quantity start blank. The server records the signed-in creator, so unassigned tasks remain visible in their My Work.
