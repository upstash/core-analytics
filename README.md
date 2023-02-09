<div align="center">
    <h1 align="center">@upstash/core-analytics</h1>
    <h5>Serverless Analytics for Redis</h5>
</div>

<br/>


This library offers some low level building blocks to record and analyze custom events in Redis.
It's main purpose is to provide a simple way to record and query events in Redis without having to worry about the underlying data structure so we can build more advanced analytics features on top of it.

## Features

- **TODO:** stuff

<br/>


## Quickstart


1. Create a redis database

Go to [console.upstash.com/redis](https://console.upstash.com/redis) and create
a new global database.

After creating the db, copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to your `.env` file.

3. Install `@upstash/analytics` in your project

```bash
npm install @upstash/analytics @upstash/redis
```

4. Create an analytics client

```ts
import { Analytyics } from "@upstash/analytics";
import { Redis } from "@upstash/redis";

const analytics = new Analytics({
  redis: Redis.fromEnv(),
  window: "1d",
});
```


5. Ingest some events

An event consists of a `time` field and any additional key-value pairs that you can use to record any information you want.

```ts
const event = {
  time: Date.now() // optional (default: Date.now())
  userId: "chronark",
  page: "/auth/login",
  country: "DE",
}

await analytics.ingest("pageviews", event);
```

4. Query your events

```ts

const result = await analytics.query("pageviews");

```

## Development

This project uses `pnpm` for dependency management.

#### Install dependencies

```bash
pnpm install
```

#### Build

```bash
pnpm build
```


## Database Schema

All metrics are stored in Redis `Hash` data types and sharded into buckets based on the `window` option.
```
@upstash/analytics:{TABLE}:{TIMESTAMP}
```
- `TABLE` is a namespace to group events together. ie for managing multiple projects int a single database
- `TIMESTAMP` is the starting timestamp of each window

The field of each hash is a serialized JSON object with the user's event data and the value is the number of times this event has been recorded.

```json
{
  '{"page": "/auth/login","country": "DE"}': 5,
  '{"page": "/auth/login","country": "US"}': 2
}
```
