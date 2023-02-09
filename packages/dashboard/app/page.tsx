

import { Redis } from "@upstash/redis";
import { Card, Metric, Text, Title, BarList, Flex, Col, Block, ColGrid } from "@tremor/react";
import { Chart } from "@/app/pageviews/main-chart";
import Link from "next/link";
import { Analytics } from "@/../sdk/dist";


const examples = [
    {
        name: 'Analytics',
        description:
            'Core analytics, low level building blocks for your own custom analytics solution.',
        href: '/core',
    },
    {
        name: 'Page Views',
        description:
            'Track pageviews, geo location, referrer, and more. Get a full picture of your users and their behavior.',
        href: '/pageviews',
    },
    {
        name: 'Auth',
        description:
            'Full insights into your users. Track signups, logins, and more. ',
        href: '/auth',
    },

]

export default async function Page() {

    const format = (number: number) => Intl.NumberFormat("us", { notation: "compact" }).format(number).toString();

    return (
        <div className="relative">
            <header className="font-display bg-gradient-to-tr from-neutral-100 via-white to-neutral-200">
                <div className="relative px-6 lg:px-8">
                    <div className="max-w-3xl py-12 md:py-24 mx-auto ">
                        <Link href="https://github.com/upstash/analytics" target="_blank"><h1 className="text-4xl font-bold text-neutral-900 sm:text-center sm:text-6xl hover:underline">@upstash/analytics</h1></Link>
                        <p className="mt-6 text-neutral-600 sm:text-center">
                            Powered by{" "}
                            <Link className="underline duration-150 hover:text-neutral-900" href="https://upstash.com">
                                Upstash Redis
                            </Link>{" "}
                            and{" "}
                            <Link className="underline duration-150 hover:text-neutral-900" href="https://tremor.so">
                                Tremor
                            </Link>{" "}
                        </p>
                    </div>
                </div>
            </header>
            <main className="py-8 border-t lg:py-16 border-neutral-200">

                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="mx-auto max-w-2xl lg:text-center">
                       
                        <p className="mt-6 text-lg leading-8 text-neutral-600">
                           Choose from presets for common use cases or build your own custom analytics solution.
                        </p>
                    </div>
                    <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
                        <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
                            {examples.map((e) => (
                                <Link href={e.href} key={e.name} className="flex flex-col border border-neutral-300 rounded-lg p-4 hover:border-neutral-400 duration-150">
                                    <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-neutral-900">
                                        {e.name}
                                    </dt>
                                    <dd className="mt-4 flex flex-auto  flex-col text-base leading-7 text-neutral-600">
                                        <p className="flex-auto">{e.description}</p>
                                        <p className="mt-6">
                                            <span className="text-base font-semibold leading-7 text-neutral-600 hover:text-neutral-900 duration-150">
                                                Learn more <span aria-hidden="true">→</span>
                                            </span>
                                        </p>
                                    </dd>
                                </Link>
                            ))}
                        </dl>
                    </div>
                </div>
            </main>
        </div>
    );
}