import React from 'react';
import { Timer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from './badge';

export const WeeklyBiasScale = ({ data, mini = false, showWrapper = true, trigger = true }) => {
    if (!data || data.length === 0) return null;

    return (
        <div className={cn(
            "relative w-full",
            mini ? "py-2" : (showWrapper ? "bg-white/[0.02] border border-white/10 rounded-[40px] p-8" : "")
        )}>
            {!mini && showWrapper && (
                <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-3">
                        <Timer className="w-5 h-5 text-[#00D9A5]" />
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Rolling 4-Week Bias Distribution</h4>
                    </div>
                    <Badge className="bg-[#00D9A5]/10 text-[#00D9A5] border-[#00D9A5]/20 font-black tracking-widest uppercase text-[10px]">
                        Last Update: {data[data.length - 1]?.label}
                    </Badge>
                </div>
            )}

            {/* Percentages Row - visible only if NOT mini or if using absolute positioning above bars */}
            {!mini && (
                <div className={cn(
                    "flex justify-between relative gap-2 mb-2",
                    "px-4"
                )}>
                    {data.map((item, i) => (
                        <div key={`pct-${i}`} className="flex-1 flex justify-center">
                            <span className={cn(
                                "font-black tracking-tight text-2xl",
                                !item.isCurrent ? "text-[#00D9A5] drop-shadow-[0_0_10px_rgba(0,217,165,0.4)]" : "text-white/40"
                            )}>
                                {item.value}%
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Bars Row - aligned at bottom */}
            <div className={cn(
                "flex items-end justify-between relative gap-2",
                mini ? "h-[180px] px-1 max-w-[540px] mx-auto" : "h-[180px] px-4"
            )}>
                {data.map((item, i) => (
                    <div key={i} className={cn(
                        "flex flex-col items-center flex-1 h-full justify-end"
                    )}>
                        {/* Bar Container */}
                        <div className={cn(
                            "relative w-full flex justify-center",
                            mini ? "max-w-[70px]" : "max-w-[80px]"
                        )}>
                            {/* Glowing Top Cap - for past weeks */}
                            {!item.isCurrent && (
                                <div
                                    className={cn(
                                        "absolute top-0 left-0 right-0 h-[3px] z-10 bg-[#00D9A5]",
                                        mini ? "shadow-[0_0_8px_#00D9A5]" : "shadow-[0_0_30px_#00D9A5]"
                                    )}
                                />
                            )}

                            {/* Percentage Label - Outside Bar for Mini Mode */}
                            {mini && (
                                <span className={cn(
                                    "absolute bottom-full mb-1 left-1/2 -translate-x-1/2 font-black tracking-tight text-base whitespace-nowrap z-20",
                                    !item.isCurrent ? "text-[#00D9A5] drop-shadow-[0_0_8px_rgba(0,217,165,0.6)]" : "text-white/40"
                                )}>
                                    {item.value}%
                                </span>
                            )}

                            {/* Bar Body */}
                            <div
                                className={cn(
                                    "w-full transition-all duration-[1800ms] ease-out relative overflow-hidden",
                                    mini ? "rounded-t-md" : "rounded-t-2xl",
                                    !item.isCurrent
                                        ? "bg-gradient-to-t from-[#00D9A5]/5 to-[#00D9A5]/50 border-x border-t border-[#00D9A5]/30"
                                        : "bg-[#0A0E14] border-x border-t border-white/10"
                                )}
                                style={{ height: trigger ? `${item.value * (mini ? 2.2 : 1.6)}px` : '4px' }}
                            >
                                {item.isCurrent && (
                                    <div className="absolute inset-0 opacity-20 pointer-events-none"
                                        style={{
                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #00D9A5 5px, #00D9A5 10px)',
                                            backgroundSize: '12px 12px'
                                        }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Week Label */}
                        {/* Week Label */}
                        <div className={cn(
                            "flex flex-col items-center",
                            mini ? "mt-1" : "mt-3"
                        )}>
                            <span className={cn(
                                "font-black uppercase tracking-[0.3em]",
                                mini ? "text-[12px]" : "text-[10px]",
                                !item.isCurrent ? "text-[#00D9A5]" : "text-white/40"
                            )}>
                                {item.label}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div >
    );
};
