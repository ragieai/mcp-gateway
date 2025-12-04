import { readFileSync } from "fs";
import { resolve } from "path";
import z from "zod";

/* eslint-disable no-unused-vars */
export interface Mapper {
  hasMapping(organizationId: string, collection: string): boolean;
  getPartition(organizationId: string, collection: string): string;
  getApiKey(organizationId: string, collection: string): string;
  getAllowedRoles(organizationId: string, collection: string): string[] | "*";
}
/* eslint-enable no-unused-vars */

export interface MapperConfig {
  ragieApiKey: string;
  strictApiKeys: boolean;
}

const CollectionMappingSchema = z.object({
  allowedRoles: z.union([z.array(z.string()), z.literal("*")]),
  partition: z.string(),
  apiKey: z.string(),
});

const CollectionRecordSchema = z.record(z.string(), CollectionMappingSchema);

const MappingSchema = z.record(z.string(), CollectionRecordSchema);

function readJsonFile<T>(filePath: string): T {
  try {
    const resolvedPath = resolve(filePath);
    const fileContents = readFileSync(resolvedPath, "utf-8");
    return JSON.parse(fileContents);
  } catch (error) {
    throw new Error(`Failed to read JSON file: ${String(error)}`);
  }
}

export class StrictMapper implements Mapper {
  private mapping: z.infer<typeof MappingSchema>;

  constructor(mapping: z.infer<typeof MappingSchema>) {
    this.mapping = mapping;
  }

  _getMappingOrThrow(organizationId: string, collection: string): z.infer<typeof CollectionMappingSchema> {
    const entry = this.mapping[organizationId];

    if (!entry) {
      throw new Error(`Organization ${organizationId} not found in mapping`);
    }

    const mapping = entry[collection];
    if (!mapping) {
      throw new Error(`Collection ${collection} not found in mapping`);
    }
    return mapping;
  }

  hasMapping(organizationId: string, collection: string): boolean {
    return this.mapping[organizationId]?.[collection] !== undefined;
  }

  getPartition(organizationId: string, collection: string): string {
    return this._getMappingOrThrow(organizationId, collection).partition;
  }

  getApiKey(organizationId: string, collection: string): string {
    return this._getMappingOrThrow(organizationId, collection).apiKey;
  }

  getAllowedRoles(organizationId: string, collection: string): string[] | "*" {
    return this._getMappingOrThrow(organizationId, collection).allowedRoles;
  }

  static load(mappingFile: string): StrictMapper {
    const json = readJsonFile(mappingFile);
    const mapping = MappingSchema.parse(json);
    return new StrictMapper(mapping);
  }
}

export function loadMapper(mappingFile: string): Mapper {
  try {
    return StrictMapper.load(mappingFile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new Error(`Mapping file validation failed: ${errorMessages}`);
    } else {
      throw error;
    }
  }
}
