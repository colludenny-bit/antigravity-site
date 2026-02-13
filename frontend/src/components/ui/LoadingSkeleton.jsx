import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Loading Skeleton Component
 * Provides visual feedback while content is loading
 */
export const Skeleton = ({ className, variant = 'default', ...props }) => {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-white/5",
                variant === 'shimmer' && "relative overflow-hidden after:absolute after:inset-0 after:translate-x-[-100%] after:animate-[shimmer_2s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent",
                variant === 'pulse' && "animate-pulse-slow",
                className
            )}
            {...props}
        />
    );
};

/**
 * Card Skeleton
 */
export const CardSkeleton = ({ className }) => {
    return (
        <div className={cn("p-4 rounded-xl bg-white/5 border border-white/10", className)}>
            <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" variant="shimmer" />
                <Skeleton className="h-3 w-1/2" variant="shimmer" />
                <Skeleton className="h-24 w-full mt-4" variant="shimmer" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 flex-1" variant="shimmer" />
                    <Skeleton className="h-8 flex-1" variant="shimmer" />
                </div>
            </div>
        </div>
    );
};

/**
 * Chart Skeleton
 */
export const ChartSkeleton = ({ className, height = "h-64" }) => {
    return (
        <div className={cn("p-4 rounded-xl bg-white/5 border border-white/10", className)}>
            <Skeleton className="h-4 w-1/3 mb-4" variant="shimmer" />
            <Skeleton className={cn(height, "w-full")} variant="shimmer" />
        </div>
    );
};

/**
 * Table Skeleton
 */
export const TableSkeleton = ({ rows = 5, cols = 4, className }) => {
    return (
        <div className={cn("space-y-2", className)}>
            {/* Header */}
            <div className="flex gap-4 pb-3 border-b border-white/10">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-3 flex-1" variant="shimmer" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-4 py-2">
                    {Array.from({ length: cols }).map((_, colIndex) => (
                        <Skeleton key={colIndex} className="h-4 flex-1" variant="shimmer" />
                    ))}
                </div>
            ))}
        </div>
    );
};

/**
 * Dashboard Grid Skeleton
 */
export const DashboardSkeleton = () => {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" variant="shimmer" />
                <Skeleton className="h-4 w-96" variant="shimmer" />
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                    <CardSkeleton key={i} />
                ))}
            </div>

            {/* Main Chart */}
            <ChartSkeleton height="h-96" />

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CardSkeleton />
                <CardSkeleton />
            </div>
        </div>
    );
};

// Add shimmer animation to CSS
const style = document.createElement('style');
style.textContent = `
  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(style);

export default Skeleton;
