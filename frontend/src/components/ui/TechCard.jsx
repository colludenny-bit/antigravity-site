import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * TechCard - Minimal technical card component
 * Inspired by staking dashboard design with subtle borders and teal accents
 */
export const TechCard = ({
    children,
    className,
    to,
    onClick,
    active = false,
    glow = false,
    ...props
}) => {
    const cardClasses = cn(
        "tech-card p-4",
        active && "tech-card-active",
        glow && "hover:shadow-[0_0_30px_rgba(0,217,165,0.15)]",
        className
    );

    const content = (
        <motion.div
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={cardClasses}
            onClick={onClick}
            {...props}
        >
            {children}
        </motion.div>
    );

    if (to) {
        return <Link to={to}>{content}</Link>;
    }

    return content;
};

/**
 * TechCardHeader - Header section for TechCard
 */
export const TechCardHeader = ({
    icon: Icon,
    title,
    subtitle,
    action,
    iconColor = '#00D9A5',
    className
}) => (
    <div className={cn("flex items-center justify-between mb-4", className)}>
        <div className="flex items-center gap-3">
            {Icon && (
                <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                        background: `rgba(0, 217, 165, 0.1)`,
                        border: `1px solid rgba(0, 217, 165, 0.2)`
                    }}
                >
                    <Icon className="w-4 h-4" style={{ color: iconColor }} />
                </div>
            )}
            <div>
                <p className="text-sm font-medium text-white/90">{title}</p>
                {subtitle && <p className="text-xs text-white/40">{subtitle}</p>}
            </div>
        </div>
        {action || <ChevronRight className="w-4 h-4 text-white/30" />}
    </div>
);

/**
 * TechMetric - Display a metric with label and value
 */
export const TechMetric = ({
    label,
    value,
    change,
    changeType = 'neutral', // 'up', 'down', 'neutral'
    size = 'default', // 'small', 'default', 'large'
    className
}) => {
    const valueSize = {
        small: 'text-lg',
        default: 'text-2xl',
        large: 'text-3xl'
    };

    const changeColor = {
        up: 'text-[#00D9A5]',
        down: 'text-red-400',
        neutral: 'text-white/50'
    };

    return (
        <div className={cn("tech-metric", className)}>
            <span className="tech-metric-label">{label}</span>
            <div className="flex items-baseline gap-2">
                <span className={cn("tech-metric-value", valueSize[size])}>{value}</span>
                {change && (
                    <span className={cn("text-sm font-medium", changeColor[changeType])}>
                        {changeType === 'up' && '+'}
                        {change}
                    </span>
                )}
            </div>
        </div>
    );
};

/**
 * TechBadge - Small status badge
 */
export const TechBadge = ({
    children,
    variant = 'default', // 'default', 'success', 'warning', 'danger'
    className
}) => {
    const variants = {
        default: 'tech-badge',
        success: 'tech-badge',
        warning: 'tech-badge-yellow',
        danger: 'tech-badge-red'
    };

    return (
        <span className={cn("tech-badge", variants[variant], className)}>
            {children}
        </span>
    );
};

export default TechCard;
