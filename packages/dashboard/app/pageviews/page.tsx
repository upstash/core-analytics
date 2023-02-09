import { Redis } from "@upstash/redis";
import { Card, Metric, Text, Title, BarList, Flex, Col, Block, ColGrid } from "@tremor/react";
import { Chart } from "./main-chart";
import Link from "next/link";
import { Analytics } from "@upstash/analytics";

const analytics = new Analytics({
  redis: Redis.fromEnv(),
  window: "15m",
});

export const relative = 15;
export default async function Page() {
  const res = await analytics.query("pageviews");
  const viewsOverTime = res.map((v) => ({
    time: v.time,
    value: Object.values(v.pathname ?? {}).reduce((sum, c) => sum + c, 0),
  }));

  const viewsByCountry = res.reduce((countries, b) => {
    Object.entries(b.country ?? {}).forEach(([country, count]) => {
      countries[country] = countries[country] ?? 0;
      countries[country] += count;
    });
    return countries;
  }, {} as Record<string, number>);

  const viewsByPath = res.reduce((paths, b) => {
    Object.entries(b.pathname ?? {}).forEach(([pathname, count]) => {
      paths[pathname] = paths[pathname] ?? 0;
      paths[pathname] += count;
    });
    return paths;
  }, {} as Record<string, number>);
  console.log(JSON.stringify({ viewsByCountry }, null, 2));

  const format = (number: number) => Intl.NumberFormat("us", { notation: "compact" }).format(number).toString();

  return (
    <div className="relative">
      <header className="font-display bg-gradient-to-tr from-neutral-100 via-white to-neutral-200">
        <div className="relative px-6 lg:px-8">
          <div className="max-w-3xl py-4 mx-auto md:py-8 ">
            <h1 className="text-4xl font-bold text-neutral-900 sm:text-center sm:text-4xl hover:underline">
              @upstash/analytics/pageviews
            </h1>
          </div>
        </div>
      </header>
      <main className="py-8 border-t lg:py-16 border-neutral-200">
        <div className="container mx-auto">
          <ColGrid numCols={1} numColsMd={2} gapX="gap-x-8" gapY="gap-y-8">
            <Col numColSpan={2}>
              <Card>
                <Title>Views in last 7 days</Title>
                <Flex justifyContent="justify-start" alignItems="items-baseline" spaceX="space-x-2">
                  <Metric>{viewsOverTime.reduce((total, c) => total + c.value, 0)}</Metric>
                  <Text>Total views</Text>
                </Flex>
                {JSON.stringify(viewsOverTime, null, 2)}
                {/* <Chart data={viewsOverTime} />    */}
              </Card>
            </Col>

            <Col numColSpan={1}>
              <Card>
                <div className="h-72">
                  <Title>Top Pages</Title>

                  <BarList
                    data={Object.entries(viewsByPath).map(([country, count]) => ({
                      key: country,
                      name: country,
                      value: count,
                    }))}
                    valueFormatter={format}
                    marginTop="mt-2"
                  />
                </div>
              </Card>
            </Col>
            <Col numColSpan={1}>
              <Card>
                <div className="h-72">
                  <Title>Top Countries</Title>

                  <BarList
                    data={Object.entries(viewsByCountry).map(([country, count]) => ({
                      key: country,
                      name: country,
                      value: count,
                    }))}
                    valueFormatter={format}
                    marginTop="mt-2"
                  />
                </div>
              </Card>
            </Col>
          </ColGrid>
        </div>
      </main>
    </div>
  );
}
