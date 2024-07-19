import { Redis } from "@upstash/redis";
import {
  Event,
  Window,
  AnalyticsConfig,
  Aggregate,
  SuccessResponse
} from "./types"
import {
  aggregateHourScript,
  getAllowedBlockedScript,
  getMostAllowedBlockedScript
} from "./scripts";

export class Analytics {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly bucketSize: number;

  constructor(config: AnalyticsConfig) {
    this.redis = config.redis;
    this.prefix = config.prefix ?? "@upstash/analytics";
    this.bucketSize = this.parseWindow(config.window);
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

  public getBucket(time?: number): number {
    const bucketTime = time ?? Date.now();
    // Bucket is a unix timestamp in milliseconds marking
    // the beginning of a window
    return Math.floor(bucketTime / this.bucketSize) * this.bucketSize;
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
        const bucket = this.getBucket(event.time);
        const key = [this.prefix, table, bucket].join(":");

        await this.redis.zincrby(
          key,
          1,
          JSON.stringify({
            ...event,
            time: undefined,
          })
        )
      }),
    );
  }

  protected formatBucketAggregate(
    rawAggregate: [SuccessResponse, number][],
    groupBy: string,
    bucket: number
  ): Aggregate {
    const returnObject: { [key: string]: { [key: string]: number } } = {};
    rawAggregate.forEach(([group, count]) => {
      if (groupBy == "success") {
        group = group === 1
          ? "true"
          : group === null
            ? "false"
            : group; // group can be "denyList"
      };
      returnObject[groupBy] = returnObject[groupBy] || {};
      returnObject[groupBy][(group ?? "null").toString()] = count;
    });
    return {time: bucket, ...returnObject} as Aggregate;
  }

  public async aggregateBucket(
    table: string,
    groupBy: string,
    timestamp?: number,
  ): Promise<Aggregate> {
    this.validateTableName(table);

    const bucket = this.getBucket(timestamp);
    const key = [this.prefix, table, bucket].join(":");

    const result = await this.redis.eval(
      aggregateHourScript,
      [key],
      [groupBy]
    ) as [SuccessResponse, number][];

    return this.formatBucketAggregate(result, groupBy, bucket)
  }

  public async aggregateBuckets(
    table: string,
    groupBy: string,
    bucketCount: number,
    timestamp?: number
  ): Promise<Aggregate[]> {
    this.validateTableName(table);

    let bucket = this.getBucket(timestamp)
    const promises = []
  
    for (let i = 0; i < bucketCount; i += 1) {
      promises.push(
        this.aggregateBucket(table, groupBy, bucket)
      )
      bucket = bucket - this.bucketSize
    }

    return Promise.all(promises)
  }

  public async aggregateBucketsWithPipeline(
    table: string,
    groupBy: string,
    bucketCount: number,
    timestamp?: number,
    maxPipelineSize?: number
  ): Promise<Aggregate[]> {
    this.validateTableName(table);

    maxPipelineSize = maxPipelineSize ?? 48
    let bucket = this.getBucket(timestamp);
    const buckets: number[] = []
    let pipeline = this.redis.pipeline();
    
    const pipelinePromises: Promise<[SuccessResponse, number][][]>[] = []
    for (let i = 1; i <= bucketCount; i += 1) {
      const key = [this.prefix, table, bucket].join(":");
      pipeline.eval(
        aggregateHourScript,
        [key],
        [groupBy]
      );
      buckets.push(bucket)
      bucket = bucket - this.bucketSize;

      if (i % maxPipelineSize == 0 || i == bucketCount) {
        pipelinePromises.push(pipeline.exec<[string, number][][]>())
        pipeline = this.redis.pipeline()
      }
    }
    const bucketResults = (await Promise.all(pipelinePromises)).flat()
    
    return bucketResults.map((result, index) => {
      return this.formatBucketAggregate(
        result,
        groupBy,
        buckets[index]
      )
    })
  }

  public async getAllowedBlocked(
    table: string,
    timestampCount: number,
    timestamp?: number,
  ): Promise<
    Record<string, {success: number, blocked: number}>
  > {
    this.validateTableName(table);
    
    const key = [this.prefix, table].join(":");
    const bucket = this.getBucket(timestamp)

    const result = await this.redis.eval(
      getAllowedBlockedScript,
      [key],
      [bucket, this.bucketSize, timestampCount]
    ) as (string | {identifier: string, success: boolean})[]


    const allowedBlocked: Record<string, {success: number, blocked: number}> = {}

    for (let i = 0; i < result.length; i += 2) {
      const info = result[i] as {identifier: string, success: boolean}
      const identifier: string = info.identifier;
      const count = +result[i + 1] // cast string to number;

      if (!allowedBlocked[identifier]) {
        allowedBlocked[identifier] = {"success":0, "blocked":0}
      }
      allowedBlocked[identifier][info.success ? "success" : "blocked"] = count
    }

    return allowedBlocked
  }

  /**
   * Fetches the most allowed & blocked and denied items.
   * 
   * @param table Ratelimit prefix to search for analytics
   * @param timestampCount Number of timestamps (24 for a day and 24 * 7 for a week)
   * @param itemCount Number of items to fetch from each category. If set to 30,
   *                  30 items will be fetched from each category. 90 items will be
   *                  returned in total if there are enough items in each category.
   * @param timestamp Most recent bucket timestamp to read from
   * @param checkAtMost Early finish parameter. Imagine that itemCount is set to 30.
   *                    If checkAtMost is set to 100, script will stop after checking
   *                    100 items even if there aren't 90 items yet.
   *                    Set to `itemCount * 5` by default.
   * @returns most allowed & blocked and denied items
   */
  public async getMostAllowedBlocked(
    table: string,
    timestampCount: number,
    itemCount: number,
    timestamp?: number,
    checkAtMost?: number
  ): Promise<
    {
      allowed: {identifier: string, count: number}[],
      ratelimited: {identifier: string, count: number}[]
      denied: {identifier: string, count: number}[]
    }
  > {
    this.validateTableName(table);

    const key = [this.prefix, table].join(":");
    const bucket = this.getBucket(timestamp)

    const checkAtMostValue = checkAtMost ?? itemCount * 5
    
    const [allowed, ratelimited, denied] = await this.redis.eval(
      getMostAllowedBlockedScript,
      [key],
      [bucket, this.bucketSize, timestampCount, itemCount, checkAtMostValue]
    ) as [string, {identifier: string, success: boolean}][][]

    return {
      allowed: this.toDicts(allowed),
      ratelimited: this.toDicts(ratelimited),
      denied: this.toDicts(denied)
    }
  }

  /**
   * convert ["a", 1, ...] to [{identifier: 1, count: 1}, ...]
   * @param array
   */
  protected toDicts (array: [string, {identifier: string, success: boolean}][]) {
    const dict: {identifier: string, count: number}[] = [];
    for (let i = 0; i < array.length; i += 1) {
        const count = +array[i][0] // cast string to number;
        const info = array[i][1]
        dict.push({
          identifier: info.identifier,
          count: count
        })
    }
    return dict;
  }
}
