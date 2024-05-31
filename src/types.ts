import { Redis } from "@upstash/redis";

export type Event = {
  time?: number;
  [key: string]: string | number | boolean | undefined;
};

export class Key {
  constructor(public readonly prefix: string, public readonly table: string, public readonly bucket: number) {}

  public toString() {
    return [this.prefix, this.table, this.bucket].join(":");
  }
  static fromString(key: string) {
    const [prefix, table, bucket] = key.split(":");
    return new Key(prefix, table, parseInt(bucket));
  }
}

export type Window = `${number}${"s" | "m" | "h" | "d"}`;

export type AnalyticsConfig = {
  redis: Redis;
  /**
   * Configure the bucket size for analytics. All events inside the window will be stored inside
   * the same bucket. This reduces the number of keys that need to be scanned when aggregating
   * and reduces your cost.
   *
   * Must be either a string in the format of `1s`, `2m`, `3h`, `4d` or a number of milliseconds.
   */
  window: Window | number;
  prefix?: string;

  /**
   * Configure the retention period for analytics. All events older than the retention period will
   * be deleted. This reduces the number of keys that need to be scanned when aggregating.
   *
   * Can either be a string in the format of `1s`, `2m`, `3h`, `4d` or a number of milliseconds.
   * 0, negative or undefined means that the retention is disabled.
   *
   * @default Disabled
   *
   * Buckets are evicted when they are read, not when they are written. This is much cheaper since
   * it only requires a single command to ingest data.
   */
  retention?: Window | number
};

interface AggregateTime {
  time: number;
}

interface AggregateGeneric {
  [someFieldName: string]: {
    [someFieldValue: string]: number;
  };
}

export type Aggregate = AggregateTime & AggregateGeneric;

// value of the success field coming from lua
// 1 represents true, null represents false
export type RawSuccessResponse = 1 | null
export type SuccessResponse = RawSuccessResponse | string
