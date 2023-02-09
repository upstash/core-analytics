"use client";

import { AreaChart } from "@tremor/react";

type Props = {
    data: {
        time: number;
        value: number;
    }[];
};

export const Chart: React.FC<Props> = ({ data }) => {
    return (
        <AreaChart
            data={data.map((d) => ({
                time: new Date(d.time).toLocaleString(),
                Views: d.value,
            }))}
            categories={Object.keys(data[0]).filter((k) => k !== "time")}
            dataKey="time"
        />
    );
};