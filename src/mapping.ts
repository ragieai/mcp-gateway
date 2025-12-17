import { and, eq } from "drizzle-orm";
import { collections, getDatabase } from "./db/index.js";
import { decrypt } from "./crypto.js";

export interface Mapper {
  hasCollection(organizationId: string, collection: string): Promise<boolean>;
  getCollection(organizationId: string, collection: string): Promise<CollectionRecord>;
}
export class CollectionRecord {
  constructor(
    public partition: string,
    public ragieApiKey: string,
    public allowedRoles: string[] | "*",
    public filters?: Record<string, unknown>
  ) {}
}

export class DatabaseMapper implements Mapper {
  private db: ReturnType<typeof getDatabase>;
  private encryptionKey: string;

  constructor(db: ReturnType<typeof getDatabase>, encryptionKey: string) {
    this.db = db;
    this.encryptionKey = encryptionKey;
  }

  async getCollection(organizationId: string, collection: string): Promise<CollectionRecord> {
    const result = await this.db
      .select({
        partition: collections.partition,
        ragieApiKey: collections.ragieApiKey,
        allowedRoles: collections.allowedRoles,
        filters: collections.filters,
      })
      .from(collections)
      .where(and(eq(collections.organizationId, organizationId), eq(collections.name, collection)))
      .limit(1);

    const record = result[0];
    if (!record) {
      throw new Error(`Collection ${collection} not found for organization ${organizationId}`);
    }

    const decryptedApiKey = await decrypt(record.ragieApiKey, this.encryptionKey);
    return new CollectionRecord(record.partition, decryptedApiKey, record.allowedRoles, record.filters ?? undefined);
  }

  async hasCollection(organizationId: string, collection: string): Promise<boolean> {
    const result = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.organizationId, organizationId), eq(collections.name, collection)))
      .limit(1);

    return result.length > 0;
  }
}
