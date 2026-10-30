/**
 * The backup script, with Supabase replaced by fakes: where backups may be written, what the dump
 * covers, that the password stays out of errors, and that a damaged PDF is never saved as good.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backupFiles, DUMP_ARGS, listFiles, localFilePath, pgEnvironment, resolveBackupDir, restoreFiles } from "../scripts/backup.mjs";

const repo = resolve("/work/xlive-estimator");
const folders: string[] = [];

function tempFolder() {
  const folder = mkdtempSync(join(tmpdir(), "estimator-backup-"));
  folders.push(folder);
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

type Entry = { name: string; id: string | null; metadata?: { size: number } };

/** A fake Supabase client holding one bucket of files, keyed by object path. */
function fakeDb(files: Record<string, Buffer>, sha256: Record<string, string> = {}) {
  const folderEntries = (prefix: string): Entry[] => {
    const start = prefix ? `${prefix}/` : "";
    const names = new Map<string, Entry>();
    for (const [path, bytes] of Object.entries(files)) {
      if (!path.startsWith(start)) continue;
      const [name, ...rest] = path.slice(start.length).split("/");
      names.set(name, rest.length ? { name, id: null } : { name, id: path, metadata: { size: bytes.length } });
    }
    return [...names.values()];
  };
  const download = vi.fn(async (path: string) => ({ data: new Blob([new Uint8Array(files[path])]), error: null }));
  const upload = vi.fn<(path: string, bytes: Buffer, options: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
  return {
    download,
    upload,
    storage: {
      listBuckets: async () => ({ data: [{ name: "project-documents" }], error: null }),
      from: () => ({ list: async (prefix: string) => ({ data: folderEntries(prefix), error: null }), download, upload }),
    },
    from: () => ({ select: async () => ({ data: Object.entries(sha256).map(([storage_path, hash]) => ({ storage_path, sha256: hash })), error: null }) }),
  };
}

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("backup location", () => {
  it("refuses the public repository and anything inside it", () => {
    expect(() => resolveBackupDir(repo, repo)).toThrow("outside this repository");
    expect(() => resolveBackupDir(join(repo, "backups"), repo)).toThrow("outside this repository");
    expect(() => resolveBackupDir(join(repo, "estimator-web-app", "backups"), repo)).toThrow("outside this repository");
  });

  it("accepts a folder elsewhere, and defaults to one outside the repository", () => {
    expect(resolveBackupDir(resolve("/work/estimator-backups"), repo)).toBe(resolve("/work/estimator-backups"));
    expect(() => resolveBackupDir("")).not.toThrow();
  });
});

describe("database dump", () => {
  it("covers the app data and accounts, but not sign-in sessions or tokens", () => {
    expect(DUMP_ARGS).toEqual(expect.arrayContaining(["--data-only", "--table=public.*", "--table=private.*", "--table=auth.users", "--table=auth.identities"]));
    expect(DUMP_ARGS.join(" ")).not.toMatch(/sessions|refresh_tokens|--table=auth\.\*/);
  });

  it("splits the connection string so the password never reaches the command line", () => {
    expect(pgEnvironment("postgresql://postgres.ref:p%40ss%2Fword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres")).toEqual({
      PGHOST: "aws-0-eu-central-1.pooler.supabase.com",
      PGPORT: "5432",
      PGUSER: "postgres.ref",
      PGPASSWORD: "p@ss/word",
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
    });
  });

  it("rejects a connection string without a real password, and does not repeat what it was given", () => {
    expect(() => pgEnvironment("postgresql://postgres.ref:[YOUR-PASSWORD]@host:5432/postgres")).toThrow("no database password");
    expect(() => pgEnvironment("postgresql://postgres.ref@host:5432/postgres")).toThrow("no database password");
    expect(() => pgEnvironment("not a url with s3cret")).toThrow(/^SUPABASE_DB_URL could not be read/);
    expect(() => pgEnvironment("not a url with s3cret")).not.toThrow(/s3cret/);
  });
});

describe("stored files", () => {
  const pdf = Buffer.from("%PDF-1.7 drawing");
  const objectPath = "org/estimate/document.pdf";

  it("finds files in nested folders and reads every page of a long folder", async () => {
    const db = fakeDb({ [objectPath]: pdf, "org/other/second.pdf": pdf });
    expect((await listFiles(db.storage, "project-documents")).map((f: { path: string }) => f.path).sort()).toEqual([objectPath, "org/other/second.pdf"].sort());

    const pages = [Array.from({ length: 1000 }, (_, i) => ({ name: `${i}.pdf`, id: String(i), metadata: { size: 1 } })), [{ name: "last.pdf", id: "last", metadata: { size: 1 } }]];
    const list = vi.fn(async (_prefix: string, { offset }: { limit: number; offset: number }) => ({ data: pages[offset / 1000], error: null }));
    expect(await listFiles({ from: () => ({ list }) }, "bucket")).toHaveLength(1001);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("refuses an object name that would escape the backup folder", () => {
    expect(() => localFilePath(resolve("/backup/files"), "bucket", "../../outside.pdf")).toThrow("outside the backup folder");
  });

  it("saves a new file once and skips it on the next backup", async () => {
    const folder = tempFolder();
    const db = fakeDb({ [objectPath]: pdf }, { [objectPath]: hash(pdf) });

    expect(await backupFiles(db, folder)).toEqual({ copied: 1, kept: 0 });
    expect(readFileSync(join(folder, "files", "project-documents", objectPath))).toEqual(pdf);

    expect(await backupFiles(db, folder)).toEqual({ copied: 0, kept: 1 });
    expect(db.download).toHaveBeenCalledTimes(1);
  });

  it("fails, and saves nothing, when a file does not match its document record", async () => {
    const folder = tempFolder();
    const db = fakeDb({ [objectPath]: pdf }, { [objectPath]: hash(Buffer.from("a different file")) });

    await expect(backupFiles(db, folder)).rejects.toThrow("does not match its document record");
    expect(existsSync(join(folder, "files", "project-documents", objectPath))).toBe(false);
  });

  it("uploads saved files to their original paths, and leaves existing ones alone", async () => {
    const folder = tempFolder();
    const saved = join(folder, "files", "project-documents", ...objectPath.split("/"));
    mkdirSync(dirname(saved), { recursive: true });
    writeFileSync(saved, pdf);

    const db = fakeDb({});
    expect(await restoreFiles(db, folder)).toBe(1);
    expect(db.upload.mock.calls[0][0]).toBe(objectPath);
    expect(db.upload.mock.calls[0][2]).toEqual({ contentType: "application/pdf", upsert: false });

    db.upload.mockResolvedValueOnce({ error: { message: "The resource already exists" } });
    expect(await restoreFiles(db, folder)).toBe(0);
  });
});
