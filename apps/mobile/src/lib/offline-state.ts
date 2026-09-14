import { z } from "zod";

export const offlineNoteSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().max(500),
    content: z.string().max(200_000),
    savedAt: z.string().datetime(),
  })
  .strict();
export const offlineSnapshotSchema = z
  .object({
    ownerId: z.string().uuid(),
    note: offlineNoteSchema,
  })
  .strict();
export type OfflineNote = z.infer<typeof offlineNoteSchema>;
export type OfflineSnapshot = z.infer<typeof offlineSnapshotSchema>;

const librarySchema = z
  .object({
    version: z.literal(1),
    ownerId: z.string().uuid().nullable(),
    notes: z.array(offlineNoteSchema).max(100),
  })
  .strict();
type Library = z.infer<typeof librarySchema>;
const emptyLibrary = (): Library => ({ version: 1, ownerId: null, notes: [] });

interface Storage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

/** Serialise storage writes so a late save cannot undo sign-out or removal. */
export class OfflineLibrary {
  private storage: Storage;
  private queue: Promise<unknown> = Promise.resolve();
  private library = emptyLibrary();
  private loaded = false;
  private account: string | null = null;
  private generation = 0;
  private invalidated = false;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  get notes(): OfflineNote[] {
    return this.invalidated ? [] : this.library.notes;
  }
  get ownerId(): string | null {
    return this.library.ownerId;
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }

  private async load() {
    if (this.loaded) return;
    const raw = await this.storage.read();
    if (raw) {
      if (raw.length > 500_000)
        throw new Error(
          "Offline library is too large. Remove downloaded notes to start again.",
        );
      this.library = librarySchema.parse(JSON.parse(raw));
    }
    this.loaded = true;
  }

  private async commit(next: Library) {
    const encoded = JSON.stringify(next);
    if (encoded.length > 500_000)
      throw new Error(
        "Offline library is full. Remove a downloaded note first.",
      );
    await this.storage.write(encoded);
    this.library = next;
    this.loaded = true;
  }

  read(): Promise<OfflineNote[]> {
    return this.run(async () => {
      await this.load();
      return this.notes;
    });
  }

  setAccount(ownerId: string | null): Promise<void> {
    if (ownerId !== null) z.string().uuid().parse(ownerId);
    this.account = ownerId;
    const generation = ++this.generation;
    this.invalidated = true;
    return this.run(async () => {
      await this.load();
      if (!ownerId || this.library.ownerId !== ownerId) {
        await this.commit({ version: 1, ownerId, notes: [] });
      }
      if (generation === this.generation) this.invalidated = false;
    });
  }

  save(input: OfflineSnapshot): Promise<void> {
    const snapshot = offlineSnapshotSchema.parse(input);
    const generation = this.generation;
    return this.run(async () => {
      await this.load();
      if (
        generation !== this.generation ||
        !this.account ||
        snapshot.ownerId !== this.account ||
        this.invalidated
      ) {
        throw new Error(
          "Your account changed. Reopen the note before saving it offline.",
        );
      }
      const notes = [
        snapshot.note,
        ...this.library.notes.filter((note) => note.id !== snapshot.note.id),
      ];
      if (notes.length > 100)
        throw new Error(
          "You can keep up to 100 offline notes. Remove one first.",
        );
      await this.commit({ version: 1, ownerId: this.account, notes });
    });
  }

  remove(id: string): Promise<void> {
    return this.run(async () => {
      await this.load();
      await this.commit({
        ...this.library,
        notes: this.library.notes.filter((note) => note.id !== id),
      });
    });
  }

  clear(): Promise<void> {
    ++this.generation;
    this.invalidated = true;
    return this.run(async () => {
      await this.commit({ version: 1, ownerId: this.account, notes: [] });
      this.invalidated = false;
    });
  }
}
