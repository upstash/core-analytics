import { Redis } from "@upstash/redis";

export type Event = {
  time?: number;
  [key: string]: string | number | boolean | undefined;
};

class Key {
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
  retention?: Window | number;
};

export class Analytics {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly bucketSize: number;
  private readonly retention?: number;

  constructor(config: AnalyticsConfig) {
    this.redis = config.redis;
    this.prefix = config.prefix ?? "@upstash/analytics";
    this.bucketSize = this.parseWindow(config.window);
    this.retention = config.retention ? this.parseWindow(config.retention) : undefined;
  }

  private validateTableName(table: string) {
    const regex = /^[a-zA-Z0-9_-]+$/;
    if (!regex.test(table)) {
      throw new Error(
        `Invalid table name: ${table}. Table names can only contain letters, numbers, dashes and underscores.`,
      );
    }
  }

  /**
   * Parses the window string into a number of milliseconds
   */
  private parseWindow(window: Window | number): number {
    if (typeof window === "number") {
      if (window <= 0) {
        throw new Error(`Invalid window: ${window}`);
      }
      return window;
    }
    const regex = /^(\d+)([smhd])$/;
    if (!regex.test(window)) {
      throw new Error(`Invalid window: ${window}`);
    }
    const [, valueStr, unit] = window.match(regex)!;
    const value = parseInt(valueStr);
    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 1000 * 60;
      case "h":
        return value * 1000 * 60 * 60;
      case "d":
        return value * 1000 * 60 * 60 * 24;
      default:
        throw new Error(`Invalid window unit: ${unit}`);
    }
  }

  /**
   * Ingest a new event
   * @param table
   * @param event
   */
  public async ingest(table: string, ...events: Event[]): Promise<void> {
    this.validateTableName(table);
    await Promise.all(
      events.map(async (event) => {
        const time = event.time ?? Date.now();
        // Bucket is a unix timestamp in milliseconds marking the beginning of a day
        const bucket = Math.floor(time / this.bucketSize) * this.bucketSize;
        const key = [this.prefix, table, bucket].join(":");

        await this.redis.hincrby(
          key,
          JSON.stringify({
            ...event,
            time: undefined,
          }),
          1,
        );
      }),
    );
  }

  async count<TFilter extends (keyof Omit<Event, "time">)[]>(
    table: string,
    opts?: {
      filter?: TFilter;
      cutoff?: number;
    },
  ): Promise<{ time: number; [key: keyof Omit<Event, "time">]: number }[]> {
    this.validateTableName(table);
    const keys: string[] = [];
    let cursor = 0;
    do {
      const [nextCursor, found] = await this.redis.scan(cursor, {
        match: [this.prefix, table, "*"].join(":"),
        count: 1000,
      });

      cursor = nextCursor;
      for (const key of found) {
        const timestamp = parseInt(key.split(":").pop()!);
        // Take all the keys that at least overlap with the given timestamp
        if (timestamp >= (opts?.cutoff ?? 0)) {
          keys.push(key);
        }
      }
    } while (cursor !== 0);

    const days = await Promise.all(
      keys.sort().map(async (key) => {
        const fields = await this.redis.hgetall<Record<string, number>>(key);
        if (!fields) {
          return {};
        }
        const day = { time: Key.fromString(key).bucket } as { time: number } & {
          [key: keyof Omit<Event, "time">]: Record<string, number>;
        };

        for (const [field, count] of Object.entries(fields)) {
          const r = JSON.parse(field);
          for (const [k, v] of Object.entries(r) as [string, string][]) {
            if (opts?.filter && !opts.filter.includes(k)) {
              continue;
            }
            if (!day[k]) {
              day[k] = {};
            }
            if (!day[k][v]) {
              day[k][v] = 0;
            }
            day[k][v] += count;
          }
        }
        return day;
      }),
    );
    return days as any;
  }

  async query<TWhere extends keyof Omit<Event, "time">, TFilter extends keyof Omit<Event, "time">>(
    table: string,
    opts?: {
      where?: Record<TWhere, unknown>;
      filter?: TFilter[];
      /**
       * The range of timestamps to query. If not specified, all buckets are loaded.
       * The range is inclusive.
       * The first element is the start of the range, the second element is the end of the range.
       *
       * In milliseconds
       */
      range?: [number] | [number, number];
    },
  ): Promise<{ time: number; [key: keyof Omit<Event, "time">]: number }[]> {
    this.validateTableName(table);
    const now = Date.now();

    const keys: string[] = [];
    let cursor = 0;
    const match = [this.prefix, table, "*"].join(":");
    do {
      const [nextCursor, found] = await this.redis.scan(cursor, {
        match,
      });

      cursor = nextCursor;
      for (const key of found) {
        const timestamp = parseInt(key.split(":").pop()!);
        // Delete keys that are older than the retention period
        if (this.retention && timestamp < now - this.retention) {
          await this.redis.del(key);
          continue;
        }
        // Take all the keys that at least overlap with the given range
        if (opts?.range && (timestamp < opts.range[0] || (opts.range[1] && timestamp > opts.range[1]))) {
          continue;
        }
        keys.push(key);
      }
    } while (cursor !== 0);

    const days = await Promise.all(
      keys.sort().map(async (key) => {
        const fields = await this.redis.hgetall<Record<string, number>>(key);
        if (!fields) {
          return {};
        }
        const day = { time: Key.fromString(key).bucket } as { time: number } & {
          [key: keyof Omit<Event, "time">]: Record<string, number>;
        };

        for (const [field, count] of Object.entries(fields)) {
          const r = JSON.parse(field);

          let skip = false;
          if (opts?.where) {
            for (const [requiredKey, requiredValue] of Object.entries(opts.where)) {
              if (!(requiredKey in r)) {
                skip = true;
                break;
              }
              if (r[requiredKey] !== requiredValue) {
                skip = true;
                break;
              }
            }
          }
          if (skip) {
            continue;
          }
          for (const [k, v] of Object.entries(r) as [string, string][]) {
            // @ts-ignore
            if (opts?.filter && !opts.filter.includes(k)) {
              continue;
            }
            if (!day[k]) {
              day[k] = {};
            }
            if (!day[k][v]) {
              day[k][v] = 0;
            }
            day[k][v] += count;
          }
        }
        return day;
      }),
    );
    return days as any;
  }
}
