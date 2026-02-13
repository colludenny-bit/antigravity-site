import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * SparkLine - Minimal sparkline chart component
 * Renders a small line/area chart for inline data visualization
 */
export const SparkLine = ({
    data = [30, 45, 25, 60, 40, 70, 55, 48],
    width = 80,
    height = 32,
    color = '#00D9A5',
    type = 'line', // 'line' | 'area' | 'bar'
    strokeWidth = 1.5,
    showDot = true,
    animated = true,
    className
}) => {
    if (!data || data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Generate points
    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((val - min) / range) * chartHeight;
        return { x, y, val };
    });

    const pathD = points.map((p, i) =>
        `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`
    ).join(' ');

    const areaD = `${pathD} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`;

    const lastPoint = points[points.length - 1];
    const isUp = data[data.length - 1] >= data[0];
    const finalColor = color || (isUp ? '#00D9A5' : '#EF4444');

    return (
        <svg
            width={width}
            height={height}
            className={cn("overflow-visible", className)}
        >
            <defs>
                <linearGradient id={`sparkGrad-${width}-${height}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={finalColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={finalColor} stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Area fill */}
            {type === 'area' && (
                <motion.path
                    d={areaD}
                    fill={`url(#sparkGrad-${width}-${height})`}
                    initial={animated ? { opacity: 0 } : {}}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                />
            )}

            {/* Line */}
            {(type === 'line' || type === 'area') && (
                <motion.path
                    d={pathD}
                    fill="none"
                    stroke={finalColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={animated ? { pathLength: 0, opacity: 0 } : {}}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.4, ease: "easeOut" }}
                />
            )}

            {/* Bars */}
            {type === 'bar' && points.map((p, i) => (
                <motion.rect
                    key={i}
                    x={p.x - 2}
                    y={p.y}
                    width={4}
                    height={height - padding - p.y}
                    fill={finalColor}
                    rx={1}
                    initial={animated ? { scaleY: 0 } : {}}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.6, delay: i * 0.08 }}
                    style={{ transformOrigin: 'bottom' }}
                />
            ))}

            {/* End dot */}
            {showDot && (type === 'line' || type === 'area') && (
                <motion.circle
                    cx={lastPoint.x}
                    cy={lastPoint.y}
                    r={3}
                    fill={finalColor}
                    initial={animated ? { scale: 0 } : {}}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5, delay: 1.0 }}
                    style={{ filter: `drop-shadow(0 0 4px ${finalColor})` }}
                />
            )}
        </svg>
    );
};

/**
 * GlowingChart - Premium chart with glowing line, data points, and tooltip
 * Like modern crypto dashboard cards
 */
export const GlowingChart = ({
    data = [30, 45, 35, 60, 50, 70, 55, 65],
    width = 150,
    height = 60,
    color = '#00D9A5',
    showPrice = true,
    priceLabel,
    animated = true,
    className
}) => {
    if (!data || data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const padding = 6;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Generate points
    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((val - min) / range) * chartHeight;
        return { x, y, val };
    });

    // Generate smooth bezier curve path
    const generateSmoothPath = (pts) => {
        if (pts.length < 2) return '';

        let path = `M ${pts[0].x},${pts[0].y}`;

        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;

            // Catmull-Rom to Cubic Bezier conversion
            const tension = 0.3;
            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;

            path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }

        return path;
    };

    const smoothPath = generateSmoothPath(points);
    const areaPath = `${smoothPath} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`;

    const lastPoint = points[points.length - 1];
    const highPoint = points.reduce((max, p) => p.y < max.y ? p : max, points[0]);
    const isUp = data[data.length - 1] >= data[0];
    const finalColor = color || (isUp ? '#00D9A5' : '#EF4444');

    // Generate unique ID for gradients
    const gradientId = `glow-${Math.random().toString(36).substr(2, 9)}`;

    return (
        <svg
            width={width}
            height={height}
            className={cn("overflow-visible", className)}
        >
            <defs>
                {/* Gradient fill */}
                <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={finalColor} stopOpacity="0.25" />
                    <stop offset="50%" stopColor={finalColor} stopOpacity="0.1" />
                    <stop offset="100%" stopColor={finalColor} stopOpacity="0" />
                </linearGradient>

                {/* Glow filter */}
                <filter id={`${gradientId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Area fill with gradient */}
            <motion.path
                d={areaPath}
                fill={`url(#${gradientId}-fill)`}
                initial={animated ? { opacity: 0 } : {}}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.0 }}
            />

            {/* Glowing line */}
            <motion.path
                d={smoothPath}
                fill="none"
                stroke={finalColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${gradientId}-glow)`}
                initial={animated ? { pathLength: 0, opacity: 0 } : {}}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.8, ease: "easeOut" }}
            />

            {/* Data point circles - show every other point */}
            {points.filter((_, i) => i % 2 === 1 || i === points.length - 1).map((point, idx) => (
                <motion.g key={idx}>
                    {/* Outer glow ring */}
                    <motion.circle
                        cx={point.x}
                        cy={point.y}
                        r={5}
                        fill="transparent"
                        stroke={finalColor}
                        strokeWidth={1}
                        strokeOpacity={0.3}
                        initial={animated ? { scale: 0 } : {}}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.8 + idx * 0.15 }}
                    />
                    {/* Inner dot */}
                    <motion.circle
                        cx={point.x}
                        cy={point.y}
                        r={3}
                        fill="#0a0a0f"
                        stroke={finalColor}
                        strokeWidth={1.5}
                        initial={animated ? { scale: 0 } : {}}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.8 + idx * 0.15 }}
                        style={{ filter: `drop-shadow(0 0 3px ${finalColor})` }}
                    />
                </motion.g>
            ))}

            {/* Price tooltip at highest point */}
            {showPrice && priceLabel && (
                <motion.g
                    initial={animated ? { opacity: 0, y: 5 } : {}}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 1.2 }}
                >
                    <rect
                        x={highPoint.x - 20}
                        y={highPoint.y - 20}
                        width={40}
                        height={16}
                        rx={4}
                        fill="rgba(0,217,165,0.15)"
                        stroke={finalColor}
                        strokeWidth={0.5}
                        strokeOpacity={0.4}
                    />
                    <text
                        x={highPoint.x}
                        y={highPoint.y - 9}
                        textAnchor="middle"
                        fill={finalColor}
                        fontSize="8"
                        fontWeight="600"
                        fontFamily="monospace"
                    >
                        {priceLabel}
                    </text>
                </motion.g>
            )}
        </svg>
    );
};

/**
 * SparkLineWithValue - SparkLine with value display
 */
export const SparkLineWithValue = ({
    data,
    value,
    change,
    label,
    color,
    width = 100,
    height = 40,
    className
}) => {
    const isUp = change >= 0;
    const displayColor = color || (isUp ? '#00D9A5' : '#EF4444');

    return (
        <div className={cn("flex items-center gap-3", className)}>
            <SparkLine
                data={data}
                color={displayColor}
                width={width}
                height={height}
                type="area"
            />
            <div className="flex flex-col">
                {label && <span className="text-[10px] text-white/40 uppercase">{label}</span>}
                <span className="text-lg font-bold" style={{ color: displayColor }}>
                    {value}
                </span>
                {change !== undefined && (
                    <span className={cn(
                        "text-xs font-medium",
                        isUp ? "text-[#00D9A5]" : "text-red-400"
                    )}>
                        {isUp ? '+' : ''}{change}%
                    </span>
                )}
            </div>
        </div>
    );
};

/**
 * MiniDonut - Simple donut chart for percentage display
 * Supports responsive sizing with size="100%" or fixed numbers
 */
export const MiniDonut = ({
    value = 50,
    size = 48,
    strokeWidth = 5,
    color = '#00D9A5',
    showValue = true,
    className
}) => {
    // Handle responsive sizing - use a fixed internal size for calculations
    const isResponsive = typeof size === 'string';
    const internalSize = isResponsive ? 100 : size;
    const adjustedStrokeWidth = isResponsive ? (strokeWidth * 100 / 80) : strokeWidth;

    const radius = (internalSize - adjustedStrokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;

    return (
        <div
            className={cn("relative", className)}
            style={isResponsive ? { width: '100%', height: '100%' } : { width: size, height: size }}
        >
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${internalSize} ${internalSize}`}
                className="transform -rotate-90"
                preserveAspectRatio="xMidYMid meet"
            >
                {/* Background circle */}
                <circle
                    cx={internalSize / 2}
                    cy={internalSize / 2}
                    r={radius}
                    fill="transparent"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={adjustedStrokeWidth}
                />
                {/* Progress circle */}
                <motion.circle
                    cx={internalSize / 2}
                    cy={internalSize / 2}
                    r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={adjustedStrokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.8, ease: "easeOut" }}
                />
            </svg>
            {showValue && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <span
                        className="text-xs font-bold"
                        style={{ color }}
                    >
                        {Math.round(value)}%
                    </span>
                </div>
            )}
        </div>
    );
};

export default SparkLine;
