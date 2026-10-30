// Backs up the live project to a folder on this computer, because Supabase keeps no automatic
// backups on the Free plan: the database rows with pg_dump, and the private PDFs through Storage.
// Run with `npm run backup`; `npm run backup:restore-files` uploads saved PDFs to a new project.
// See README "Backups". Secrets stay in .env.local and are never printed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = dirname(APP_DIR);
const DEFAULT_BACKUP_DIR = resolve(REPO_DIR, "..", "estimator-backups");
const LIST_PAGE = 1000;

/**
 * Rows only: the schema comes from the migrations saved beside the dump. Storage rows are recreated
 * when the files are uploaded again. Sign-in sessions and tokens are left out; people sign in again.
 */
export const DUMP_ARGS = ["--data-only", "--quote-all-identifiers", "--table=public.*", "--table=private.*", "--table=auth.users", "--table=auth.identities"];

function isInside(parent, child) {
  return relative(parent, child).split(sep)[0] !== "..";
}

/** The repository is public, so a backup must never be written inside it. */
export function resolveBackupDir(configured, repoDir = REPO_DIR) {
  const dir = resolve(configured || DEFAULT_BACKUP_DIR);
  if (isInside(repoDir, dir)) throw new Error("BACKUP_DIR must be outside this repository, which is public.");
  return dir;
}

/** pg_dump reads these from its environment, which keeps the password out of the process list. */
export function pgEnvironment(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("SUPABASE_DB_URL could not be read. Special characters in the password must be URL-encoded.");
  }
  if (!url.password || /YOUR-PASSWORD/i.test(url.password)) throw new Error("SUPABASE_DB_URL has no database password.");
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1) || "postgres",
    PGSSLMODE: "require",
  };
}

function pgDumpPath() {
  const installed = "C:\\Program Files\\PostgreSQL";
  if (process.platform !== "win32" || !existsSync(installed)) return "pg_dump";
  const [newest] = readdirSync(installed).sort((a, b) => Number(b) - Number(a));
  return newest ? join(installed, newest, "bin", "pg_dump.exe") : "pg_dump";
}

function dumpDatabase(backupDir, dbUrl) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const folder = join(backupDir, "database", stamp);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "data.sql");
  const run = spawnSync(pgDumpPath(), [...DUMP_ARGS, `--file=${file}`], { env: { ...process.env, ...pgEnvironment(dbUrl) }, encoding: "utf8" });
  const failure = run.error ? 'pg_dump was not found. Install the PostgreSQL 17 command line tools (README "Backups").' : run.status !== 0 ? `pg_dump failed: ${run.stderr.trim()}` : null;
  const complete = !failure && readFileSync(file, "utf8").includes('COPY "public"."estimates"');
  if (!complete) {
    rmSync(folder, { recursive: true, force: true });
    throw new Error(failure ?? "The dump does not contain the estimates table.");
  }
  cpSync(join(APP_DIR, "supabase", "migrations"), join(folder, "migrations"), { recursive: true });
  return folder;
}

/** Every file in a bucket. Storage lists one folder at a time, and a folder entry has no id. */
export async function listFiles(storage, bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw new Error(`Could not list ${bucket}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push({ path, size: entry.metadata?.size ?? null });
      else files.push(...(await listFiles(storage, bucket, path)));
    }
    if (data.length < LIST_PAGE) return files;
  }
}

/** Where a stored object is saved. Object names come from the database, so they are checked. */
export function localFilePath(root, bucket, objectPath) {
  const file = resolve(root, bucket, objectPath);
  if (!isInside(root, file)) throw new Error(`Refusing an object path outside the backup folder: ${objectPath}`);
  return file;
}

/** Saves files that are not in the backup yet. Stored PDFs never change, so each is fetched once. */
export async function backupFiles(db, backupDir) {
  const { data: buckets, error: bucketError } = await db.storage.listBuckets();
  if (bucketError) throw new Error(`Could not list buckets: ${bucketError.message}`);
  const { data: documents, error: documentError } = await db.from("documents").select("storage_path, sha256");
  if (documentError) throw new Error(`Could not read the document records: ${documentError.message}`);
  const fingerprints = new Map(documents.map((d) => [d.storage_path, d.sha256]));

  const root = join(backupDir, "files");
  let copied = 0;
  let kept = 0;
  for (const bucket of buckets) {
    for (const file of await listFiles(db.storage, bucket.name)) {
      const target = localFilePath(root, bucket.name, file.path);
      if (existsSync(target) && statSync(target).size === file.size) {
        kept += 1;
        continue;
      }
      const { data, error } = await db.storage.from(bucket.name).download(file.path);
      if (error) throw new Error(`Could not download ${file.path}: ${error.message}`);
      const bytes = Buffer.from(await data.arrayBuffer());
      const expected = fingerprints.get(file.path);
      if (expected && createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error(`${file.path} does not match its document record.`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      copied += 1;
    }
  }
  return { copied, kept };
}

/** Uploads saved files to the project in .env.local. A file already there is left alone. */
export async function restoreFiles(db, backupDir) {
  const root = join(backupDir, "files");
  let uploaded = 0;
  for (const bucket of readdirSync(root)) {
    const bucketRoot = join(root, bucket);
    for (const entry of readdirSync(bucketRoot, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = join(entry.parentPath, entry.name);
      const path = relative(bucketRoot, file).split(sep).join("/");
      const { error } = await db.storage.from(bucket).upload(path, readFileSync(file), { contentType: "application/pdf", upsert: false });
      if (error && !/already exists/i.test(error.message)) throw new Error(`Could not upload ${path}: ${error.message}`);
      if (!error) uploaded += 1;
    }
  }
  return uploaded;
}

async function main() {
  process.loadEnvFile(join(APP_DIR, ".env.local"));
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey, SUPABASE_DB_URL: dbUrl, BACKUP_DIR: configuredDir } = process.env;
  const restoring = process.argv.includes("--restore-files");
  if (!url || !secretKey || (!restoring && !dbUrl)) throw new Error('Set SUPABASE_DB_URL and SUPABASE_SECRET_KEY in .env.local (README "Backups").');

  const backupDir = resolveBackupDir(configuredDir);
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (restoring) {
    console.log(`Uploaded ${await restoreFiles(db, backupDir)} file(s).`);
    return;
  }
  const folder = dumpDatabase(backupDir, dbUrl);
  const { copied, kept } = await backupFiles(db, backupDir);
  console.log(`Backup complete.\n  Database: ${folder}\n  Files: ${copied} new, ${kept} already saved, in ${join(backupDir, "files")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
