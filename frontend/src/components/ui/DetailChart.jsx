import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export const DetailChart = ({
    data,
    color = '#00D9A5',
    height = 300,
    showgrid = false
}) => {
    if (!data || data.length === 0) return null;

    // Format Y-axis values (e.g., 30k)
    const formatYAxis = (tickItem) => {
        return (tickItem / 1000).toFixed(0) + 'k';
    };

    return (
        <div style={{ width: '100%', height: height }}>
            <ResponsiveContainer>
                <AreaChart
                    data={data}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {showgrid && (
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="rgba(255,255,255,0.05)"
                        />
                    )}

                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600 }}
                        tickMargin={10}
                        minTickGap={30}
                    />

                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600 }}
                        tickFormatter={formatYAxis}
                        domain={['auto', 'auto']}
                        width={40}
                    />

                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-[#0B0F17]/90 border border-white/10 rounded-xl p-3 shadow-xl backdrop-blur-md">
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">{label}</p>
                                        <p className="text-sm font-black text-white">
                                            {(payload[0].value / 1000).toFixed(1)}k <span className="text-[10px] text-white/40 font-bold uppercase">Contracts</span>
                                        </p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />

                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                        filter="url(#glow)"
                        animationDuration={1500}
                        animationEasing="ease-out"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
