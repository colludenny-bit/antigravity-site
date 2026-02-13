import React from 'react';
import { cn } from '../../lib/utils';

/**
 * TechTable - Clean technical table component
 * Inspired by staking dashboard "Trade History" design
 */
export const TechTable = ({
    columns,
    data,
    className,
    onRowClick,
    emptyMessage = 'No data available'
}) => {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center py-8 text-white/40 text-sm">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={cn("overflow-x-auto", className)}>
            <table className="tech-table">
                <thead>
                    <tr>
                        {columns.map((col, i) => (
                            <th
                                key={i}
                                className={cn(col.align === 'right' && 'text-right')}
                                style={{ width: col.width }}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, rowIndex) => (
                        <tr
                            key={rowIndex}
                            onClick={() => onRowClick?.(row, rowIndex)}
                            className={cn(onRowClick && 'cursor-pointer')}
                        >
                            {columns.map((col, colIndex) => (
                                <td
                                    key={colIndex}
                                    className={cn(col.align === 'right' && 'text-right')}
                                >
                                    {col.render ? col.render(row[col.key], row, rowIndex) : row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

/**
 * TechTableBadge - Status badge for table cells
 */
export const TechTableBadge = ({
    status,
    children
}) => {
    const statusStyles = {
        success: 'bg-[#00D9A5]/10 text-[#00D9A5] border-[#00D9A5]/20',
        pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        failed: 'bg-red-500/10 text-red-400 border-red-500/20',
        default: 'bg-white/5 text-white/60 border-white/10'
    };

    return (
        <span className={cn(
            "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border",
            statusStyles[status] || statusStyles.default
        )}>
            {children}
        </span>
    );
};

/**
 * TechTableRow - Custom styled row component
 */
export const TechTableRow = ({
    children,
    highlight = false,
    className
}) => (
    <tr className={cn(
        "transition-colors",
        highlight && "bg-[#00D9A5]/5",
        className
    )}>
        {children}
    </tr>
);

/**
 * TechTableTabs - Tab header for table sections
 */
export const TechTableTabs = ({
    tabs,
    activeTab,
    onTabChange,
    className
}) => (
    <div className={cn("tech-tabs", className)}>
        {tabs.map((tab) => (
            <button
                key={tab.value}
                onClick={() => onTabChange(tab.value)}
                className={cn(
                    "tech-tab flex items-center gap-1.5",
                    activeTab === tab.value && "tech-tab-active"
                )}
            >
                {tab.icon && tab.icon}
                {tab.label}
            </button>
        ))}
    </div>
);

export default TechTable;
